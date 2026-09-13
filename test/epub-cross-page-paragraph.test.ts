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
  const heading = "01　天使様は水も滴るいい女";
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

test("physical PDF page boundaries do not split a paragraph that continues mid-sentence", () => {
  const result = serializeEpubXhtml(fixture());
  assert.equal(result.pages.length, 1);
  const xhtml = result.pages[0]!.xhtml;
  const before = xhtml.indexOf("一人ぼっちで居る、と");
  const after = xhtml.indexOf("いうのも居心地が悪い。");
  assert.ok(before >= 0 && after > before);
  assert.doesNotMatch(xhtml.slice(before, after), /<\/p>/);
  assert.match(xhtml, /class="fileshape-block-continuation"[^>]*>いうのも居心地が悪い。<\/span><\/p>/);
  assert.match(xhtml, /id="source-page-2"/);
});
