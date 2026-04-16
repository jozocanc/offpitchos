import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

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
