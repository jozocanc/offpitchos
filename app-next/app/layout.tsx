import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AccessGate from "@/components/access-gate";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "OffPitchOS",
    template: "%s | OffPitchOS",
  },
  description: "The AI-driven operating system for soccer clubs. Built by directors, for directors.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://offpitchos.com"),
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OffPitchOS",
  },
  openGraph: {
    title: "OffPitchOS",
    description: "The AI-driven operating system for soccer clubs. Built by directors, for directors.",
    siteName: "OffPitchOS",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A1628",
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
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={inter.className}><AccessGate>{children}</AccessGate></body>
    </html>
  );
}
