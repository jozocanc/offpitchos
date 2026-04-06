import type { Metadata } from "next";
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
  openGraph: {
    title: "OffPitchOS",
    description: "The AI-driven operating system for soccer clubs. Built by directors, for directors.",
    siteName: "OffPitchOS",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
