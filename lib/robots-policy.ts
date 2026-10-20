// Pure robots.txt evaluation (RFC 9309 semantics). A crawler obeys ONLY the most
// specific group that names it; the wildcard group `*` is a fallback, never merged
// with a bot-specific group. Within the chosen group the longest matching rule
// wins and Allow wins a tie. No site-specific logic.

export type RobotsRule = { kind: "allow" | "disallow"; path: string };
export type RobotsGroup = { agents: string[]; rules: RobotsRule[] };

export function parseRobotsGroups(robotsTxt: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const agent = line.match(/^user-agent\s*:\s*(.+)$/i)?.[1]?.trim().toLowerCase();
    if (agent) {
      // Consecutive user-agent lines share one group; a rule closes the group.
      if (lastWasAgent && groups.length) groups[groups.length - 1].agents.push(agent);
      else groups.push({ agents: [agent], rules: [] });
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    const rule = line.match(/^(allow|disallow)\s*:\s*(.*)$/i);
    if (rule && groups.length) groups[groups.length - 1].rules.push({ kind: rule[1].toLowerCase() as RobotsRule["kind"], path: rule[2].trim() });
  }
  return groups;
}

/** Longest agent token that is contained in the bot name wins; `*` is the fallback. */
export function selectGroupsForBot(groups: RobotsGroup[], botName: string): { groups: RobotsGroup[]; matchedAgent: string } {
  const bot = botName.toLowerCase();
  let best = "";
  for (const group of groups) {
    for (const agent of group.agents) {
      if (agent !== "*" && agent && bot.includes(agent) && agent.length > best.length) best = agent;
    }
  }
  if (best) return { groups: groups.filter((group) => group.agents.includes(best)), matchedAgent: best };
  return { groups: groups.filter((group) => group.agents.includes("*")), matchedAgent: "*" };
}

export function robotsPatternMatches(rulePath: string, candidatePath: string): boolean {
  if (!rulePath) return false; // an empty Disallow allows everything
  const anchored = rulePath.endsWith("$");
  const raw = anchored ? rulePath.slice(0, -1) : rulePath;
  const escaped = raw.split("*").map((part) => part.replace(/[.+?^{}()|[\]\\]/g, "\\$&")).join(".*");
  try { return new RegExp("^" + escaped + (anchored ? "$" : "")).test(candidatePath); } catch { return false; }
}

export type RobotsVerdict = {
  bot: string;
  matchedAgent: string;
  blocked: boolean;
  rule: RobotsRule | null;
};

export function evaluateRobotsForBot(groups: RobotsGroup[], botName: string, path: string): RobotsVerdict {
  const selected = selectGroupsForBot(groups, botName);
  const matches = selected.groups
    .flatMap((group) => group.rules)
    .filter((rule) => robotsPatternMatches(rule.path, path))
    .sort((a, b) => b.path.length - a.path.length || (a.kind === "allow" ? -1 : 1));
  const rule = matches[0] || null;
  return { bot: botName, matchedAgent: selected.matchedAgent, blocked: rule?.kind === "disallow", rule };
}

export type RobotsAssessment = {
  /** "google" is the reference crawler for the indexability verdict. */
  google: RobotsVerdict;
  rankfix: RobotsVerdict;
  /** Wildcard rule blocks the path but Googlebot has its own group that allows it. */
  wildcardOnlyBlock: boolean;
  /** Indexability verdict: only a block that applies to Googlebot is a warning. */
  blockedForGoogle: boolean;
};

export function assessRobots(robotsTxt: string, path: string): RobotsAssessment {
  const groups = parseRobotsGroups(robotsTxt);
  const google = evaluateRobotsForBot(groups, "googlebot", path);
  const rankfix = evaluateRobotsForBot(groups, "rankfixbot", path);
  const wildcard = evaluateRobotsForBot(groups, "*", path);
  return {
    google,
    rankfix,
    wildcardOnlyBlock: wildcard.blocked && !google.blocked,
    blockedForGoogle: google.blocked,
  };
}
