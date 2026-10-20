import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("GitHub Fix Engine never auto-merges a proposed fix", () => {
  it("opens a PR without calling GitHub's merge endpoint", () => {
    const route = readFileSync(new URL("../../app/api/github/fix/route.ts", import.meta.url), "utf8");
    // Regression guard: avoid silently reintroducing the removed production merge call.
    expect(route).not.toMatch(/"\/pulls\/"\s*\+[^\n]{0,120}\+\s*"\/merge"/);
    expect(route).not.toMatch(/merge_method\s*:/);
    expect(route).toContain('const mergeState = "AWAITING_MERGE" as const;');
    expect(route).toContain("const merged = false;");
    expect(route).toContain('state:merged?"WAITING_FOR_LIVE_RESCAN":"WAITING_FOR_MERGE"');
  });

  it("labels the user action as PR creation, not website publication", () => {
    const page = readFileSync(new URL("../../app/dashboard/github/page.tsx", import.meta.url), "utf8");
    expect(page).toContain('approve:"Maak Pull Request"');
    expect(page).toContain('approve:"Create Pull Request"');
    expect(page).toMatch(/nooit automatisch samengevoegd/);
  });
});
