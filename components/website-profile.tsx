export type WebsiteTechnologyProfile = {
  cms: string | null;
  commercePlatform: string | null;
  framework: string | null;
  isCommerce: boolean;
  confidence: number;
  confidenceLabel: "high" | "medium" | "low";
  evidence: string[];
};

export default function WebsiteProfile({ profile }: { profile?: WebsiteTechnologyProfile }) {
  return (
    <section data-rankfix="website-profile" className="mt-3 rounded-xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-600">
      <div className="font-bold text-slate-700">Websiteprofiel</div>
      {profile ? (
        <>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">Type: <strong>{profile.isCommerce ? "Webshop" : "Website"}</strong></span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">CMS: <strong>{profile.cms || "Niet bevestigd"}</strong></span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">Platform: <strong>{profile.commercePlatform || "Niet bevestigd"}</strong></span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">Framework: <strong>{profile.framework || "Niet bevestigd"}</strong></span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">Confidence: <strong>{profile.confidence}%</strong></span>
          </div>
          <div className="mt-2 text-slate-500">Bewijs: {profile.evidence?.length ? profile.evidence.join(" · ") : "Geen publiek platformfingerprint met voldoende bewijs gevonden."}</div>
        </>
      ) : (
        <div className="mt-2 text-amber-700">Platformprofiel ontbreekt in deze scanresponse. Scan opnieuw met de nieuwste scanner.</div>
      )}
    </section>
  );
}
