// axe-core rule run, evaluated inside the rendered page.
// QA 144: passing a bundled async FUNCTION to page.evaluate failed with
// "t is not defined" (transpiler helper missing in the page). This is plain
// JavaScript evaluated as-is, with no helpers.
/** Plain JavaScript evaluated in the page (no transpilation helpers). */
export const AXE_RUN_SCRIPT = `(async function () {
  var axe = window.axe;
  if (!axe) throw new Error("AXE_NOT_INJECTED");
  var result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
  return {
    violations: result.violations.slice(0, 30).map(function (rule) { return { id: rule.id, impact: rule.impact || "moderate", nodes: rule.nodes.length }; }),
    passes: result.passes.length,
    incomplete: result.incomplete.length,
    scope: "hydrated_wcag_a_aa"
  };
})()`;
