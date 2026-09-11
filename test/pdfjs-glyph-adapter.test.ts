import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { inspectPdf } from "../src/pdf-inspector.js";
import { extractOperatorGlyphs } from "../src/pdfjs-glyph-adapter.js";
import { associateRubySpans } from "../src/ruby-spans.js";
import { viewport } from "./glyph-fixtures.js";

/** Minimal real PDF, standard-font metrics supplied by PDF.js, not this fixture. */
function pdfBytes(rotation: number): Buffer {
  const content = "BT /F1 20 Tf 1 0 0 1 100 500 Tm (Wi,) Tj ET\nBT /F1 10 Tf 1 0 0 1 101 516 Tm (abc) Tj ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Rotate ${rotation} /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let text = "%PDF-1.7\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(text)); text += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(text);
  text += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text);
}

for (const rotation of [0, 90, 180, 270]) test(`real PDF.js glyph advances and display geometry at ${rotation} degrees`, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fileshape-glyph-test-"));
  try {
    const file = path.join(directory, "fixture.pdf"); await writeFile(file, pdfBytes(rotation));
    const page = (await inspectPdf(file, { includeGlyphs: true })).pages[0]!;
    assert.deepEqual(page.glyphIssues, []);
    const base = page.textItems.find((i) => i.text === "Wi,")!;
    assert.equal(base.glyphMapping, "exact");
    assert.deepEqual(base.glyphs?.map((g) => Math.round(g.geometry.inlineExtent * 100) / 100), [18.88, 4.44, 5.56]);
    const b = base.displayGeometry!;
    assert.ok(Math.abs(b.inlineExtent - 28.88) < 0.01);
    assert.ok(Math.abs(b.displayWidth - (rotation % 180 === 0 ? 28.88 : 20)) < 0.01);
    assert.ok(Math.abs(b.displayHeight - (rotation % 180 === 0 ? 20 : 28.88)) < 0.01);
    const [span] = associateRubySpans(page, 20);
    assert.equal(span?.status, "exact");
    assert.equal(span?.baseSourceRanges[0]?.charStart, 0);
    assert.equal(span?.baseSourceRanges[0]?.charEnd, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("operator replay includes TJ kerning, text rise, HScale, CTM and character/word spacing", () => {
  const fnArray = [OPS.transform, OPS.beginText, OPS.setFont, OPS.setTextMatrix, OPS.setHScale,
    OPS.setCharSpacing, OPS.setWordSpacing, OPS.setTextRise, OPS.showText];
  const argsArray = [[2, 0, 0, 2, 10, 20], [], ["resource", 10], [[1, 0, 0, 1, 100, 200]],
    [50], [1], [2], [3], [[{ unicode: "A", width: 600 }, -200, { unicode: " ", width: 200, isSpace: true }, { unicode: "i", width: 200 }]]];
  const { glyphs, issues } = extractOperatorGlyphs(1, { fnArray, argsArray }, [1, 0, 0, -1, 0, 800], () => ({ vertical: false }));
  assert.deepEqual(issues, []);
  assert.deepEqual(glyphs.map((g) => g.geometry.start), [{ x: 210, y: 374 }, { x: 219, y: 374 }, { x: 224, y: 374 }]);
  assert.deepEqual(glyphs.map((g) => g.geometry.inlineExtent), [6, 2, 2]);
});
test("save/restore and Form XObject transforms do not leak into later glyphs", () => {
  const show = [{ unicode: "A", width: 1000 }];
  const fnArray = [OPS.beginText, OPS.setFont, OPS.setTextMatrix, OPS.paintFormXObjectBegin,
    OPS.transform, OPS.showText, OPS.paintFormXObjectEnd, OPS.showText];
  const argsArray = [[], ["resource", 10], [[1, 0, 0, 1, 100, 200]], [[1, 0, 0, 1, 30, 0], null],
    [1, 0, 0, 1, 20, 0], [show], [], [show]];
  const { glyphs, issues } = extractOperatorGlyphs(1, { fnArray, argsArray }, viewport(), () => ({ vertical: false }));
  assert.deepEqual(issues, []);
  assert.equal(glyphs[0]!.geometry.start.x - glyphs[1]!.geometry.start.x, 50);
});
test("unsupported Type3 metrics fail closed without affecting source text extraction", () => {
  const result = extractOperatorGlyphs(1, { fnArray: [OPS.setFont, OPS.showText],
    argsArray: [["resource", 14], [[{ unicode: "a", width: 500 }]]] }, viewport(), () => ({ isType3Font: true }));
  assert.deepEqual(result.glyphs, []); assert.deepEqual(result.issues, ["unsupported-font-metrics"]);
});
