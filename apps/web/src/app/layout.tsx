import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/shell/app-shell";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Crypto Quant Dashboard", template: "%s | Crypto Quant" },
  description: "Real-time quant dashboard for Hyperliquid perps and the wider crypto market, powered by CryptoDataApi.",
};

export const viewport: Viewport = {
  themeColor: "#0b0c0e",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
