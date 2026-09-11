import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readPdfOutline } from "../src/pdf-outline.js";
import { inspectPdf } from "../src/pdf-inspector.js";
import { buildDocumentFromInspection } from "../src/pdf-document-pipeline.js";
import { pdfBytes } from "./pdf-fixture.js";

type RawItem = NonNullable<Awaited<ReturnType<Parameters<typeof readPdfOutline>[0]["getOutline"]>>>[number];
const item = (dest: RawItem["dest"], title = "  𠮷 & <heading>  "): RawItem => ({ title, dest, items: [] });

test("outline resolves zero-based, indirect and named destinations without rewriting source metadata", async () => {
  const original = [item([0, { name: "Fit" }]), item([{ num: 42, gen: 0 }, { name: "XYZ" }, null, 100, null]), item("named")];
  original[0]!.items.push(item([1, { name: "FitH" }, null], "Child"));
  const before = structuredClone(original);
  const result = await readPdfOutline({
    numPages: 3,
    async getOutline() { return original; },
    async getDestination(name) { assert.equal(name, "named"); return [2, { name: "Fit" }]; },
    async getPageIndex(ref) { assert.deepEqual(ref, { num: 42, gen: 0 }); return 1; },
  });
  assert.deepEqual(result.map((node) => node.target), [1, 2, 3].map((sourcePage) => ({ status: "resolved", sourcePage })));
  assert.equal(result[0]!.items[0]!.target.status, "resolved");
  assert.equal(result[0]!.title, before[0]!.title);
  assert.deepEqual(result[1]!.destination, before[1]!.dest);
  assert.deepEqual(original, before);
  (original[1]!.dest as unknown[])[0] = 999;
  assert.deepEqual(result[1]!.destination, before[1]!.dest);
});

test("missing, invalid and external destinations remain explicit instead of guessed links", async () => {
  const nodes = [item(null), item("missing"), item([-1, {}]), item([3, {}]), item([0.5, {}]), item([{}, {}]),
    item([{ num: 10, gen: 0 }, {}]), { ...item("external"), unsafeUrl: "javascript:alert(1)" }];
  const lookedUp: string[] = [];
  const result = await readPdfOutline({
    numPages: 3,
    async getOutline() { return nodes; },
    async getDestination(name) { lookedUp.push(name); return null; },
    async getPageIndex() { throw new Error("missing page reference"); },
  });
  assert.ok(result.every((node) => node.target.status === "unresolved"));
  assert.deepEqual(result[0]!.target, { status: "unresolved", reason: "no-destination" });
  assert.deepEqual(result.at(-1)!.target, { status: "unresolved", reason: "external-destination" });
  assert.deepEqual(lookedUp, ["missing"]);
  assert.equal(result.at(-1)!.externalUrl, "javascript:alert(1)");
});

test("an absent outline is empty; outline extraction failures are not reported as absence", async () => {
  const reader = { numPages: 1, async getOutline() { return null; }, async getDestination() { return null; }, async getPageIndex() { return 0; } };
  assert.deepEqual(await readPdfOutline(reader), []);
  await assert.rejects(readPdfOutline({ ...reader, async getOutline() { throw new Error("cannot read outline"); } }), /cannot read outline/);
});

test("real PDF outline titles, hierarchy and named destinations reach the typed model", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "fileshape-outline-"));
  try {
    const input = path.join(temporary, "fixture.pdf");
    await writeFile(input, pdfBytes({ outline: true }));
    const inspection = await inspectPdf(input, { includeGlyphs: true });
    const document = buildDocumentFromInspection(inspection, "urn:fixture:outline").document;
    assert.equal(document.navigation?.length, 2);
    assert.equal(document.navigation?.[0]!.title, "Part & One");
    assert.deepEqual(document.navigation?.[0]!.children.map((child) => child.target), [
      { status: "resolved", sourcePage: 1 }, { status: "resolved", sourcePage: 1 },
    ]);
    assert.deepEqual(document.navigation?.[0]!.children[1]!.sourceOutlinePath, [0, 1]);
    assert.deepEqual(document.navigation?.[1]!.target, { status: "unresolved", reason: "external-destination" });
    inspection.outline![0]!.title = "tampered after construction";
    assert.equal(document.source.outline?.[0]!.title, "Part & One");
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
