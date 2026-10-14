import { CdaError, type CdaClient } from "@cqd/cda-client";
import type { RelayedEvent } from "@cqd/schemas";
import { DelayedStreamResponse, StreamEvent } from "@cqd/schemas/validators";
import { createParser } from "eventsource-parser";
import type { StreamSource } from "../config";
import type { Logger } from "../log";
import type { StreamHub } from "./hub";

const SEC = 1_000;
const MIN = 60 * SEC;
/** Re-try the live stream this often after a tier / auth failure (auto mode plays the preview meanwhile). */
const LIVE_RECHECK_MS = 30 * MIN;
/** Abort and reconnect if the upstream is silent this long (CDA pings every 15 s). */
const IDLE_TIMEOUT_MS = 45 * SEC;
/** Delayed preview: poll cadence (CDA caches it for 60 s) and the playback lag we add. */
const DELAYED_POLL_MS = 60 * SEC;
const DELAYED_LAG_MS = 60 * SEC;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

class FatalStreamError extends Error {
  constructor(
    readonly kind: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * One SSE connection to CDA `/api/v1/stream`, reconnecting with `since_id` so no event is
 * lost. Resolves (does not throw) only on a fatal answer (401/402/403) or when aborted.
 */
async function runLive(client: CdaClient, hub: StreamHub, log: Logger, signal: AbortSignal): Promise<FatalStreamError | null> {
  let lastId: string | null = null;
  let failures = 0;
  while (!signal.aborted) {
    hub.setStatus({ source: "live", state: "connecting", message: failures > 0 ? `Reconnecting (attempt ${failures + 1})` : null, delayMs: null });
    const conn = new AbortController();
    const onAbort = () => conn.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await client.openStream({ query: { since_id: lastId }, lastEventId: lastId, signal: conn.signal });
      if (res.status === 401 || res.status === 402 || res.status === 403) {
        await res.body?.cancel().catch(() => undefined);
        const kind = res.status === 401 ? "unauthorized" : "pro_required";
        return new FatalStreamError(kind, res.status === 401 ? "CDA rejected the API key (401)" : `Live stream needs a Pro key (HTTP ${res.status})`);
      }
      if (!res.ok || !res.body) {
        await res.body?.cancel().catch(() => undefined);
        throw new Error(`HTTP ${res.status}`);
      }
      hub.setStatus({ state: "open", message: null });
      log.info("live stream connected", { sinceId: lastId });
      failures = 0;

      let lastActivity = Date.now();
      const watchdog = setInterval(() => {
        if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
          log.warn("live stream idle; reconnecting", { idleMs: Date.now() - lastActivity });
          conn.abort();
        }
      }, 5 * SEC);
      const parser = createParser({
        onEvent(msg) {
          lastActivity = Date.now();
          if (!msg.data) return;
          try {
            const parsed = StreamEvent.safeParse(JSON.parse(msg.data));
            if (!parsed.success) return;
            lastId = msg.id ?? String(parsed.data.id);
            hub.publish(parsed.data as RelayedEvent);
          } catch {
            /* ignore malformed frames */
          }
        },
        onComment() {
          lastActivity = Date.now();
        },
      });
      try {
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          lastActivity = Date.now();
          parser.feed(value);
        }
      } finally {
        clearInterval(watchdog);
      }
      if (!signal.aborted) log.warn("live stream ended; reconnecting", { lastId });
    } catch (err) {
      if (signal.aborted) break;
      if (err instanceof CdaError && err.kind === "no_api_key") return new FatalStreamError("no_api_key", err.message);
      failures += 1;
      log.warn("live stream error", { error: (err as Error).message, attempt: failures });
      hub.setStatus({ state: "error", message: (err as Error).message });
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
    await sleep(Math.min(60 * SEC, 1_000 * 2 ** Math.min(failures, 6)), signal);
  }
  return null;
}

/**
 * Keyless preview: polls `/api/v1/stream/delayed` (a 3-5 minute window that ended 30 minutes
 * ago) and replays the events at their original pace, so the tape UI can be built and
 * demoed without a Pro key. Events are flagged `preview: true`.
 */
