/** Workspace navigation. Icons are the prototype's 24x24 stroke paths. */
export type NavId = "overview" | "regimes" | "perps" | "cycle" | "gamma" | "volume" | "books" | "liqs" | "calendar" | "news" | "setup" | "settings";

export interface NavItem {
  id: NavId;
  href: string;
  label: string;
  description: string;
  icon: string;
}

export const NAV: NavItem[] = [
  { id: "overview", href: "/", label: "Overview", description: "Regime, health, squeezes and the live liquidation tape", icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" },
  { id: "regimes", href: "/market-regimes", label: "Market Regimes", description: "Short-term HMM regime for the market and every perp", icon: "M12 21a9 9 0 1 1 9-9M12 16a4 4 0 1 1 4-4M12 12h.01" },
  {
    id: "perps",
    href: "/perp-regimes",
    label: "Perp Regimes",
    description: "HMM regime, confidence and filters for every perp",
    icon: "M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4z",
  },
  { id: "cycle", href: "/regimes", label: "Cycle Regimes", description: "Long-horizon cycle phase, ring and playbook", icon: "M21 12a9 9 0 1 1-2.6-6.4M21 3v5h-5" },
  { id: "gamma", href: "/quant-gamma", label: "Quant Gamma", description: "Dealer GEX analog: flip levels, gamma profile, positioning", icon: "M18 5H6l6 7-6 7h12" },
  { id: "volume", href: "/volume-scanner", label: "Volume Scanner", description: "24h notional vs 30-day baseline for every perp", icon: "M5 20V11M10 20V5M15 20v-6M20 20V8" },
  { id: "books", href: "/quant-order-books", label: "Order Books", description: "Depth, spreads, live L2 ladder and OI divergence", icon: "M12 3l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5" },
  { id: "liqs", href: "/liquidations", label: "Liquidations", description: "Rolling totals, heatmap, exchanges and the live tape", icon: "M12 22c4 0 7-3 7-7 0-4-3-6-4-9-1 2-2 3-3 3 0-2 0-4-2-6-2 3-5 6-5 12 0 4 3 7 7 7z" },
  { id: "calendar", href: "/calendar", label: "Calendar", description: "Event risk, unlocks, macro prints and depegs", icon: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4" },
  { id: "news", href: "/news", label: "News", description: "Market-moving catalysts, news pulse and feed health", icon: "M4 5h12v14H6a2 2 0 0 1-2-2zM16 9h4v8a2 2 0 0 1-2 2M7 9h6M7 13h6M7 16h4" },
  {
    id: "setup",
    href: "/setup",
    label: "Setup",
    description: "API keys, demo mode and a setup prompt for your AI agent",
    icon: "M14.5 9.5a5 5 0 1 0-3.8 4.85L4 21v-3h3v-3h3l1.7-1.7M15 8h.01",
  },
  {
    id: "settings",
    href: "/settings",
    label: "Settings",
    description: "Display, live feed, Jev and data mode",
    icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
