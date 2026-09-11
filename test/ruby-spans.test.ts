import assert from "node:assert/strict";
import test from "node:test";
import { associateRubySpans } from "../src/ruby-spans.js";
import { glyphPage, rubyRuns, type Run } from "./glyph-fixtures.js";

for (const vertical of [true, false]) for (const rotation of [0, 90, 180, 270]) {
  test(`exact ${vertical ? "vertical" : "horizontal"} source spans at rotation ${rotation}`, () => {
    const page = glyphPage(rubyRuns(vertical), rotation);
    const before = structuredClone(page);
    const [span] = associateRubySpans(page, 14);
    assert.equal(span?.status, "exact");
    assert.deepEqual(span?.baseSourceRanges, [{ page: 1, itemIndex: 0, charStart: 0, charEnd: 2 }]);
    assert.deepEqual(span?.annotationSourceRanges, [{ page: 1, itemIndex: 1, charStart: 0, charEnd: 3 }]);
    assert.equal(span?.baseGlyphRefs.length, 2);
    assert.deepEqual(page, before);
  });
}
test("proportional widths and punctuation choose measured glyphs, not uniform cells", () => {
  const page = glyphPage([
    { chars: ["W", "i", ",", "Z"], advances: [20, 4, 4, 14], x: 100, y: 100, size: 14, vertical: false },
    { chars: ["a", "b"], advances: [4, 4], x: 120, y: 89, size: 7, vertical: false },
  ]);
  assert.deepEqual(associateRubySpans(page, 14)[0]?.baseSourceRanges,
    [{ page: 1, itemIndex: 0, charStart: 1, charEnd: 3 }]);
});
test("a ligature is an indivisible glyph with multiple UTF-16 characters", () => {
  const page = glyphPage([
    { chars: ["ﬃ", "!"], advances: [14, 7], x: 100, y: 100, size: 14, vertical: false },
    { chars: ["a", "b"], advances: [7, 7], x: 100, y: 89, size: 7, vertical: false },
  ]);
  const span = associateRubySpans(page, 14)[0]!;
  assert.equal(span.status, "exact");
  assert.equal(span.baseGlyphRefs.length, 1);
  assert.equal(span.baseSourceRanges[0]?.charEnd, 3);
  assert.equal(page.operatorGlyphs?.[0]?.unicode, "ﬃ");
});
test("base and annotation may both span multiple extraction items", () => {
  const page = glyphPage([
    { chars: ["漢"], advances: [14], x: 200, y: 100, size: 14 },
    { chars: ["字"], advances: [14], x: 200, y: 114, size: 14 },
    { chars: ["か"], advances: [7], x: 211, y: 103.5, size: 7 },
    { chars: ["ん", "じ"], advances: [7, 7], x: 211, y: 110.5, size: 7 },
  ]);
  const [span] = associateRubySpans(page, 14);
  assert.equal(span?.status, "exact");
  assert.deepEqual(span?.baseSourceRanges.map((r) => r.itemIndex), [0, 1]);
  assert.deepEqual(span?.annotationSourceRanges.map((r) => r.itemIndex), [2, 3]);
});
test("adjacent columns remain distinct", () => {
  const runs = rubyRuns(); runs.push({ ...runs[0]!, x: 176 });
  assert.deepEqual(associateRubySpans(glyphPage(runs), 14)[0]?.baseSourceRanges.map((r) => r.itemIndex), [0]);
});
test("two qualifying base columns retain ambiguity", () => {
  const runs = rubyRuns(); runs.push({ ...runs[0]!, x: 197 });
  const span = associateRubySpans(glyphPage(runs), 14)[0]!;
  assert.equal(span.status, "unresolved"); assert.equal(span.reason, "ambiguous-base");
  assert.equal(span.alternatives.length, 2); assert.deepEqual(span.baseSourceRanges, []);
});
test("unrelated small text remains available without a base", () => {
  const runs = rubyRuns(); runs[1]!.x = 300;
  const span = associateRubySpans(glyphPage(runs), 14)[0]!;
  assert.equal(span.reason, "no-base"); assert.equal(span.annotationSourceRanges.length, 1);
});
test("bounded overhang can select a single complete base glyph", () => {
  const runs = rubyRuns(); runs[0]!.chars = ["漢"]; runs[0]!.advances = [14]; runs[1]!.y = 96.5;
  assert.equal(associateRubySpans(glyphPage(runs), 14)[0]?.status, "exact");
});
test("excessive overhang remains unresolved", () => {
  const runs = rubyRuns(); runs[1]!.chars = ["a", "b", "c", "d", "e", "f", "g", "h"];
  runs[1]!.advances = Array(8).fill(7); runs[1]!.y = 86;
  assert.equal(associateRubySpans(glyphPage(runs), 14)[0]?.status, "unresolved");
});
test("scale and translation leave source spans unchanged", () => {
  const expected = associateRubySpans(glyphPage(rubyRuns()), 14)[0]?.baseSourceRanges;
  for (const scale of [0.5, 3]) assert.deepEqual(associateRubySpans(glyphPage(rubyRuns(), 270, scale), 14)[0]?.baseSourceRanges, expected);
});
test("missing glyphs cannot be replaced with evenly divided run positions", () => {
  const page = glyphPage(rubyRuns()); page.textItems[0]!.glyphMapping = "unmapped"; page.textItems[0]!.glyphs = [];
  assert.equal(associateRubySpans(page, 14)[0]?.status, "unresolved");
});
test("duplicate overprinted text is ambiguous in source mapping", () => {
  const runs = rubyRuns(); runs.push({ ...runs[0]! });
  assert.equal(associateRubySpans(glyphPage(runs), 14)[0]?.status, "unresolved");
});
test("a discontinuous base range cannot skip a large gap", () => {
  const runs: Run[] = [
    { chars: ["a"], advances: [14], x: 200, y: 100, size: 14 },
    { chars: ["b"], advances: [14], x: 200, y: 124, size: 14 },
    { chars: ["x", "y", "z", "w", "v"], advances: [7, 7, 7, 7, 7], x: 211, y: 101, size: 7 },
  ];
  assert.equal(associateRubySpans(glyphPage(runs), 14)[0]?.reason, "noncontiguous-base");
});

test("an annotation edge through a base glyph center stays ambiguous", () => {
  const runs = rubyRuns(); runs[1]!.chars = ["a", "b"]; runs[1]!.advances = [7, 7]; runs[1]!.y = 107;
  const span = associateRubySpans(glyphPage(runs), 14)[0]!;
  assert.equal(span.status, "unresolved"); assert.equal(span.reason, "ambiguous-base");
});
test("overlapping annotation groups cannot both claim a base glyph", () => {
  const runs = rubyRuns(); runs.push({ ...runs[1]!, chars: ["x", "y", "z"] });
  const spans = associateRubySpans(glyphPage(runs), 14);
  assert.equal(spans.length, 2);
  assert.ok(spans.every((s) => s.reason === "conflicting-annotations" && s.baseSourceRanges.length === 0));
});
test("supplementary Unicode keeps UTF-16 offsets distinct from glyph indexes", () => {
  const runs = rubyRuns(); runs[0]!.chars = ["𠮷", "字"];
  const span = associateRubySpans(glyphPage(runs), 14)[0]!;
  assert.equal(span.status, "exact"); assert.equal(span.baseGlyphRefs.length, 2);
  assert.equal(span.baseSourceRanges[0]?.charEnd, 3);
});
