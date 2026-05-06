import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Expert Comment AI",
  description: "SaaS skeleton for expert Telegram presence"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
