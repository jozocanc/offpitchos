import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { appUrl } from "@/lib/app-url";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "OffPitchOS: The operating system for soccer teams",
    template: "%s | OffPitchOS",
  },
  description: "The operating system for serious soccer teams. Schedule, player comms, gear, travel and tactics in one system for the head coach, staff and players.",
  metadataBase: new URL(appUrl()),
  manifest: "/manifest.json",
  // "default" = dark status-bar text on a light bar. The old "black-translucent"
  // drew white clock/battery glyphs over the cream page (invisible) and slid
  // page content under the status bar.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "OffPitchOS",
  },
  openGraph: {
    title: "OffPitchOS: The operating system for soccer teams",
    description: "The operating system for serious soccer teams. Schedule, player comms, gear, travel and tactics in one system for the head coach, staff and players.",
    siteName: "OffPitchOS",
  },
};

export const viewport: Viewport = {
  // Cream, matching the dashboard/marketing page background (--color-dark),
  // so the iOS status bar and Android title bar blend into the page.
  themeColor: "#FAF7F2",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Lets env(safe-area-inset-*) report real values so the phone tab bar can
  // clear the iPhone home indicator.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        {/* Opaque (no transparent corners): iOS paints transparency black
            before applying its own rounded mask. */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
