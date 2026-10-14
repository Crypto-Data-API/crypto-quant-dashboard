import type { Metadata } from "next";
import { Suspense } from "react";
import { PerpRegimesView } from "@/features/market/perp-regimes-view";

export const metadata: Metadata = { title: "Perp Regimes" };

export default function PerpRegimesPage() {
  return (
    <Suspense>
      <PerpRegimesView />
    </Suspense>
  );
}
