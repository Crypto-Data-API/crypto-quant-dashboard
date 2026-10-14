"use client";

import { DATASETS, isStale, type DatasetDef, type DatasetId, type Envelope, type EnvelopeStatus } from "@cqd/schemas";
import Link from "next/link";
import type * as React from "react";
import { Tip } from "@/components/ui/primitives";
import { A } from "@/cq/theme";
import { ago, dateTime, duration } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { cn, toMs } from "@/lib/utils";

type State = Exclude<EnvelopeStatus, "ok">;

/** 24x24 stroke icons in the prototype's style. */
const ICON: Record<string, string> = {
  key: "M7.5 20a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM10.7 12.3l9.8-9.8M17 6l3 3M14.5 8.5l2 2",
  lock: "M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6zM9.5 9.5l5 5M14.5 9.5l-5 5",
  gauge: "M12 21a9 9 0 1 1 9-9M12 12l4-4M3 12h2M12 3v2",
  hourglass: "M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9",
  alert: "M12 3 2 21h20L12 3zM12 10v5M12 18h.01",
  flask: "M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10",
  bot: "M5 8h14v11H5zM12 8V4M9 13h.01M15 13h.01M3 13v3M21 13v3",
  plug: "M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4",
  loader: "M12 3a9 9 0 1 0 9 9",
};

const STATE_COPY: Record<State, { icon: string; title: string; body: React.ReactNode; tone: string }> = {
  pending: {
    icon: "loader",
    title: "Waiting for the first poll",
    body: "The worker has queued this dataset. It appears here as soon as CryptoDataApi answers.",
    tone: "#8b98a9",
  },
  no_api_key: {
    icon: "key",
    title: "API key not configured",
    body: (
      <>
        Set <span className="cq-mono" style={{ color: "#e6edf5" }}>CDA_API_KEY</span> in the repo-root .env and restart the worker. The key stays on the server; the browser only reads our cache.
      </>
    ),
    tone: "#ffb547",
  },
  pro_required: {
    icon: "lock",
    title: "Higher plan required",
    body: "This endpoint is above the key's tier (CryptoDataApi answered 403, or /auth/keys/me shows a lower tier). The worker re-checks hourly instead of retrying.",
    tone: "#4c9bff",
  },
  unauthorized: {
    icon: "shield",
    title: "API key rejected",
    body: "CryptoDataApi answered 401. Check CDA_API_KEY; the worker re-checks hourly.",
    tone: "#ff7a3d",
  },
  rate_limited: {
    icon: "gauge",
    title: "Rate limited",
    body: "CryptoDataApi answered 429 after backoff. The worker paused its shared limiter and will resume automatically.",
    tone: "#ffb547",
  },
  budget_paused: {
    icon: "hourglass",
    title: "Daily budget reached",
    body: "The worker stopped keyed calls to stay under the daily request cap. Polling resumes at 00:00 UTC.",
    tone: "#ffb547",
  },
  error: {
    icon: "alert",
    title: "Fetch failed",
    body: "The last request to CryptoDataApi failed. The worker retries with backoff.",
    tone: "#ff7a3d",
  },
  demo_unavailable: {
    icon: "flask",
    title: "Not in the demo data",
    body: "Demo mode bundles saved responses for a few symbols only. Add a CryptoDataApi key to load any symbol live.",
    tone: "#4c9bff",
  },
  classifier_off: {
    icon: "bot",
    title: "Classifier not configured",
    body: (
      <>
        Set <span className="cq-mono" style={{ color: "#e6edf5" }}>TYPESAFE_API_KEY</span> in the repo-root .env (and leave JEV_ENABLED on), then restart the worker. CryptoDataApi panels are unaffected.
      </>
    ),
    tone: "#8b98a9",
  },
  worker_offline: {
    icon: "plug",
    title: "Worker offline",
    body: (
      <>
        Neither the cache nor the worker is reachable. Start it with <span className="cq-mono" style={{ color: "#e6edf5" }}>pnpm dev:worker</span>
      </>
    ),
    tone: "#8b98a9",
  },
};

export function StateIcon({ name, color, size = 22, spin = false }: { name: string; color: string; size?: number; spin?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={spin ? "animate-spin [animation-duration:2s]" : undefined} aria-hidden>
      <path d={ICON[name] ?? ICON.alert} />
    </svg>
  );
}

/** The prototype's empty state: dashed border, faint diagonal stripes, icon, title and one line of help. */
export function StateView({ status, message, compact = false, fill = false }: { status: State; message?: string | null; compact?: boolean; fill?: boolean }) {
  const s = STATE_COPY[status];
  return (
    <div
      className={cn("flex flex-col items-center justify-center text-center", fill && "h-full")}
      style={{
        border: "1px dashed #222c39",
        borderRadius: 12,
        padding: compact ? "18px 14px" : "34px 20px",
        gap: 8,
        background: `repeating-linear-gradient(135deg, ${A(s.tone, 0.025)} 0 10px, transparent 10px 20px)`,
      }}
    >
      <StateIcon name={s.icon} color={s.tone} spin={status === "pending"} />
      <div style={{ fontSize: 14, fontWeight: 600 }}>{s.title}</div>
      <div style={{ fontSize: 12, color: "#8b98a9", maxWidth: 440, lineHeight: 1.55, textWrap: "pretty" }}>{s.body}</div>
      {message && status !== "pending" && status !== "worker_offline" && status !== "no_api_key" && status !== "classifier_off" ? (
        <div className="cq-mono" style={{ fontSize: 10.5, color: "#5b6878", maxWidth: 440, overflowWrap: "anywhere" }}>
          {message}
        </div>
      ) : null}
      {status === "no_api_key" || status === "classifier_off" || status === "demo_unavailable" ? (
        <Link href="/setup" style={{ fontSize: 12 }}>
          Set up keys →
        </Link>
      ) : null}
    </div>
  );
}

