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
  metadataBase: new URL("https://rankfix-app.onrender.com"),
  title: "RankFix AI — SEO & GEO Audit met concrete fixes",
  description: "Scan je website op technische SEO, content, structured data en AI-search readiness. RankFix geeft duidelijke verbeterpunten en concrete AI-fixvoorstellen.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "RankFix AI",
    title: "RankFix AI — SEO & GEO Audit met concrete fixes",
    description: "Scan technische SEO, content, structured data en AI-search readiness en krijg duidelijke verbeterpunten met concrete fixvoorstellen.",
  },
  twitter: {
    card: "summary",
    title: "RankFix AI — SEO & GEO Audit met concrete fixes",
    description: "Scan technische SEO, content, structured data en AI-search readiness met RankFix.",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const language = (await headers()).get("x-rankfix-language") || "nl";
  return (
    <html
      lang={/^(nl|en|fr|es|it|de)$/.test(language) ? language : "nl"}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": "https://rankfix-app.onrender.com/#organization",
                  name: "RankFix AI",
                  url: "https://rankfix-app.onrender.com/",
                },
                {
                  "@type": "WebSite",
                  "@id": "https://rankfix-app.onrender.com/#website",
                  url: "https://rankfix-app.onrender.com/",
                  name: "RankFix AI",
                  publisher: { "@id": "https://rankfix-app.onrender.com/#organization" },
                  inLanguage: ["nl", "en", "de", "fr", "es", "it"],
                },
              ],
            }),
          }}
        />
        {children}
      </body>
    </html>
  );
}
