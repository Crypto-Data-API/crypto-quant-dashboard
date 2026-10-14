"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { LiveTapeProvider } from "@/lib/live";
import { DemoBanner } from "./demo-banner";
import { Header } from "./header";
import { KpiStrip } from "./kpi-strip";
import { Sidebar } from "./sidebar";

/** Clicks inside 3D views (a perp in the galaxy, a bubble) open the matching page. */
function useSceneLinks() {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const onCoin = (e: Event) => {
      const coin = String((e as CustomEvent).detail ?? "");
      if (coin) router.push(`/perp-regimes?q=${encodeURIComponent(coin)}`);
    };
    const onVol = (e: Event) => {
      const coin = String((e as CustomEvent).detail ?? "");
      if (coin && pathname !== "/volume-scanner") router.push(`/volume-scanner?open=${encodeURIComponent(coin)}`);
    };
    window.addEventListener("cq:coin", onCoin);
    window.addEventListener("cq:vol", onVol);
    return () => {
      window.removeEventListener("cq:coin", onCoin);
      window.removeEventListener("cq:vol", onVol);
    };
  }, [router, pathname]);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const scroll = useRef<HTMLDivElement>(null);
  useSceneLinks();
  // Overview opens straight onto its views; other pages get the title and the KPI tiles.
  const overview = (pathname ?? "/") === "/";
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <LiveTapeProvider>
      <div className="flex w-full overflow-hidden" style={{ height: "100dvh", background: "#06080b", color: "#e6edf5", fontSize: 13 }}>
        <Sidebar />
        <main className="cq-main flex min-w-0 flex-1 flex-col overflow-hidden">
          {overview ? null : <Header />}
          {overview ? null : <KpiStrip />}
          <DemoBanner />
          <div ref={scroll} className="flex-1 overflow-auto" style={{ padding: "20px 22px 48px" }} id="cq-scroll">
            {children}
          </div>
        </main>
      </div>
    </LiveTapeProvider>
  );
}
