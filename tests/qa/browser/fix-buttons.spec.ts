import { expect, test } from "@playwright/test";

test("anonymous visitors cannot publish GitHub fixes through the real local API", async ({ request }) => {
  const response = await request.post("/api/github/fix", {
    data: { preview: false, repo: "qa/sandbox", path: "app/page.tsx", issue_id: "H1_MISSING" },
  });
  expect(response.status()).toBe(401);
  const data = await response.json();
  expect(data.error).toBeTruthy();
});

test("Fix button requires preview before publish (mocked API; no GitHub write)", async ({ page }) => {
  // These fixtures exercise the REAL dashboard buttons and client code, never a real account.
  await page.route("**/api/github/configuration", (route) => route.fulfill({ json: { ready: true } }));
  await page.route("**/api/github/status", (route) => route.fulfill({
    json: { connected: true, connection: { github_login: "qa-fixture" } },
  }));
  await page.route("**/api/github/repos", (route) => route.fulfill({
    json: { repos: [{ full_name: "qa/sandbox", default_branch: "main", private: false }] },
  }));
  await page.route("**/api/github/site-repository?*", (route) => route.fulfill({ json: { mapped: false } }));
  await page.route("**/api/history", (route) => route.fulfill({ json: { usage: { plan: "pro" } } }));
  await page.route("**/api/history/*", (route) => route.fulfill({ status: 404, json: { error: "QA fixture" } }));
  await page.route("**/api/account/language", (route) => route.fulfill({ json: { language: "nl" } }));

  const sent: Array<Record<string, unknown>> = [];
  await page.route("**/api/github/fix", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    sent.push(body);
    if (body.preview === true) {
      await route.fulfill({
        json: {
          success: true, status: "preview", summary: "QA: voeg H1 toe",
          proposal_id: "qa-proposal", proposal_hash: "qa-hash",
          preview: { startLine: 1, before: ["<p>Welkom</p>"], after: ["<h1>Welkom</h1>"], changedLines: 1 },
        },
      });
    } else {
      await route.fulfill({
        json: {
          success: true, status: "awaiting_merge", repository: "qa/sandbox",
          merge: { merged: false, blocked: true, reason: "QA: no merge" },
          pr: { number: 7, url: "https://github.com/qa/sandbox/pull/7" },
        },
      });
    }
  });

  await page.goto("/dashboard/github?scan_id=qa-scan&issue_id=H1_MISSING&url=https%3A%2F%2Fexample.org%2F");
  await expect(page.getByRole("heading", { name: /Van verbeterpunt naar gecontroleerde oplossing/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bekijk eerst de voorgestelde wijziging" })).toBeDisabled();

  await page.locator("form select").selectOption("qa/sandbox");
  const previewButton = page.getByRole("button", { name: "Bekijk eerst de voorgestelde wijziging" });
  await expect(previewButton).toBeEnabled();
  await expect.poll(() => sent.length).toBe(0);

  await previewButton.click();
  await expect(page.getByText("QA: voeg H1 toe")).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0].preview).toBe(true);

  await page.getByRole("button", { name: "Fix publiceren" }).click();
  await expect(page.getByText(/Pull Request aangemaakt/i)).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(sent[1].preview).toBe(false);
  expect(sent[1].proposal_id).toBe("qa-proposal");
  expect(sent[1].proposal_hash).toBe("qa-hash");
});
