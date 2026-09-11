import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDocumentModel,
  buildFileShapeDocument,
  resolveSourceRanges,
  validateDocumentModel,
  type FileShapeDocument,
} from "../src/document-model.js";
import type { InspectPage, InspectResult } from "../src/pdf-inspector.js";
import type { RubySpan } from "../src/ruby-spans.js";
import type { SemanticPageBlocks } from "../src/semantic-blocks.js";
import type { SourceGlyphRef, SourceTextRef } from "../src/source-text.js";
import type { WritingOrientation } from "../src/text-flow.js";

const ref = (itemIndex: number, charStart: number, charEnd: number): SourceTextRef =>
  ({ page: 1, itemIndex, charStart, charEnd });
const glyph = (operatorIndex: number, glyphIndex = 0): SourceGlyphRef =>
  ({ page: 1, operatorIndex, glyphIndex });

function exact(
  baseSourceRanges: SourceTextRef[],
  annotationSourceRanges: SourceTextRef[],
  baseGlyphRefs: SourceGlyphRef[] = [glyph(1)],
  annotationGlyphRefs: SourceGlyphRef[] = [glyph(2)],
): RubySpan {
  return {
    status: "exact",
    reason: "unique-contiguous-span",
    baseSourceRanges,
    annotationSourceRanges,
    baseGlyphRefs,
    annotationGlyphRefs,
    alternatives: [baseSourceRanges.map((range) => ({ ...range }))],
  };
}

function unresolved(
  annotationSourceRanges: SourceTextRef[],
  reason: RubySpan["reason"] = "no-base",
  alternatives: SourceTextRef[][] = [],
): RubySpan {
  return {
    status: "unresolved",
    reason,
    baseSourceRanges: [],
    annotationSourceRanges,
    baseGlyphRefs: [],
    annotationGlyphRefs: [glyph(9)],
    alternatives,
  };
}

function build(
  texts: string[],
  blockRanges: SourceTextRef[],
  rubySpans: RubySpan[] = [],
  options: { semanticText?: string; orientation?: WritingOrientation; rotation?: number } = {},
): FileShapeDocument {
  const page = {
    page: 1,
    rotation: options.rotation ?? 0,
    textItems: texts.map((text) => ({ text })),
  } as InspectPage;
  const inspection = {
    file: "fixture.pdf",
    byteLength: 1,
    pageCount: 1,
    pages: [page],
  } as InspectResult;
  const semantic: SemanticPageBlocks = {
    blocks: [{ index: 0, kind: "text", unitIndexes: [0], text: options.semanticText ?? resolveRaw(texts, blockRanges), sourceRanges: blockRanges }],
    decisions: [],
    text: options.semanticText ?? resolveRaw(texts, blockRanges),
  };
  const document = buildFileShapeDocument({
    documentId: "fixture:1",
    inspection,
    pages: [{ page: 1, orientation: options.orientation ?? "horizontal", semantic, rubySpans }],
  });
  assertDocumentModel(document);
  return document;
}

function resolveRaw(texts: string[], ranges: SourceTextRef[]): string {
  return ranges.map((range) => texts[range.itemIndex]!.slice(range.charStart, range.charEnd)).join("");
}

function rubyNodes(document: FileShapeDocument) {
  return document.pages[0]!.blocks[0]!.inlines.filter((inline) => inline.kind === "ruby");
}

test("plain text becomes a source-backed inline node", () => {
  const document = build(["plain"], [ref(0, 0, 5)]);
  assert.deepEqual(document.pages[0]!.blocks[0]!.inlines, [
    { kind: "text", text: "plain", sourceRanges: [ref(0, 0, 5)] },
  ]);
});

test("exact ruby becomes a typed inline node without substring placement", () => {
  const span = exact([ref(0, 1, 2)], [ref(1, 0, 2)]);
  const document = build(["A漢B", "かん"], [ref(0, 0, 3)], [span]);
  const inlines = document.pages[0]!.blocks[0]!.inlines;
  assert.equal(inlines.length, 3);
  assert.deepEqual(inlines[0], { kind: "text", text: "A", sourceRanges: [ref(0, 0, 1)] });
  assert.equal(inlines[1]?.kind, "ruby");
  if (inlines[1]?.kind === "ruby") {
    assert.equal(inlines[1].base.text, "漢");
    assert.equal(inlines[1].annotation.text, "かん");
  }
  assert.deepEqual(inlines[2], { kind: "text", text: "B", sourceRanges: [ref(0, 2, 3)] });
});

test("ruby base may span multiple TextItems", () => {
  const span = exact([ref(0, 0, 1), ref(1, 0, 1)], [ref(2, 0, 3)], [glyph(1), glyph(1, 1)]);
  const document = build(["漢", "字", "かんじ"], [ref(0, 0, 1), ref(1, 0, 1)], [span]);
  const ruby = rubyNodes(document)[0];
  assert.equal(ruby?.kind, "ruby");
  if (ruby?.kind === "ruby") {
    assert.equal(ruby.base.text, "漢字");
    assert.deepEqual(ruby.base.sourceRanges, [ref(0, 0, 1), ref(1, 0, 1)]);
  }
});

