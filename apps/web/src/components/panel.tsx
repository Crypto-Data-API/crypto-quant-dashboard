"use client";

import { DATASETS, isStale, type DatasetDef, type DatasetId, type Envelope, type EnvelopeStatus } from "@cqd/schemas";
import { Bot, Clock, FlaskConical, Gauge, Hourglass, KeyRound, Loader, Lock, PlugZap, ShieldAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton, Tip } from "@/components/ui/primitives";
import { ago, dateTime, duration } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { cn, toMs } from "@/lib/utils";

const STATE_COPY: Record<Exclude<EnvelopeStatus, "ok">, { icon: React.ElementType; title: string; body: string; tone: string }> = {
  pending: {
    icon: Loader,
    title: "Waiting for the first poll",
    body: "The worker has queued this dataset. It appears here as soon as CryptoDataApi answers.",
    tone: "text-muted-foreground",
  },
  no_api_key: {
    icon: KeyRound,
    title: "API key not configured",
    body: "Set CDA_API_KEY in the repo-root .env and restart the worker. The key stays on the server; the browser only reads our cache.",
    tone: "text-warning",
  },
  pro_required: {
    icon: Lock,
    title: "Higher plan required",
    body: "This endpoint is above the key's tier (CryptoDataApi answered 403, or /auth/keys/me shows a lower tier). The worker re-checks hourly instead of retrying.",
    tone: "text-[#7db3f0]",
  },
  unauthorized: {
    icon: ShieldAlert,
    title: "API key rejected",
    body: "CryptoDataApi answered 401. Check CDA_API_KEY; the worker re-checks hourly.",
    tone: "text-serious",
  },
  rate_limited: {
    icon: Gauge,
    title: "Rate limited",
    body: "CryptoDataApi answered 429 after backoff. The worker paused its shared limiter and will resume automatically.",
    tone: "text-warning",
  },
  budget_paused: {
    icon: Hourglass,
    title: "Daily budget reached",
    body: "The worker stopped keyed calls to stay under the daily request cap. Polling resumes at 00:00 UTC.",
    tone: "text-warning",
  },
  error: {
    icon: TriangleAlert,
    title: "Fetch failed",
    body: "The last request to CryptoDataApi failed. The worker retries with backoff.",
    tone: "text-serious",
  },
  demo_unavailable: {
    icon: FlaskConical,
    title: "Not in the demo data",
    body: "Demo mode bundles saved responses for a few symbols only. Add a CryptoDataApi key to load any symbol live.",
    tone: "text-[#7db3f0]",
  },
  classifier_off: {
    icon: Bot,
    title: "Classifier not configured",
    body: "Set TYPESAFE_API_KEY in the repo-root .env (and leave JEV_ENABLED on), then restart the worker. CryptoDataApi panels are unaffected.",
    tone: "text-muted-foreground",
  },
  worker_offline: {
    icon: PlugZap,
    title: "Worker offline",
    body: "Neither the cache nor the worker is reachable. Start it with: pnpm dev:worker",
    tone: "text-muted-foreground",
  },
};

export function StateView({ status, message, compact = false }: { status: Exclude<EnvelopeStatus, "ok">; message?: string | null; compact?: boolean }) {
  const s = STATE_COPY[status];
  const Icon = s.icon;
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-md border border-dashed text-center", compact ? "px-3 py-4" : "px-4 py-8")}>
      <Icon className={cn("size-5", s.tone, status === "pending" && "animate-spin [animation-duration:2s]")} aria-hidden />
      <div className="text-sm font-medium">{s.title}</div>
      <p className="max-w-sm text-xs text-muted-foreground">{s.body}</p>
      {message && status !== "pending" && status !== "worker_offline" && status !== "no_api_key" && status !== "classifier_off" ? <p className="max-w-sm font-mono text-[11px] break-words text-muted-foreground/80">{message}</p> : null}
      {status === "no_api_key" || status === "classifier_off" || status === "demo_unavailable" ? (
        <Link href="/setup" className="text-xs text-primary hover:underline">
          Set up keys
        </Link>
      ) : null}
    </div>
  );
}

