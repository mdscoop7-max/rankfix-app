import { notFound } from "next/navigation";
import { isLocale, locales } from "@/lib/locales";
import { localeMetadata } from "@/lib/locale-metadata";
import Home from "../page";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return isLocale(locale) ? localeMetadata(locale) : {};
}

export default async function LocalizedHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Home initialLanguage={locale} />;
}
