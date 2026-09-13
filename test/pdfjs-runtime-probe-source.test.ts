import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("web/pdfjs-runtime-probe.ts", "utf8");

test("PDF.js readiness probe uses the same legacy build as conversion", () => {
  assert.match(source, /from "pdfjs-dist\/legacy\/build\/pdf\.mjs"/);
  assert.match(source, /from "pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs\?url"/);
  assert.doesNotMatch(source, /from "pdfjs-dist\/build\/pdf(?:\.worker)?\.mjs/);
});

test("PDF.js readiness probe allows a mobile cold-start window", () => {
  assert.match(source, /timeoutMs = 30_000/);
});
