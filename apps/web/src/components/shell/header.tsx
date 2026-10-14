"use client";

import { usePathname } from "next/navigation";
import { isActive, NAV } from "./nav";

/** Page title and subtitle. Overview has none, as in the design; status lives in the sidebar SYSTEM block. */
export function Header() {
  const pathname = usePathname() ?? "/";
  const cur = NAV.find((n) => isActive(pathname, n.href)) ?? NAV[0]!;
  return (
    <header className="flex items-center" style={{ gap: 16, padding: "14px 22px", borderBottom: "1px solid #131a23", background: "rgba(6,8,11,0.75)", lineHeight: "normal" }}>
      <div className="min-w-0">
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: "-0.025em" }}>{cur.label}</h1>
        <div style={{ fontSize: 12, color: "#8b98a9", marginTop: 2 }}>{cur.description}</div>
      </div>
    </header>
  );
}
