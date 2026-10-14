import type { Metadata } from "next";
import { GammaView } from "@/features/gamma/gamma-view";

export const metadata: Metadata = { title: "Quant Gamma" };

export default function QuantGammaPage() {
  return <GammaView />;
}
