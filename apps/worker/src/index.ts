import { randomUUID } from "node:crypto";
import { createCdaClient, TokenBucket } from "@cqd/cda-client";
import { budgetPerHour, keys, type WorkerStatus } from "@cqd/schemas";
import { BudgetGovernor } from "./budget";
import { createKeyInfoMonitor } from "./key-info";
import { WorkerCache } from "./cache";
import { findWorkspaceRoot, loadEnv, readConfig } from "./config";
import { loadDemoSamples, seedDemo } from "./demo";
import { createHttpServer } from "./http";
import { JevClassifier } from "./jev/classifier";
import { createJevClient } from "./jev/client";
import { createLogger } from "./log";
import { Poller } from "./poller";
import { StreamHub } from "./stream/hub";
import { runStream } from "./stream/sources";

const VERSION = "0.1.0";
/** Lock TTL. A worker killed without cleanup (e.g. tsx watch on Windows) hands over within this window. */
const LOCK_TTL_MS = 15_000;

async function main(): Promise<void> {
  const envFiles = loadEnv();
  const config = readConfig();
  const workerId = randomUUID().slice(0, 8);
  const log = createLogger(config.logLevel, { svc: "worker", worker: workerId });
  log.info("starting", {
    version: VERSION,
    envFiles,
    keyConfigured: config.apiKey !== null,
    ratePerMinute: config.ratePerMinute,
    dailyBudget: config.dailyBudget,
    streamSource: config.streamSource,
    scheduledCallsPerHour: budgetPerHour().total,
    jev: { enabled: config.jev.enabled, keyConfigured: config.jev.apiKey !== null, model: config.jev.model },
  });

  const cache = new WorkerCache(log.child({ component: "cache" }), config.redisUrl);
  await cache.connect();
  const budget = new BudgetGovernor(cache, config.dailyBudget);
  await cache.restoreCounters(budget.today());

  const limiter = new TokenBucket({ ratePerMinute: config.ratePerMinute, burst: 1 });
  const client = createCdaClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    limiter,
    onAttempt: (e) => {
      // Only keyed requests count against the CDA daily quota.
      if (!e.authed) return;
      cache.countCall(budget.today(), e.path, e.status === null ? (e.kind ?? "network") : String(e.status));
    },
  });

  // TypeSafe Jev classifier (worker only; the web app never sees TYPESAFE_API_KEY).
  const jev = createJevClient({ config: config.jev, cache, log: log.child({ component: "jev" }) });
  const classifier = new JevClassifier({ jev, cache, log: log.child({ component: "jev" }), verdictIntervalMs: config.jev.verdictIntervalMs });

  // Tier and limits of the key (account-wide usage includes other tooling on the same key).
  // Read before polling starts so tier gating and the limiter rate apply from the first call.
  const keyInfo = createKeyInfoMonitor({ client, budget, limiter, configuredRate: config.ratePerMinute, log: log.child({ component: "key-info" }) });
  await keyInfo.refresh();

  // ---- demo mode ---------------------------------------------------------------
  // No CDA key: every keyed panel shows the committed samples in docs/samples/ instead of an
  // empty state. Jev panels show their samples when the classifier is off, and also whenever
  // CDA itself is in demo (no point paying to classify saved data).
  const samples = loadDemoSamples(findWorkspaceRoot(), log.child({ component: "demo" }));
  const demoCda = samples !== null && !client.hasKey;
  const demoJev = samples !== null && (!jev.configured || demoCda);
  if (demoCda || demoJev) {
    log.warn("demo mode: serving saved samples", {
      cda: demoCda,
      jev: demoJev,
      capturedFrom: samples?.capturedFrom,
      capturedTo: samples?.capturedTo,
      hint: "set CDA_API_KEY (and TYPESAFE_API_KEY) in the repo-root .env and restart for live data; see /setup",
    });
  }

  const hub = new StreamHub();
  const poller = new Poller({
    client,
    cache,
    budget,
    log: log.child({ component: "poller" }),
    gexSymbols: config.gexSymbols,
    onDemandMax: config.onDemandMax,
    keyTier: () => budget.accountInfo?.tier ?? null,
    jevConfigured: () => jev.configured,
    demo: demoCda ? samples : null,
  });

  // ---- single-poller lock -------------------------------------------------
  // Two workers sharing one key would double the spend. With Redis up, only the lock
  // holder polls; without Redis there is nothing to coordinate on, so we just run.
  let leader = false;
  const tryLock = async (): Promise<boolean> => {
    const redis = cache.client;
    if (!redis) return true;
    try {
      const got = await redis.set(keys.lock, workerId, "PX", LOCK_TTL_MS, "NX");
      if (got === "OK") return true;
      const holder = await redis.get(keys.lock);
      if (holder === workerId) {
        await redis.pexpire(keys.lock, LOCK_TTL_MS);
        return true;
      }
      return false;
    } catch {
      return true;
    }
  };

  const streamAbort = new AbortController();
  let started = false;
  const startWork = async () => {
    if (started) return;
    started = true;
    if (samples && (demoCda || demoJev)) {
      const n = seedDemo(cache, samples, { cda: demoCda, jev: demoJev });
      log.info("demo samples seeded", { datasets: n });
    }
    await poller.start();
    void runStream({ source: config.streamSource, client, hub, log, signal: streamAbort.signal, replayEvents: () => samples?.streamEvents() ?? [] });
    if (!demoJev) await classifier.start();
    else if (jev.configured) log.info("Jev not called in demo mode: it would only classify saved samples");
  };

  const lockTimer = setInterval(async () => {
    const ok = await tryLock();
    if (ok && !leader) log.info("acquired poller lock");
    if (!ok && leader) log.warn("lost poller lock to another worker");
    leader = ok;
    if (leader) await startWork();
  }, 5_000);

  leader = await tryLock();
  if (leader) await startWork();
  else log.warn("another worker holds the poller lock; standing by", { lock: keys.lock });

  // ---- status + heartbeat ---------------------------------------------------
  const startedAt = new Date().toISOString();
  const status = (): WorkerStatus => {
    const now = Date.now();
    const today = budget.today(now);
    const counters = cache.counters(today);
    cache.pruneCounters(today);
    return {
      workerId,
      version: VERSION,
      startedAt,
      ts: new Date(now).toISOString(),
      keyConfigured: client.hasKey,
      cache: cache.kind,
      leader,
      account: budget.accountInfo
        ? {
            tier: budget.accountInfo.tier,
            requestsToday: budget.accountRequestsToday(now),
            dailyLimit: budget.accountInfo.dailyLimit,
            perMinuteLimit: budget.accountInfo.perMinuteLimit,
            checkedAt: new Date(budget.accountInfo.checkedAt).toISOString(),
          }
        : null,
      budget: {
        date: today,
        callsToday: counters.total,
        dailyBudget: budget.dailyBudget,
        paceLimit: budget.paceLimit(now),
        mode: budget.mode(now),
        stretch: budget.stretch(now),
        scheduledPerHour: client.hasKey ? budgetPerHour().total : 0,
        byDataset: counters.byDataset,
        byStatus: counters.byStatus,
        resetsAt: new Date(budget.resetsAt(now)).toISOString(),
      },
      limiter: limiter.snapshot(),
      stream: hub.status(),
      onDemand: { active: poller.activeDemand().length, max: config.onDemandMax, keys: poller.activeDemand() },
      datasets: poller.runtimeStatus(),
      jev: jev.status(),
      demo:
        demoCda || demoJev
          ? { cda: demoCda, jev: demoJev, static: false, capturedFrom: samples?.capturedFrom ?? null, capturedTo: samples?.capturedTo ?? null }
          : null,
    };
  };
  // Only the lock holder publishes the heartbeat the web app reads; a standby worker would
  // otherwise overwrite it with an idle status.
  const beat = () => {
    if (leader) void cache.setRaw(keys.heartbeat, JSON.stringify(status()), 20_000);
  };
  const heartbeat = setInterval(beat, 5_000);
  beat();

  let lastMode = budget.mode();
  const budgetTimer = setInterval(() => {
    const mode = budget.mode();
    if (mode !== lastMode) {
      const fields = { from: lastMode, to: mode, callsToday: budget.callsToday(), dailyBudget: config.dailyBudget, paceLimit: budget.paceLimit() };
      if (mode === "normal") log.info("budget governor back to normal", fields);
      else log.warn("budget governor changed mode", fields);
      lastMode = mode;
    }
  }, 30_000);

  // ---- HTTP -----------------------------------------------------------------
  const server = createHttpServer({ poller, hub, status, log: log.child({ component: "http" }), token: config.token, corsOrigin: config.corsOrigin });
  server.on("error", (err: NodeJS.ErrnoException) => {
    log.error("http server error", { error: err.message, code: err.code, port: config.port });
    if (err.code === "EADDRINUSE") process.exit(1);
  });
  server.listen(config.port, config.host, () => log.info("http listening", { url: `http://localhost:${config.port}`, routes: ["/healthz", "/status", "/data/:dataset", "/stream"] }));

  // ---- shutdown ---------------------------------------------------------------
  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info("shutting down", { signal });
    clearInterval(lockTimer);
    clearInterval(heartbeat);
    clearInterval(budgetTimer);
    keyInfo.stop();
    classifier.stop();
    poller.stop();
    streamAbort.abort();
    hub.close();
    server.close();
    server.closeAllConnections();
    const redis = cache.client;
    if (redis && leader) {
      const holder = await redis.get(keys.lock).catch(() => null);
      if (holder === workerId) await redis.del(keys.lock).catch(() => undefined);
    }
    await cache.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  console.error(JSON.stringify({ t: new Date().toISOString(), level: "error", svc: "worker", msg: "fatal", error: (err as Error).message }));
  process.exit(1);
});
