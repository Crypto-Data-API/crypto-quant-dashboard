import type { Metadata } from "next";
import { LiquidationsView } from "@/features/liquidations/liquidations-view";

export const metadata: Metadata = { title: "Liquidations" };

export default function LiquidationsPage() {
  return <LiquidationsView />;
}
