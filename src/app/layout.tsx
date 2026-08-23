import type { Metadata } from "next";
import { IBM_Plex_Sans, Newsreader } from "next/font/google";
import type { ReactNode } from "react";
import "../styles.css";

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-ibm-plex-sans",
  display: "swap",
});

const displayFont = Newsreader({
  subsets: ["latin"],
  weight: ["300", "700"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SafeDay — Find a more favorable time outside",
    template: "%s — SafeDay",
  },
  description: "Compare weather, air quality, UV, and apparent temperature to find a more favorable time for outdoor activity.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
