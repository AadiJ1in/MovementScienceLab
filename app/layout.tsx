import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Movement Science Lab",
  description: "Camera-based movement measurement, repetition analysis, and transparent movement-quality feedback.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