/** Small mono tag (demo, stale, failed). */
export function Tag({ color, children, title }: { color: string; children: React.ReactNode; title?: string }) {
  return (
    <span className="cq-chip" title={title} style={{ color, background: A(color, 0.1), borderColor: A(color, 0.4), fontSize: 9.5, letterSpacing: "0.06em", fontWeight: 600 }}>
      {children}
    </span>
  );
}

/** "as of 12m ago" plus stale / failed / demo tags, in the prototype's mono caption style. */
export function Freshness({ env, className }: { env: Envelope | undefined; className?: string }) {
  const now = useNow() || Date.now();
  if (!env) return null;
  const fetched = toMs(env.fetchedAt);
  const asOf = toMs(env.asOf);
  if (env.demo) {
    return (
      <Tip content={`Saved CryptoDataApi response captured ${dateTime(toMs(env.demo.capturedAt))}${asOf ? `, data as of ${dateTime(asOf)}` : ""}. Not live.`}>
        <span tabIndex={0} className={cn("outline-none", className)}>
          <Tag color="#4c9bff">DEMO SAMPLE</Tag>
        </span>
      </Tip>
    );
  }
  const stale = env.fetchedAt ? isStale(env, now) : false;
  const failed = env.status !== "ok" && env.data;
  return (
    <span className={cn("flex items-center gap-2", className)}>
      {stale ? <Tag color="#ffb547">STALE</Tag> : null}
      {failed ? <Tag color={env.status === "error" ? "#ff7a3d" : "#ffb547"}>{env.status === "error" ? "LAST FETCH FAILED" : STATE_COPY[env.status as State]?.title.toUpperCase()}</Tag> : null}
      {fetched ? (
        <Tip
          content={
            <div className="space-y-0.5">
              <div>
                Fetched {dateTime(fetched)} ({ago(fetched, now)})
              </div>
              {asOf ? <div>CDA data as of {dateTime(asOf)}</div> : null}
              <div>
                Poll interval {duration(env.intervalMs / 1000)}; stale after {duration(env.staleAfterMs / 1000)}
              </div>
            </div>
          }
        >
          <span className="cq-asof cursor-default outline-none" tabIndex={0}>
            as of {ago(asOf ?? fetched, now)}
          </span>
        </Tip>
      ) : null}
    </span>
  );
}

export function datasetPath(id: DatasetId): string {
  const def = DATASETS[id] as DatasetDef;
  return def.path ? def.path.replace("/api/v1", "") : "TypeSafe Jev (classified in the worker)";
}

/** Section header: title (with optional inline extra), source path or subtitle, and a right side. */
export function SecHead({ title, extra, path, sub, right, mb = 14 }: { title: React.ReactNode; extra?: React.ReactNode; path?: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; mb?: number }) {
  return (
    <div className="flex flex-wrap items-start justify-between" style={{ gap: 12, marginBottom: mb }}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          <span className="cq-title">{title}</span>
          {extra}
        </div>
        {path ? <div className="cq-path">{path}</div> : null}
        {sub ? <div className="cq-sub">{sub}</div> : null}
      </div>
      {right ? <div className="flex shrink-0 flex-wrap items-center justify-end" style={{ gap: 8 }}>{right}</div> : null}
    </div>
  );
}

export function Skeleton({ height = 120, className }: { height?: number | string; className?: string }) {
  return <div className={cn("cq-skel", className)} style={{ height }} aria-hidden />;
}

interface PanelProps<T> {
  title: React.ReactNode;
  /** Dataset id: shows the CDA endpoint under the title. */
  dataset?: DatasetId;
  /** Overrides the source line. */
  path?: React.ReactNode;
  sub?: React.ReactNode;
  extra?: React.ReactNode;
  env?: Envelope<T>;
  isLoading?: boolean;
  actions?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  mb?: number;
  children: (data: T, env: Envelope<T>) => React.ReactNode;
  skeletonHeight?: number;
  compact?: boolean;
}

/**
 * A prototype card: title, source path, "as of" with stale / demo tags, then the data or an
 * explicit state (pending, no key, Pro required, rate limited, budget paused, error, offline).
 */
export function Panel<T>({ title, dataset, path, sub, extra, env, isLoading, actions, className, style, mb, children, skeletonHeight = 120, compact }: PanelProps<T>) {
  return (
    <section className={cn("cq-card cq-sec", className)} style={style}>
      <SecHead
        title={title}
        extra={extra}
        path={path ?? (dataset ? datasetPath(dataset) : undefined)}
        sub={sub}
        mb={mb}
        right={
          <>
            {actions}
            <Freshness env={env as Envelope | undefined} />
          </>
        }
      />
      <PanelBody env={env} isLoading={isLoading} skeletonHeight={skeletonHeight} compact={compact}>
        {children}
      </PanelBody>
    </section>
  );
}

export function PanelBody<T>({
  env,
  isLoading,
  children,
  skeletonHeight = 120,
  compact,
  fill,
}: {
  env?: Envelope<T>;
  isLoading?: boolean;
  children: (data: T, env: Envelope<T>) => React.ReactNode;
  skeletonHeight?: number | string;
  compact?: boolean;
  fill?: boolean;
}) {
  if (!env) return isLoading !== false ? <Skeleton height={skeletonHeight} /> : <StateView status="worker_offline" compact={compact} fill={fill} />;
  if (env.data !== null && env.data !== undefined) return <>{children(env.data, env)}</>;
  const status = env.status === "ok" ? "pending" : env.status;
  return <StateView status={status} message={env.error?.message} compact={compact} fill={fill} />;
}
