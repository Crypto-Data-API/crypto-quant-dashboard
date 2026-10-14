import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/shell/app-shell";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Crypto QuantDesk", template: "%s | Crypto QuantDesk" },
  description: "Real-time quant dashboard for Hyperliquid perps and the wider crypto market, powered by CryptoDataApi.",
};

export const viewport: Viewport = {
  themeColor: "#06080b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- app router root layout: loads once for every page */}
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
