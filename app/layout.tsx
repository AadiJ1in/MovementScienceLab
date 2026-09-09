import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Movement Science Lab",
  description: "Webcam-based movement quality and biomechanical flagging research platform.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
