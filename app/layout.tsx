import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next"
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "CraneMail Files",
  title: {
    default: "CraneMail Files | CraneMail Workspace File Share",
    template: "%s | CraneMail Files",
  },
  description:
    "A lightweight CraneMail workspace file sharing dashboard for uploading, syncing, sharing, and managing public file links.",
  keywords: [
    "CraneMail",
    "CraneMail workspace",
    "file sharing",
    "workspace storage",
    "Telegram upload bot",
    "public file links",
  ],
  authors: [{ name: "CraneMail Files" }],
  creator: "CraneMail Files",
  publisher: "CraneMail Files",
  category: "technology",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "CraneMail Files",
    title: "CraneMail Files | CraneMail Workspace File Share",
    description:
      "Upload files to CraneMail workspace storage, generate public links, sync workspace files, and manage uploads from web or Telegram.",
  },
  twitter: {
    card: "summary",
    title: "CraneMail Files | CraneMail Workspace File Share",
    description:
      "Upload, sync, share, and manage CraneMail workspace files from a focused web dashboard.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className="h-full font-sans antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
