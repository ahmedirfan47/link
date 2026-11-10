import type { Metadata, Viewport } from "next";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource-variable/atkinson-hyperlegible-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Link", template: "%s · Link" },
  description: "Turn your deck and notes into short answer cues, and see the right one when the question comes up.",
};

export const viewport: Viewport = {
  themeColor: "#f2f2f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}