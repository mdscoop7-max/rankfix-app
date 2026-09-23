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
  description:
    "Verbeter je vindbaarheid met SEO- en GEO-audits voor Google en AI Search, inclusief concrete fixes.",
  keywords: ["SEO audit", "GEO audit", "AI Search", "Google vindbaarheid"],
  openGraph: {
    title: "RankFix AI — SEO + GEO Audit",
    description:
      "Verbeter je vindbaarheid met SEO- en GEO-audits voor Google en AI Search, inclusief concrete fixes.",
    type: "website",
    locale: "nl_NL",
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
