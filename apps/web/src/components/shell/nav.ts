import { CalendarDays, ChartColumn, Flame, Layers, LayoutDashboard, Newspaper, Orbit, Radar, Sigma } from "lucide-react";
import type { ElementType } from "react";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: ElementType;
  description: string;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", short: "Overview", icon: LayoutDashboard, description: "Regime, health, squeezes and the live liquidation tape" },
  { href: "/market-regimes", label: "Market Regimes", short: "Regimes", icon: Radar, description: "Short-term HMM regime for the market and every perp" },
  { href: "/regimes", label: "Cycle Regimes", short: "Cycle", icon: Orbit, description: "10-phase long-horizon cycle, market health and regime scores" },
  { href: "/quant-gamma", label: "Quant Gamma", short: "Gamma", icon: Sigma, description: "Dealer GEX analog: flip levels, gamma profile, positioning" },
  { href: "/volume-scanner", label: "Volume Scanner", short: "Volume", icon: ChartColumn, description: "24h notional vs 30-day baseline for every perp" },
  { href: "/quant-order-books", label: "Order Books", short: "Books", icon: Layers, description: "Depth, spreads, live L2 ladder and OI divergence" },
  { href: "/liquidations", label: "Liquidations", short: "Liqs", icon: Flame, description: "Rolling totals, heatmap, exchanges and the live tape" },
  { href: "/calendar", label: "Calendar", short: "Calendar", icon: CalendarDays, description: "Event risk, unlocks, macro prints and depegs" },
  { href: "/news", label: "News", short: "News", icon: Newspaper, description: "Market-moving catalysts, news pulse and feed health" },
];
