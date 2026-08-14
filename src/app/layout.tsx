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
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <Link href="/pipeline-queue" className="hover:text-foreground">
                Pipeline queue
              </Link>
              <Link href="/channels/new" className="hover:text-foreground">
                New channel
              </Link>
              <Link href="/reference-library" className="hover:text-foreground">
                Reference Library
              </Link>
              <span>Local production workspace</span>
            </div>
          </div>
        </div>
        <main className="container py-8">{children}</main>
        <GlobalProcessTray />
      </body>
    </html>
  );
}
