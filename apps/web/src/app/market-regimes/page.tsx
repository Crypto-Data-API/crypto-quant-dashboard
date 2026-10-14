import type { Metadata } from "next";
import { MarketRegimesView } from "@/features/market/market-regimes-view";

export const metadata: Metadata = { title: "Market Regimes" };

export default function MarketRegimesPage() {
  return <MarketRegimesView />;
}
