import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { appUrl } from "@/lib/app-url";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "OffPitchOS — The operating system for soccer clubs",
    template: "%s | OffPitchOS",
  },
  description: "The operating system for serious soccer clubs, academies and college programs. Scheduling, communication, coverage and tactics in one system.",
  metadataBase: new URL(appUrl()),
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OffPitchOS",
  },
  openGraph: {
    title: "OffPitchOS — The operating system for soccer clubs",
    description: "The operating system for serious soccer clubs, academies and college programs. Scheduling, communication, coverage and tactics in one system.",
    siteName: "OffPitchOS",
  },
};

export const viewport: Viewport = {
  themeColor: "#1F4E3D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
        <link rel="apple-touch-icon" sizes="180x180" href="/icon-180.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
