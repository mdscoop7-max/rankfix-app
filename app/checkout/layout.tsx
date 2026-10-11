import type { Metadata } from "next";

// Private application pages: never indexed, no canonical or hreflang.
export const metadata: Metadata = {
  title: "Checkout | RankFix AI",
  robots: { index: false, follow: false },
  alternates: { canonical: null, languages: {} },
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
