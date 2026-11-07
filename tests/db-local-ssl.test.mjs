import test from "node:test";
import assert from "node:assert/strict";
import {postgresSslOptions} from "../lib/db.ts";

test("local Windows PostgreSQL does not require SSL under next start", () => {
  for (const url of [
    "postgresql://rankfix:secret@localhost:5432/rankfix",
    "postgresql://rankfix:secret@127.0.0.1:5432/rankfix",
    "postgresql://rankfix:secret@[::1]:5432/rankfix",
    "postgresql://rankfix:secret@LOCALHOST:5432/rankfix",
  ]) {
    assert.equal(postgresSslOptions(url, "production"), false);
    assert.equal(postgresSslOptions(url, "development"), false);
  }
});

test("remote production PostgreSQL retains existing SSL configuration", () => {
  assert.deepEqual(
    postgresSslOptions("postgresql://rankfix:secret@db.example.com:5432/rankfix", "production"),
    {rejectUnauthorized: false}
  );
  assert.equal(
    postgresSslOptions("postgresql://rankfix:secret@db.example.com:5432/rankfix", "development"),
    undefined
  );
});

test("malformed database URLs are not silently interpreted as loopback", () => {
  assert.deepEqual(postgresSslOptions("not-a-postgres-url", "production"), {rejectUnauthorized: false});
});
