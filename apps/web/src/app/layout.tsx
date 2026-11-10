import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Link",
  description: "Prepare for any conversation, recall instantly, improve after every call.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}