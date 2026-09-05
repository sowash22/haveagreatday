import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import "../styles.css";

const bodyFont = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Have a Great Day: Know when to go outside",
    template: "%s | Have a Great Day",
  },
  description: "Not just a weather app. Have a Great Day combines weather, AQI, UV, comfort, daylight, and a little AI to find practical times for walks, hikes, rides, and family or pet outings.",
  appleWebApp: {
    capable: true,
    title: "Have a Great Day",
    statusBarStyle: "black-translucent",
  },
  other: {
    "impeccable-contract": "seed=f9dbe9d4; direction=canon-weather; mode=operate; variance=6; motion=3; density=3; brief=.impeccable/surfaces/src-app-have-a-great-day-app-tsx.md",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={bodyFont.variable} data-scroll-behavior="smooth">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
