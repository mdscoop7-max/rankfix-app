/**
 * Safe recovery for stopped AutoFix tasks (Astra F5, 31 Oct 2026).
 *
 * - Resume: a stopped task whose stop reason can change (CI, policy, temporary
 *   GitHub problems) goes back to the engine, which re-evaluates EVERYTHING
 *   fail-closed. Resuming never skips a check and never merges by itself.
 * - Legacy evidence: a task created before head/content evidence was stored is
 *   only recovered when the approved proposal content is found byte-for-byte at
 *   the PR's immutable head commit. Never filled in blindly from a branch head.
 * - Cancel: only a task that GitHub confirms is NOT merged; the PR stays open in
 *   GitHub for the owner to close.
 */
import { contentDigest, type FixRow, type PullInfo } from "./fix-engine.ts";
export { RESUMABLE_CODES, fixActions } from "./fix-engine.ts";

type Gh = <T>(path: string, init?: RequestInit) => Promise<T>;

export type StoredProposal = { proposed_content: string; base_blob_sha: string; file_path: string; repository: string; base_branch: string };
export type RecoveredEvidence = { ok: true; fields: { head_sha: string; approved_content_sha256: string; base_blob_sha: string } } | { ok: false; code: string };

const SHA40 = /^[0-9a-f]{40}$/i;

/**
 * Restores missing head/content/base evidence of a legacy task ONLY when the
 * approved proposal content is exactly the file at the PR's immutable head.
 */
export async function recoverLegacyEvidence(gh: Gh, row: FixRow, proposal: StoredProposal | null): Promise<RecoveredEvidence> {
  if (row.head_sha && row.approved_content_sha256 && row.base_blob_sha) return { ok: true, fields: { head_sha: row.head_sha, approved_content_sha256: row.approved_content_sha256, base_blob_sha: row.base_blob_sha } };
  if (!proposal || proposal.file_path !== row.file_path || proposal.repository.toLowerCase() !== String(row.repository || "").toLowerCase() || proposal.base_branch !== row.base_branch) return { ok: false, code: "EVIDENCE_MISSING" };
  const pr = await gh<PullInfo>(`/repos/${row.repository}/pulls/${Number(row.pr_number)}`);
  const head = String(pr.head?.sha || "");
  if (pr.merged || pr.merged_at || pr.state !== "open" || pr.head?.ref !== row.branch || !SHA40.test(head)) return { ok: false, code: "EVIDENCE_MISSING" };
  // A stored head SHA that differs from the PR head is a change, never "recovered".
  if (row.head_sha && row.head_sha !== head) return { ok: false, code: "HEAD_CHANGED" };
  const file = await gh<{ type?: string; encoding?: string; content?: string }>(`/repos/${row.repository}/contents/${row.file_path}?ref=${head}`);
  if (file?.type !== "file" || file.encoding !== "base64" || typeof file.content !== "string") return { ok: false, code: "CONTENT_UNAVAILABLE" };
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(file.content.replace(/\s/g, "")), (c) => c.charCodeAt(0))); } catch { return { ok: false, code: "CONTENT_MISMATCH" }; }
  if (text !== proposal.proposed_content) return { ok: false, code: "CONTENT_MISMATCH" };
  const digest = await contentDigest(proposal.proposed_content);
  if (row.approved_content_sha256 && row.approved_content_sha256 !== digest) return { ok: false, code: "CONTENT_MISMATCH" };
  if (row.base_blob_sha && row.base_blob_sha !== proposal.base_blob_sha) return { ok: false, code: "EVIDENCE_MISSING" };
  return { ok: true, fields: { head_sha: head, approved_content_sha256: digest, base_blob_sha: proposal.base_blob_sha } };
}
