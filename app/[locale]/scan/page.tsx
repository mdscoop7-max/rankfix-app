import { notFound } from "next/navigation";
import { isLocale, locales } from "@/lib/locales";
import { localeMetadata } from "@/lib/locale-metadata";
import LocaleShell from "../shell";
import ScanClient from "./scan-client";
export function generateStaticParams() { return locales.map(locale => ({ locale })); }
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; return isLocale(locale) ? localeMetadata(locale, "scan") : {}; }
export default async function LocalizedScan({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (!isLocale(locale)) notFound();
  return <LocaleShell locale={locale} page="scan"><ScanClient locale={locale} /></LocaleShell>;
}
