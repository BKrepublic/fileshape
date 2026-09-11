import assert from "node:assert/strict";
import { inspectPdf } from "./pdf-inspector.js";
import { associateRubySpans } from "./ruby-spans.js";
import { reconstructPageFlow } from "./text-flow.js";
import { reconstructPhysicalLayout } from "./physical-layout.js";
import { buildSemanticBlocks } from "./semantic-blocks.js";

// Fixture identities and expected text belong in verifiers, never in the parser.
try {
  const inspection = await inspectPdf("local-samples/N5221GF.pdf", { includeGlyphs: true });
  let exact = 0, unresolved = 0, mapped = 0, visible = 0;
  for (const page of inspection.pages) {
    assert.deepEqual(page.glyphIssues, []);
    for (const item of page.textItems) {
      if (item.text.trim()) visible++;
      if (item.glyphMapping === "exact") {
        mapped++;
        for (const glyph of item.glyphs ?? []) for (const ref of glyph.sourceRanges) {
          assert.equal(ref.page, page.page);
          assert.equal(page.textItems[ref.itemIndex]!.text.slice(ref.charStart, ref.charEnd), glyph.text);
        }
      }
    }
    const flow = reconstructPageFlow(page);
    const before = JSON.stringify(page.textItems);
    const physical = reconstructPhysicalLayout(page, flow.orientation, flow.bodyFontSize);
    const semantic = buildSemanticBlocks(physical, flow.bodyFontSize);
    const spans = associateRubySpans(page, flow.bodyFontSize);
    assert.equal(JSON.stringify(page.textItems), before);
    assert.equal(buildSemanticBlocks(physical, flow.bodyFontSize).text, semantic.text);
    exact += spans.filter((s) => s.status === "exact").length;
    unresolved += spans.filter((s) => s.status === "unresolved").length;
    const candidateItems = spans.flatMap((s) => s.annotationSourceRanges.map((r) => r.itemIndex)).sort((a, b) => a - b);
    const smallItems = page.textItems.flatMap((item, index) => item.text.trim() && item.fontSize > 0 &&
      item.fontSize < flow.bodyFontSize * 0.75 ? [index] : []);
    assert.deepEqual(candidateItems, smallItems, "every small-text source must remain represented");
    if (page.page === 4) {
      assert.equal(spans.length, 11);
      assert.ok(spans.every((s) => s.status === "exact"));
      const read = (refs: typeof spans[number]["baseSourceRanges"]) => refs.map((r) =>
        page.textItems[r.itemIndex]!.text.slice(r.charStart, r.charEnd)).join("");
      assert.deepEqual(spans.map((s) => [read(s.baseSourceRanges), read(s.annotationSourceRanges)]), [
        ["一", "ひと"], ["青空", "あおぞら"], ["下", "した"], ["学校", "がっこう"], ["車", "くるま"],
        ["一人", "ひとり"], ["耳", "みみ"], ["音", "おと"], ["手", "て"], ["上", "あ"], ["学校", "がっこう"],
      ]);
    }
  }
  console.log("FILESHAPE RUBY VERIFICATION: PASS");
  console.log(`Pages: ${inspection.pages.length}; mapped text runs: ${mapped}/${visible}; exact candidates: ${exact}; unresolved retained: ${unresolved}`);
  console.log("Representative exact base/annotation span pairs: 11/11");
} catch (error) {
  console.error("FILESHAPE RUBY VERIFICATION: FAIL");
  console.error(error);
  process.exitCode = 1;
}
