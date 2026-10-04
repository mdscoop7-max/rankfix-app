import { ImageResponse } from "next/og";

export const alt = "RankFix AI — SEO & GEO Audit";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #07111f 0%, #0b1d3a 48%, #34206f 100%)",
          color: "white",
          padding: "64px",
          fontFamily: "Arial, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: "58%", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 48, fontWeight: 800 }}>
            <span>Rank</span><span style={{ color: "#27a7ff" }}>Fix</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 66, lineHeight: 1.02, fontWeight: 800 }}>Jouw website.</div>
            <div style={{ fontSize: 66, lineHeight: 1.02, fontWeight: 800, color: "#55b8ff" }}>Meer zichtbaarheid.</div>
            <div style={{ marginTop: 26, fontSize: 28, color: "#c5d4ea", lineHeight: 1.35 }}>
              SEO & GEO audits voor Google en AI-search met concrete fixes.
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 22, color: "#d9e7f7" }}>
            <span>SEO</span><span>•</span><span>GEO</span><span>•</span><span>AI Fix</span><span>•</span><span>Reports</span>
          </div>
        </div>
        <div style={{ display: "flex", width: "42%", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            width: 390, height: 390, borderRadius: 36, background: "rgba(7,17,31,.78)",
            border: "2px solid rgba(76,180,255,.5)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", boxShadow: "0 0 70px rgba(68,113,255,.35)"
          }}>
            <div style={{ fontSize: 24, color: "#9fb4cf" }}>Jouw RankFix resultaat</div>
            <div style={{ marginTop: 22, width: 190, height: 190, borderRadius: "50%", border: "18px solid #35e58a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 64, fontWeight: 800 }}>98</div>
              <div style={{ fontSize: 22 }}>Overall</div>
            </div>
            <div style={{ marginTop: 20, fontSize: 22, color: "#35e58a", fontWeight: 700 }}>Grade A</div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