async function runDelayed(client: CdaClient, hub: StreamHub, log: Logger, signal: AbortSignal): Promise<void> {
  const seen = new Set<string>();
  const seenOrder: string[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const clearTimers = () => {
    for (const t of timers) clearTimeout(t);
    timers.clear();
  };
  signal.addEventListener("abort", clearTimers, { once: true });
  hub.setStatus({ source: "delayed", state: "connecting", message: "Keyless 30-minute-delayed preview", delayMs: null });

  while (!signal.aborted) {
    const res = await client.get<unknown>("/api/v1/stream/delayed", { signal });
    if (signal.aborted) break;
    if (!res.ok) {
      hub.setStatus({ state: "error", message: `Preview unavailable: ${res.message}` });
      log.warn("delayed preview fetch failed", { kind: res.kind, message: res.message });
      await sleep(DELAYED_POLL_MS, signal);
      continue;
    }
    const parsed = DelayedStreamResponse.safeParse(res.data);
    if (!parsed.success) {
      hub.setStatus({ state: "error", message: "Preview payload did not match the expected shape" });
      log.warn("delayed preview validation failed", { issues: parsed.error.issues.slice(0, 3).map((i) => i.message) });
      await sleep(DELAYED_POLL_MS, signal);
      continue;
    }
    const d = parsed.data;
    const clockOffset = Date.now() - d.server_now;
    const now = Date.now();
    let scheduled = 0;
    for (const ev of [...d.events].sort((a, b) => a.ts - b.ts)) {
      const id = String(ev.id);
      if (seen.has(id)) continue;
      seen.add(id);
      seenOrder.push(id);
      if (seenOrder.length > 20_000) seen.delete(seenOrder.shift()!);
      const emitAt = ev.ts + d.delay_ms + DELAYED_LAG_MS + clockOffset;
      const delay = Math.max(0, emitAt - now);
      const t = setTimeout(() => {
        timers.delete(t);
        hub.publish({ ...(ev as RelayedEvent), preview: true });
      }, delay);
      timers.add(t);
      scheduled++;
    }
    hub.setStatus({ state: "open", message: "Keyless 30-minute-delayed preview", delayMs: d.delay_ms + DELAYED_LAG_MS });
    log.debug("delayed preview window", { events: d.events.length, scheduled, eventsPerMin: d.events_per_min });
    await sleep(DELAYED_POLL_MS, signal);
  }
  clearTimers();
}

/**
 * Chooses and supervises the stream source:
 *   auto    -> live when a key is set; on 401/402/403 play the delayed preview and retry live every 30 min
 *   live    -> live only
 *   delayed -> preview only
 *   off     -> nothing
 */
export async function runStream(opts: { source: StreamSource; client: CdaClient; hub: StreamHub; log: Logger; signal: AbortSignal }): Promise<void> {
  const { source, client, hub, signal } = opts;
  const log = opts.log.child({ component: "stream" });
  if (source === "off") {
    hub.setStatus({ source: "off", state: "disabled", message: "STREAM_SOURCE=off" });
    return;
  }
  const wantLive = source === "live" || (source === "auto" && client.hasKey);
  if (!wantLive) {
    if (source === "auto") log.info("no API key: serving the keyless delayed preview on /stream");
    await runDelayed(client, hub, log, signal);
    return;
  }
  while (!signal.aborted) {
    const fatal = await runLive(client, hub, log, signal);
    if (!fatal || signal.aborted) return;
    log.warn("live stream unavailable", { kind: fatal.kind, message: fatal.message });
    if (source === "auto") {
      const window = new AbortController();
      const stop = () => window.abort();
      signal.addEventListener("abort", stop, { once: true });
      const timer = setTimeout(stop, LIVE_RECHECK_MS);
      await runDelayed(client, hub, log, window.signal);
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
    } else {
      hub.setStatus({ source: "live", state: "error", message: `${fatal.message}. Retrying in 30 minutes.` });
      await sleep(LIVE_RECHECK_MS, signal);
    }
  }
}
