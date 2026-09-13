import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentPage, FileShapeDocument } from "../src/document-model.js";
import { serializeEpubNavigation } from "../src/epub-navigation.js";
import { serializeEpubXhtml } from "../src/epub-xhtml.js";

function documentFixture(texts: string[]): FileShapeDocument {
  const pages: DocumentPage[] = texts.map((text, index) => {
    const page = index + 1;
    return {
      kind: "page",
      sourcePage: page,
      rotation: 0,
      orientation: "vertical",
      imageOccurrences: [],
      unresolvedRuby: [],
      unmappedExactRuby: [],
      blocks: [{
        kind: "text",
        sourcePage: page,
        semanticBlockIndex: 0,
        unitIndexes: [0],
        semanticText: text,
        sourceRanges: [{ page, itemIndex: 0, charStart: 0, charEnd: text.length }],
        inlines: [{
          kind: "text",
          text,
          sourceRanges: [{ page, itemIndex: 0, charStart: 0, charEnd: text.length }],
        }],
      }],
    };
  });
  return {
    kind: "document",
    id: "logical-flow",
    imageResources: [],
    source: {
      documentId: "logical-flow",
      pages: texts.map((text, index) => ({
        page: index + 1,
        textItems: [{ itemIndex: 0, text }],
      })),
    },
    pages,
  };
}

test("chapter headings join following PDF pages into one reflowable XHTML resource", () => {
  const document = documentFixture([
    "０１　最初の章",
    "前ページから続く本文。",
    "０２　次の章",
    "次章の本文。",
  ]);

  const result = serializeEpubXhtml(document);
  assert.equal(result.pages.length, 2);
  assert.deepEqual(result.pages[0]?.sourcePages, [1, 2]);
  assert.deepEqual(result.pages[1]?.sourcePages, [3, 4]);
  assert.equal(result.pages[0]?.href, "text/page-0001.xhtml");
  assert.equal(result.pages[1]?.href, "text/page-0003.xhtml");

  const first = result.pages[0]?.xhtml ?? "";
  assert.match(first, /<h1 id="heading-page-1" class="fileshape-heading"[^>]*>０１　最初の章<\/h1>/);
  assert.match(first, /id="source-page-1"/);
  assert.match(first, /id="source-page-2"/);
  assert.match(first, /前ページから続く本文。/);
  assert.doesNotMatch(first, /source-page-3/);
});

test("inferred chapter headings become EPUB TOC entries while PDF pages remain page-list targets", () => {
  const document = documentFixture([
    "０１　最初の章",
    "本文。",
    "０２　次の章",
    "本文その二。",
  ]);
  const xhtml = serializeEpubXhtml(document);
  const navigation = serializeEpubNavigation(document, "Book", "ja", xhtml.pages);

  assert.equal(navigation.summary.mode, "outline");
  assert.equal(navigation.summary.outlineEntries, 2);
  assert.match(navigation.xhtml, /page-0001\.xhtml#heading-page-1">０１最初の章<\/a>/);
  assert.match(navigation.xhtml, /page-0003\.xhtml#heading-page-3">０２次の章<\/a>/);
  assert.match(navigation.xhtml, /page-0001\.xhtml#source-page-2">Page 2<\/a>/);
  assert.match(navigation.xhtml, /page-0003\.xhtml#source-page-4">Page 4<\/a>/);
});