/** "as of" + stale badge for a panel header. */
export function Freshness({ env }: { env: Envelope | undefined }) {
  const now = useNow();
  if (!env) return null;
  const fetched = toMs(env.fetchedAt);
  const asOf = toMs(env.asOf);
  const effectiveNow = now || Date.now();
  if (env.demo) {
    return (
      <Tip content={`Saved CryptoDataApi response captured ${dateTime(toMs(env.demo.capturedAt))}${asOf ? `, data as of ${dateTime(asOf)}` : ""}. Not live.`}>
        <span tabIndex={0} className="outline-none">
          <Badge variant="info">
            <FlaskConical aria-hidden />
            Demo sample
          </Badge>
        </span>
      </Tip>
    );
  }
  const stale = env.fetchedAt ? isStale(env, now || Date.now()) : false;
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      {stale ? (
        <Badge variant="warning">
          <Clock aria-hidden />
          Stale
        </Badge>
      ) : null}
      {env.status !== "ok" && env.data ? (
        <Badge variant={env.status === "error" ? "serious" : "warning"}>
          <TriangleAlert aria-hidden />
          {env.status === "error" ? "Last fetch failed" : STATE_COPY[env.status as Exclude<EnvelopeStatus, "ok">]?.title}
        </Badge>
      ) : null}
      {fetched ? (
        <Tip
          content={
            <div className="space-y-0.5">
              <div>Fetched {dateTime(fetched)} ({ago(fetched, effectiveNow)})</div>
              {asOf ? <div>CDA data as of {dateTime(asOf)}</div> : null}
              <div>Poll interval {duration(env.intervalMs / 1000)}; stale after {duration(env.staleAfterMs / 1000)}</div>
            </div>
          }
        >
          <span className="num cursor-default whitespace-nowrap" tabIndex={0}>
            as of {ago(asOf ?? fetched, effectiveNow)}
          </span>
        </Tip>
      ) : null}
    </div>
  );
}

interface PanelProps<T> {
  title: React.ReactNode;
  /** Dataset id: shows the CDA endpoint as the source chip. */
  dataset?: DatasetId;
  env?: Envelope<T>;
  isLoading?: boolean;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Rendered when data is present (possibly stale). */
  children: (data: T, env: Envelope<T>) => React.ReactNode;
  /** Skeleton height while the first response is loading. */
  skeletonHeight?: number;
  compact?: boolean;
}

/**
 * Every data panel goes through this: header with title, source endpoint, "as of" time and
 * stale indicator; body with data, or an explicit state (pending, no key, Pro required,
 * rate limited, budget paused, error, worker offline).
 */
export function Panel<T>({ title, dataset, env, isLoading, actions, className, bodyClassName, children, skeletonHeight = 120, compact }: PanelProps<T>) {
  const def = dataset ? (DATASETS[dataset] as DatasetDef) : null;
  return (
    <Card className={className}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {def ? (
            <div
              className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70"
              title={def.path ? `Source: GET ${def.path}` : "Source: TypeSafe Jev classifier (worker)"}
            >
              {def.path ? def.path.replace("/api/v1", "") : "TypeSafe Jev (classified in the worker)"}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Freshness env={env as Envelope | undefined} />
          {actions}
        </div>
      </CardHeader>
      <CardContent className={bodyClassName}>
        <PanelBody env={env} isLoading={isLoading} skeletonHeight={skeletonHeight} compact={compact}>
          {children}
        </PanelBody>
      </CardContent>
    </Card>
  );
}

export function PanelBody<T>({
  env,
  isLoading,
  children,
  skeletonHeight = 120,
  compact,
}: {
  env?: Envelope<T>;
  isLoading?: boolean;
  children: (data: T, env: Envelope<T>) => React.ReactNode;
  skeletonHeight?: number;
  compact?: boolean;
}) {
  if (!env) {
    return isLoading !== false ? <Skeleton style={{ height: skeletonHeight }} /> : <StateView status="worker_offline" compact={compact} />;
  }
  if (env.data !== null && env.data !== undefined) return <>{children(env.data, env)}</>;
  const status = env.status === "ok" ? "pending" : env.status;
  return <StateView status={status} message={env.error?.message} compact={compact} />;
}
