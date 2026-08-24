import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import "../styles.css";

const bodyFont = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Have a Great Day: Find a better time outside",
    template: "%s | Have a Great Day",
  },
  description: "Compare the next seven days to plan a walk, run, ride, dog walk, or park visit around weather, air quality, UV, and temperature.",
  other: {
    "impeccable-contract": "seed=f9dbe9d4; direction=canon-weather; mode=operate; variance=6; motion=3; density=3; brief=.impeccable/surfaces/src-app-have-a-great-day-app-tsx.md",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={bodyFont.variable} data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
