"use client";

import Link from "next/link";
import { dateTime } from "@/lib/format";
import { useWorkerStatus } from "@/lib/hooks";
import { REPO_URL } from "@/lib/mode";
import { toMs } from "@/lib/utils";

function range(from: string | null, to: string | null): string {
  const a = toMs(from);
  const b = toMs(to);
  if (!a && !b) return "an earlier date";
  if (!a || !b || dateTime(a).slice(0, 6) !== dateTime(b).slice(0, 6)) return [a, b].filter(Boolean).map((t) => dateTime(t)).join(" to ");
  return `${dateTime(a)} to ${dateTime(b).slice(-5)}`;
}

/**
 * Persistent banner whenever any panel shows saved samples instead of live data: keyless demo
 * mode, Jev without a TypeSafe key, or the static GitHub Pages build.
 */
export function DemoBanner() {
  const { data } = useWorkerStatus();
  const demo = data?.worker?.demo;
  if (!demo) return null;
  const when = range(demo.capturedFrom, demo.capturedTo);
  let text: React.ReactNode;
  if (demo.static) {
    text = (
      <>
        <span style={{ fontWeight: 600, color: "#e6edf5" }}>Static demo.</span> Every panel shows CryptoDataApi responses and Jev reads captured {when}, and the live tape replays saved events. Run it yourself for live data.
      </>
    );
  } else if (demo.cda) {
    text = (
      <>
        <span style={{ fontWeight: 600, color: "#e6edf5" }}>Demo data from {when}.</span> No CDA_API_KEY is set, so panels show saved responses, not live data{demo.jev ? ", and Jev panels show saved reads" : ""}.
      </>
    );
  } else {
    text = (
      <>
        <span style={{ fontWeight: 600, color: "#e6edf5" }}>Jev panels show demo reads from {when}.</span> TYPESAFE_API_KEY is not set; all CryptoDataApi data is live.
      </>
    );
  }
  return (
    <div className="flex flex-wrap items-center" style={{ gap: "6px 12px", padding: "8px 22px", borderBottom: "1px solid #131a23", background: "rgba(76,155,255,0.06)", fontSize: 12, color: "#c9d3df" }} role="status">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4c9bff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }} aria-hidden>
        <path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10" />
      </svg>
      <span className="min-w-0 flex-1" style={{ textWrap: "pretty" }}>
        {text}
      </span>
      <Link href="/setup" className="shrink-0 hover:brightness-110" style={{ padding: "5px 11px", borderRadius: 7, background: "#4c9bff", color: "#06080b", fontSize: 11.5, fontWeight: 600 }}>
        {demo.static ? "Run it yourself" : "Get a key"}
      </Link>
      {demo.static ? (
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center" style={{ gap: 6, fontSize: 11.5 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9" />
          </svg>
          Source on GitHub
        </a>
      ) : null}
    </div>
  );
}
