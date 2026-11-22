import test from "node:test";
import assert from "node:assert/strict";
import { emptyClientMount, emptyMountShell } from "../lib/render-limits.ts";

test("empty client mount: React/Vue/Angular shells are recognised, server-rendered pages are not", () => {
  assert.equal(emptyClientMount('<body><section class="todoapp" id="root"></section><script src="app.bundle.js"></script></body>'), true);
  assert.equal(emptyClientMount('<div id="app"></div>'), true);
  assert.equal(emptyClientMount('<div id="__next">\n</div>'), true);
  assert.equal(emptyClientMount("<app-root></app-root>"), true);
  assert.equal(emptyClientMount('<div id="root"><h1>Welkom</h1></div>'), false);
  assert.equal(emptyClientMount('<section id="root"></div>'), false);
  assert.equal(emptyClientMount('<div id="rootline"></div>'), false);
});

test("empty mount shell: thin body, one script and an empty mount point need one render", () => {
  const html = '<title>TodoMVC: React</title><section id="root"></section><script src="app.js"></script>';
  assert.equal(emptyMountShell({ html, visibleWords: 15, scriptCount: 1 }), true);
  assert.equal(emptyMountShell({ html, visibleWords: 15, scriptCount: 0 }), false);
  assert.equal(emptyMountShell({ html, visibleWords: 300, scriptCount: 1 }), false);
  assert.equal(emptyMountShell({ html: "<title>Blog</title><main><p>Kort</p></main><script src=a.js></script>", visibleWords: 15, scriptCount: 1 }), false);
});

test("scan route renders a thin empty-mount page once", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(route, /const javascriptCandidate = !recoveredHtml && \(javascriptFrameworkSignal \|\| thinClientShell \|\| identitylessThinDocument \|\| rawEmptyMountShell\)/);
  assert.match(route, /const rawEmptyMount = emptyClientMount\(rawHtml\)/);
});

test("render time scale: default 1 keeps timeouts, slow instances may scale up to 4x", async () => {
  const { scaledMs } = await import("../lib/render-limits.ts");
  assert.equal(scaledMs(12000), 12000);
  assert.equal(scaledMs(12000, 2.5), 30000);
  assert.equal(scaledMs(3500, 4), 14000);
  assert.equal(scaledMs(3500, 9), 3500);
  assert.equal(scaledMs(3500, 0.5), 3500);
});
