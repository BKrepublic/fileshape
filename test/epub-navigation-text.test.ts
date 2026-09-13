import assert from "node:assert/strict";
import test from "node:test";
import type { FileShapeDocument } from "../src/document-model.js";
import { serializeEpubNavigation } from "../src/epub-navigation.js";
import { normalizeEpubNavigationText } from "../src/epub-navigation-text.js";
import { serializeLegacyNcx } from "../src/epub-ncx.js";
import { serializeEpubXhtml } from "../src/epub-xhtml.js";

const RAW_HEADING = "グルートの窟︵後書き︶";
const DISPLAY_HEADING = "グルートの窟（後書き）";

function fixture(): FileShapeDocument {
  return {
    kind: "document",
    id: "urn:test:vertical-navigation-punctuation",
    imageResources: [],
    source: {
      documentId: "urn:test:vertical-navigation-punctuation",
      pages: [{
        page: 1,
        textItems: [{ itemIndex: 0, text: RAW_HEADING }],
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
        semanticText: RAW_HEADING,
        sourceRanges: [{ page: 1, itemIndex: 0, charStart: 0, charEnd: RAW_HEADING.length }],
        inlines: [{
          kind: "text",
          text: RAW_HEADING,
          sourceRanges: [{ page: 1, itemIndex: 0, charStart: 0, charEnd: RAW_HEADING.length }],
        }],
      }],
    }],
  };
}

test("normalizes only vertical presentation punctuation for horizontal EPUB navigation", () => {
  assert.equal(
    normalizeEpubNavigationText("︐︑︒︓︔︕︖︗︘︙︰︱︲︵︶︷︸︹︺︻︼︽︾︿﹀﹁﹂﹃﹄﹇﹈"),
    "，、。：；！？〖〗…‥—–（）｛｝〔〕【】《》〈〉「」『』［］",
  );
  assert.equal(normalizeEpubNavigationText("半角ｶﾅ ABC 123"), "半角ｶﾅ ABC 123");
});

test("EPUB3 nav and legacy NCX display ordinary parentheses without mutating source-backed heading text", () => {
  const document = fixture();
  const pages = serializeEpubXhtml(document, {
    structuralHeadings: [{ title: RAW_HEADING, sourcePage: 1, semanticBlockIndex: 0 }],
  }).pages;

  assert.equal(pages[0]?.heading?.title, RAW_HEADING);

  const nav = serializeEpubNavigation(document, "Book", "ja", pages).xhtml;
  assert.match(nav, new RegExp(DISPLAY_HEADING));
  assert.doesNotMatch(nav, /︵|︶/u);

  const ncx = serializeLegacyNcx(document, "Book", document.id, pages);
  assert.match(ncx, new RegExp(DISPLAY_HEADING));
  assert.doesNotMatch(ncx, /︵|︶/u);
});
