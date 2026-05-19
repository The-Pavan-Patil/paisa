import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paisa",
  description: "Salary-first personal finance tracker for India",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white text-base text-zinc-950 antialiased">{children}</body>
    </html>
  );
}
