"use client";

import { Activity } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type * as React from "react";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";
import { StatStrip } from "./stat-strip";
import { SystemStatus } from "./system-status";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const current = NAV.find((n) => isActive(pathname, n.href));
  return (
    <div className="min-h-dvh lg:pl-56">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r bg-card/40 lg:flex">
        <Link href="/" className="flex h-14 items-center gap-2 border-b px-4">
          <Activity className="size-5 text-primary" aria-hidden />
          <div className="leading-tight">
            <div className="text-sm font-semibold">Crypto Quant</div>
            <div className="text-[10px] text-muted-foreground">powered by CryptoDataApi</div>
          </div>
        </Link>
        <nav className="flex-1 space-y-0.5 p-2" aria-label="Main">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  active && "bg-accent text-foreground",
                )}
              >
                <Icon className={cn("size-4", active && "text-primary")} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3 text-[10px] leading-relaxed text-muted-foreground">
          Data: CryptoDataApi. The browser reads our cache only; one server-side poller spends the API budget.
        </div>
      </aside>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 lg:px-6">
          <div className="flex min-w-0 items-center gap-2 lg:hidden">
            <Activity className="size-5 text-primary" aria-hidden />
            <span className="text-sm font-semibold">Crypto Quant</span>
          </div>
          <div className="hidden min-w-0 lg:block">
            <h1 className="text-sm font-semibold">{current?.label ?? "Crypto Quant"}</h1>
            <p className="truncate text-[11px] text-muted-foreground">{current?.description}</p>
          </div>
          <SystemStatus />
        </div>
        {/* Mobile nav */}
        <nav className="scrollbar-thin flex gap-1 overflow-x-auto border-t px-3 py-1.5 lg:hidden" aria-label="Main">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("shrink-0 rounded-md px-2.5 py-1 text-xs text-muted-foreground", active && "bg-accent text-foreground")}
              >
                {item.short}
              </Link>
            );
          })}
        </nav>
        <div className="border-t px-2 lg:px-4">
          <StatStrip />
        </div>
      </header>

      <main className="px-4 py-4 lg:px-6 lg:py-5">{children}</main>
    </div>
  );
}
