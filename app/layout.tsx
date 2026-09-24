import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RankFix AI — SEO + GEO Audit",
  description: "SEO en GEO audits voor Google en AI Search met concrete fixes.",
  openGraph: {
    title: "RankFix AI — SEO + GEO Audit",
    description: "SEO en GEO audits voor Google en AI Search met concrete fixes.",
    images: ["https://1kapper.nl/images/salon_header.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="nl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
