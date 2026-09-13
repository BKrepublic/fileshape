import assert from "node:assert/strict";
import test from "node:test";
import type { FileShapeDocument, DocumentTextBlock } from "../src/document-model.js";
import { serializeEpubXhtml } from "../src/epub-xhtml.js";

function block(page: number, index: number, text: string): DocumentTextBlock {
  return {
    kind: "text",
    sourcePage: page,
    semanticBlockIndex: index,
    unitIndexes: [index],
    semanticText: text,
    sourceRanges: [{ page, itemIndex: index, charStart: 0, charEnd: text.length }],
    inlines: [{
      kind: "text",
      text,
      sourceRanges: [{ page, itemIndex: index, charStart: 0, charEnd: text.length }],
    }],
  };
}

function fixture(): FileShapeDocument {
  const heading = "雨の日";
  const first = "　ただまあ、ここで少女がずぶ濡れになって一人ぼっちで居る、と";
  const second = "いうのも居心地が悪い。";
  return {
    kind: "document",
    id: "cross-page",
    imageResources: [],
    source: {
      documentId: "cross-page",
      pages: [
        { page: 1, textItems: [{ itemIndex: 0, text: heading }, { itemIndex: 1, text: first }] },
        { page: 2, textItems: [{ itemIndex: 0, text: second }] },
      ],
    },
    pages: [
      {
        kind: "page",
        sourcePage: 1,
        rotation: 0,
        orientation: "vertical",
        imageOccurrences: [],
        unresolvedRuby: [],
        unmappedExactRuby: [],
        blocks: [block(1, 0, heading), block(1, 1, first)],
      },
      {
        kind: "page",
        sourcePage: 2,
        rotation: 0,
        orientation: "vertical",
        imageOccurrences: [],
        unresolvedRuby: [],
        unmappedExactRuby: [],
        blocks: [block(2, 0, second)],
      },
    ],
  };
}

test("physical PDF page boundaries do not split or pad a paragraph that continues mid-sentence", () => {
  const result = serializeEpubXhtml(fixture(), {
    structuralHeadings: [{ title: "雨の日", sourcePage: 1, semanticBlockIndex: 0 }],
  });
  assert.equal(result.pages.length, 1);
  const xhtml = result.pages[0]!.xhtml;
  const before = xhtml.indexOf("一人ぼっちで居る、と");
  const after = xhtml.indexOf("いうのも居心地が悪い。");
  assert.ok(before >= 0 && after > before);
  assert.doesNotMatch(xhtml.slice(before, after), /<\/p>/);
  assert.match(
    xhtml,
    /一人ぼっちで居る、と<span id="source-page-2" class="fileshape-source-page-marker" data-source-page="2"><\/span><span class="fileshape-block-continuation"[^>]*>いうのも居心地が悪い。<\/span><\/p>/,
  );
  assert.doesNotMatch(
    xhtml,
    /一人ぼっちで居る、と\s+<span id="source-page-2"|<\/span>\s+<span class="fileshape-block-continuation"/,
  );
});

test("serializer adds no formatting whitespace at any continued physical page boundary", () => {
  const heading = "任意の題";
  const document: FileShapeDocument = {
    kind: "document",
    id: "cross-page-multiple",
    imageResources: [],
    source: {
      documentId: "cross-page-multiple",
      pages: [
        { page: 1, textItems: [{ itemIndex: 0, text: heading }, { itemIndex: 1, text: "　A、" }] },
        { page: 2, textItems: [{ itemIndex: 0, text: "B、" }] },
        { page: 3, textItems: [{ itemIndex: 0, text: "C。" }] },
      ],
    },
    pages: [
      { kind: "page", sourcePage: 1, rotation: 0, orientation: "vertical", imageOccurrences: [], unresolvedRuby: [], unmappedExactRuby: [], blocks: [block(1, 0, heading), block(1, 1, "　A、")] },
      { kind: "page", sourcePage: 2, rotation: 0, orientation: "vertical", imageOccurrences: [], unresolvedRuby: [], unmappedExactRuby: [], blocks: [block(2, 0, "B、")] },
      { kind: "page", sourcePage: 3, rotation: 0, orientation: "vertical", imageOccurrences: [], unresolvedRuby: [], unmappedExactRuby: [], blocks: [block(3, 0, "C。")] },
    ],
  };

  const xhtml = serializeEpubXhtml(document, {
    structuralHeadings: [{ title: heading, sourcePage: 1, semanticBlockIndex: 0 }],
  }).pages[0]!.xhtml;

  assert.match(
    xhtml,
    /A、<span id="source-page-2"[^>]*><\/span><span class="fileshape-block-continuation"[^>]*>B、<\/span><span id="source-page-3"[^>]*><\/span><span class="fileshape-block-continuation"[^>]*>C。<\/span><\/p>/,
  );
});
