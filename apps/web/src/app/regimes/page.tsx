import type { Metadata } from "next";
import { RegimesView } from "@/features/regimes/regimes-view";

export const metadata: Metadata = { title: "Cycle Regimes" };

export default function RegimesPage() {
  return <RegimesView />;
}
