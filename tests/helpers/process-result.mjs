import assert from "node:assert/strict";

// Fail on the actual process error before parsing its output. A failed spawn
// has no stdout; it must never become a misleading `undefined.split` error.
export function readProcessResult(out, prefix, label) {
  assert.ifError(out.error);
  assert.equal(out.status, 0, `${label}: exit=${out.status}, signal=${out.signal}\n${out.stderr || ""}\n${out.stdout || ""}`);
  assert.equal(typeof out.stdout, "string", `${label}: no stdout captured`);
  const line = out.stdout.split(/\r?\n/).find((value) => value.startsWith(prefix));
  assert.ok(line, `${label}: missing ${prefix}\n${out.stderr || ""}\n${out.stdout}`);
  return JSON.parse(line.slice(prefix.length));
}
