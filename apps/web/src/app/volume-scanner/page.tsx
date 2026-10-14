import type { Metadata } from "next";
import { Suspense } from "react";
import { VolumeView } from "@/features/volume/volume-view";

export const metadata: Metadata = { title: "Volume Scanner" };

export default function VolumeScannerPage() {
  return (
    <Suspense>
      <VolumeView />
    </Suspense>
  );
}
