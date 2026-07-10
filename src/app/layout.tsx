import type { Metadata } from "next";
import Link from "next/link";

import { GlobalProcessTray } from "@/components/process-status";

import "./globals.css";

export const metadata: Metadata = {
  title: "Video Pipeline",
  description: "A local YouTube video production pipeline"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <div className="border-b bg-background">
          <div className="container flex h-14 items-center justify-between">
            <Link href="/" className="text-sm font-semibold">
              Video Pipeline
            </Link>
            <div className="text-xs text-muted-foreground">Local production workspace</div>
          </div>
        </div>
        <main className="container py-8">{children}</main>
        <GlobalProcessTray />
      </body>
    </html>
  );
}
