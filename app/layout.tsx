import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Delta-Neutral Strategy Simulator",
  description:
    "Interactive simulator for hedged concentrated liquidity positions. Visualize how delta-neutral strategies protect LP returns across market scenarios.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 antialiased">{children}</body>
    </html>
  );
}
