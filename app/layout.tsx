import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
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
  alternates: {
    canonical: "https://trendmix-q6fx.vercel.app/",
  },
  openGraph: {
    title: "RankFix AI — SEO + GEO Audit",
    description: "SEO en GEO audits voor Google en AI Search met concrete fixes.",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const language = (await headers()).get("x-rankfix-language") || "nl";
  return (
    <html
      lang={/^(nl|en|fr|es|it|de)$/.test(language) ? language : "nl"}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
