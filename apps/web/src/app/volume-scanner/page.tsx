import type { Metadata } from "next";
import { VolumeView } from "@/features/volume/volume-view";

export const metadata: Metadata = { title: "Volume Scanner" };

export default function VolumeScannerPage() {
  return <VolumeView />;
}