test("ruby annotation may span multiple TextItems", () => {
  const span = exact([ref(0, 0, 2)], [ref(1, 0, 1), ref(2, 0, 2)]);
  const document = build(["漢字", "か", "んじ"], [ref(0, 0, 2)], [span]);
  const ruby = rubyNodes(document)[0];
  assert.equal(ruby?.kind, "ruby");
  if (ruby?.kind === "ruby") {
    assert.equal(ruby.annotation.text, "かんじ");
    assert.deepEqual(ruby.annotation.sourceRanges, [ref(1, 0, 1), ref(2, 0, 2)]);
  }
});

test("semantic joins retain source ranges from every TextItem", () => {
  const document = build(["前", "後"], [ref(0, 0, 1), ref(1, 0, 1)]);
  const inline = document.pages[0]!.blocks[0]!.inlines[0]!;
  assert.equal(inline.kind, "text");
  if (inline.kind === "text") {
    assert.equal(inline.text, "前後");
    assert.deepEqual(inline.sourceRanges, [ref(0, 0, 1), ref(1, 0, 1)]);
  }
});

test("a ligature source range is never split by glyph count", () => {
  const span = exact([ref(0, 0, 3)], [ref(1, 0, 2)], [glyph(4)]);
  const document = build(["ffi!", "エフ"], [ref(0, 0, 4)], [span]);
  const ruby = rubyNodes(document)[0];
  assert.equal(ruby?.kind, "ruby");
  if (ruby?.kind === "ruby") {
    assert.equal(ruby.base.text, "ffi");
    assert.deepEqual(ruby.base.sourceRanges, [ref(0, 0, 3)]);
    assert.equal(ruby.base.glyphRefs.length, 1);
  }
});

test("supplementary Unicode keeps half-open UTF-16 offsets", () => {
  const span = exact([ref(0, 0, 2)], [ref(1, 0, 2)]);
  const document = build(["𠮷字", "よし"], [ref(0, 0, 3)], [span]);
  const ruby = rubyNodes(document)[0];
  assert.equal(ruby?.kind, "ruby");
  if (ruby?.kind === "ruby") {
    assert.equal(ruby.base.text, "𠮷");
    assert.deepEqual(ruby.base.sourceRanges, [ref(0, 0, 2)]);
  }
  assert.equal(document.pages[0]!.blocks[0]!.inlines[1]?.kind, "text");
});

test("unresolved ruby is retained with reason and source evidence", () => {
  const candidate = unresolved([ref(1, 0, 2)], "no-base");
  const document = build(["本文", "注記"], [ref(0, 0, 2)], [candidate]);
  assert.deepEqual(document.pages[0]!.unresolvedRuby, [candidate]);
  assert.equal(resolveSourceRanges(document.source, document.pages[0]!.unresolvedRuby[0]!.annotationSourceRanges), "注記");
});

test("ambiguous alternatives remain available for later decisions", () => {
  const candidate = unresolved([ref(2, 0, 2)], "ambiguous-base", [[ref(0, 0, 1)], [ref(1, 0, 1)]]);
  const document = build(["甲", "乙", "こう"], [ref(0, 0, 1), ref(1, 0, 1)], [candidate]);
  assert.deepEqual(document.pages[0]!.unresolvedRuby[0]!.alternatives, [[ref(0, 0, 1)], [ref(1, 0, 1)]]);
});

test("small text that is not ruby remains in the source store and unresolved candidates", () => {
  const candidate = unresolved([ref(1, 0, 5)], "no-base");
  const document = build(["本文", "small"], [ref(0, 0, 2)], [candidate]);
  const retained = document.pages[0]!.unresolvedRuby[0]!.annotationSourceRanges;
  assert.equal(resolveSourceRanges(document.source, retained), "small");
  assert.equal(document.source.pages[0]!.textItems[1]!.text, "small");
});

test("whitespace remains addressable even when semanticText is a trimmed view", () => {
  const document = build([" a "], [ref(0, 0, 3)], [], { semanticText: "a" });
  const block = document.pages[0]!.blocks[0]!;
  assert.equal(block.semanticText, "a");
  assert.equal(block.inlines[0]?.kind, "text");
  if (block.inlines[0]?.kind === "text") assert.equal(block.inlines[0].text, " a ");
});

test("rotation and vertical orientation do not rewrite provenance", () => {
  const base = [ref(0, 0, 2)];
  const annotation = [ref(1, 0, 3)];
  const span = exact(base, annotation);
  const document = build(["漢字", "かんじ"], base, [span], { orientation: "vertical", rotation: 90 });
  const page = document.pages[0]!;
  assert.equal(page.rotation, 90);
  assert.equal(page.orientation, "vertical");
  const ruby = rubyNodes(document)[0];
  assert.equal(ruby?.kind, "ruby");
  if (ruby?.kind === "ruby") {
    assert.deepEqual(ruby.base.sourceRanges, base);
    assert.deepEqual(ruby.annotation.sourceRanges, annotation);
  }
});

test("model invariants detect source ownership corruption", () => {
  const document = build(["abc"], [ref(0, 0, 3)]);
  const inline = document.pages[0]!.blocks[0]!.inlines[0]!;
  assert.equal(inline.kind, "text");
  if (inline.kind === "text") inline.sourceRanges.push(ref(0, 1, 2));
  assert.ok(validateDocumentModel(document).some((error) => error.includes("overlap")));
});
