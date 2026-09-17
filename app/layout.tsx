import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Movement Science Lab",
    template: "%s | Movement Science Lab",
  },
  description: "Camera-based movement measurement, repetition analysis, validation-aware metrics, and transparent research feedback.",
  applicationName: "Movement Science Lab",
  keywords: ["movement science", "biomechanics", "pose estimation", "rehabilitation research", "movement assessment"],
  category: "technology",
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#f5f5f2",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="fixed left-4 top-3 z-[100] -translate-y-24 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white shadow-xl transition focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-zinc-950"
        >
          Skip to main content
        </a>
        <SiteHeader />
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}
