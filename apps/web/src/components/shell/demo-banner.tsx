"use client";

import { FlaskConical, GitBranch } from "lucide-react";
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
        <span className="font-semibold">Static demo.</span> Every panel shows CryptoDataApi responses and Jev reads captured {when}, and the live tape replays saved events. Run it yourself for live data.
      </>
    );
  } else if (demo.cda) {
    text = (
      <>
        <span className="font-semibold">Demo data from {when}.</span> No CDA_API_KEY is set, so panels show saved responses, not live data{demo.jev ? ", and Jev panels show saved reads" : ""}.
      </>
    );
  } else {
    text = (
      <>
        <span className="font-semibold">Jev panels show demo reads from {when}.</span> TYPESAFE_API_KEY is not set; all CryptoDataApi data is live.
      </>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-primary/30 bg-primary/10 px-4 py-1.5 text-xs lg:px-6" role="status">
      <FlaskConical className="size-3.5 shrink-0 text-[#7db3f0]" aria-hidden />
      <span className="min-w-0 flex-1">{text}</span>
      <Link href="/setup" className="shrink-0 rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground hover:bg-primary/90">
        {demo.static ? "Run it yourself" : "Get a key"}
      </Link>
      {demo.static ? (
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline">
          <GitBranch className="size-3.5" aria-hidden />
          Source on GitHub
        </a>
      ) : null}
    </div>
  );
}
