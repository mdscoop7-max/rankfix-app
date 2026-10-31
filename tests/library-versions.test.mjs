import test from "node:test";
import assert from "node:assert/strict";
import { detectOutdatedLibraries } from "../lib/library-versions.ts";

test("old library versions in script URLs are reported, current ones are not", () => {
  const old = '<script src="/js/jquery-ui-1.12.1.min.js"></script><script src="https://code.jquery.com/jquery-3.4.1.min.js"></script><script src="/a/angular-1.8.2.min.js"></script>';
  assert.deepEqual(detectOutdatedLibraries(old).map((l) => l.name).sort(), ["AngularJS", "jQuery", "jQuery UI"]);
  const fresh = '<script src="/js/jquery-3.7.1.min.js"></script><script src="/js/jquery-ui-1.13.3.min.js"></script><link href="/c/bootstrap-5.3.2.min.css">';
  assert.deepEqual(detectOutdatedLibraries(fresh), []);
});

test("a library name without a version in the URL is not guessed", () => {
  assert.deepEqual(detectOutdatedLibraries('<script src="/assets/jquery.min.js"></script><p>jQuery 1.2 is old</p>'), []);
});
