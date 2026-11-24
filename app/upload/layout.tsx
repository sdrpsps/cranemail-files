import type { Metadata } from "next";
import type { ReactNode } from "react";

import { siteMetadata } from "@/lib/site";

const description =
  "Sign in to upload files, copy share links, find previous uploads, and connect your Telegram account.";

export const metadata: Metadata = {
  title: "Your files",
  description,
  alternates: { canonical: "/upload" },
  openGraph: {
    ...siteMetadata.openGraph,
    title: "Your files | CraneMail Files",
    description,
    url: "/upload",
  },
  twitter: {
    ...siteMetadata.twitter,
    title: "Your files | CraneMail Files",
    description,
  },
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function UploadLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return children;
}
