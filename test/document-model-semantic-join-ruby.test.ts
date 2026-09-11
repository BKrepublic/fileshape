import assert from "node:assert/strict";
import test from "node:test";
import { assertDocumentModel, buildFileShapeDocument } from "../src/document-model.js";
import type { InspectPage, InspectResult } from "../src/pdf-inspector.js";
import type { RubySpan } from "../src/ruby-spans.js";
import type { SemanticPageBlocks } from "../src/semantic-blocks.js";

const baseLeft = { page: 1, itemIndex: 0, charStart: 0, charEnd: 1 } as const;
const baseRight = { page: 1, itemIndex: 1, charStart: 0, charEnd: 1 } as const;
const annotation = { page: 1, itemIndex: 2, charStart: 0, charEnd: 3 } as const;

test("ruby base may cross a semantic physical-wrap join without guessed splitting", () => {
  const page = {
    page: 1,
    rotation: 0,
    textItems: [{ text: "漢" }, { text: "字" }, { text: "かんじ" }],
  } as InspectPage;
  const inspection = {
    file: "semantic-join.pdf",
    byteLength: 1,
    pageCount: 1,
    pages: [page],
  } as InspectResult;
  const semantic: SemanticPageBlocks = {
    blocks: [{
      index: 0,
      kind: "text",
      unitIndexes: [0, 1],
      text: "漢字",
      sourceRanges: [baseLeft, baseRight],
    }],
    decisions: [],
    text: "漢字",
  };
  const span: RubySpan = {
    status: "exact",
    reason: "unique-contiguous-span",
    baseSourceRanges: [baseLeft, baseRight],
    annotationSourceRanges: [annotation],
    baseGlyphRefs: [
      { page: 1, operatorIndex: 1, glyphIndex: 0 },
      { page: 1, operatorIndex: 1, glyphIndex: 1 },
    ],
    annotationGlyphRefs: [{ page: 1, operatorIndex: 2, glyphIndex: 0 }],
    alternatives: [[baseLeft, baseRight]],
  };

  const document = buildFileShapeDocument({
    documentId: "semantic-join:1",
    inspection,
    pages: [{ page: 1, orientation: "vertical", semantic, rubySpans: [span] }],
  });
  assertDocumentModel(document);

  const block = document.pages[0]!.blocks[0]!;
  assert.deepEqual(block.unitIndexes, [0, 1]);
  assert.equal(block.inlines.length, 1);
  const ruby = block.inlines[0]!;
  assert.equal(ruby.kind, "ruby");
  if (ruby.kind === "ruby") {
    assert.equal(ruby.base.text, "漢字");
    assert.equal(ruby.annotation.text, "かんじ");
    assert.deepEqual(ruby.base.sourceRanges, [baseLeft, baseRight]);
  }
});
