import assert from "node:assert/strict";
import test from "node:test";
import type { FileShapeDocument } from "../src/document-model.js";
import { serializeEpubXhtml } from "../src/epub-xhtml.js";

const RAW_TEXT = "半角ｶﾅ︑本文︒︵確認︶";
const DISPLAY_TEXT = "半角ｶﾅ、本文。（確認）";

function fixture(): FileShapeDocument {
  return {
    kind: "document",
    id: "urn:test:epub-presentation-text",
    imageResources: [],
    source: {
      documentId: "urn:test:epub-presentation-text",
      pages: [{
        page: 1,
        textItems: [{ itemIndex: 0, text: RAW_TEXT }],
      }],
    },
    pages: [{
      kind: "page",
      sourcePage: 1,
      rotation: 0,
      orientation: "vertical",
      imageOccurrences: [],
      unresolvedRuby: [],
      unmappedExactRuby: [],
      blocks: [{
        kind: "text",
        sourcePage: 1,
        semanticBlockIndex: 0,
        unitIndexes: [0],
        semanticText: RAW_TEXT,
        sourceRanges: [{ page: 1, itemIndex: 0, charStart: 0, charEnd: RAW_TEXT.length }],
        inlines: [{
          kind: "text",
          text: RAW_TEXT,
          sourceRanges: [{ page: 1, itemIndex: 0, charStart: 0, charEnd: RAW_TEXT.length }],
        }],
      }],
    }],
  };
}

test("EPUB XHTML normalizes vertical presentation punctuation without mutating source-backed text", () => {
  const document = fixture();
  const page = serializeEpubXhtml(document).pages[0];
  assert.ok(page);
  assert.match(page.xhtml, new RegExp(DISPLAY_TEXT));
  assert.doesNotMatch(page.xhtml, /[︑︒︵︶]/u);

  assert.equal(document.source.pages[0]?.textItems[0]?.text, RAW_TEXT);
  assert.equal(document.pages[0]?.blocks[0]?.semanticText, RAW_TEXT);
  const inline = document.pages[0]?.blocks[0]?.inlines[0];
  assert.equal(inline?.kind, "text");
  if (inline?.kind === "text") assert.equal(inline.text, RAW_TEXT);
});
