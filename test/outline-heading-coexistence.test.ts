import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentPage, FileShapeDocument } from "../src/document-model.js";
import { buildDocumentNavigation, type SourceOutlineItem } from "../src/document-navigation.js";
import { serializeEpubNavigation } from "../src/epub-navigation.js";
import { serializeEpubXhtml } from "../src/epub-xhtml.js";

function fixture(): FileShapeDocument {
  const texts = ["section source", "body one", "rendered heading", "body two", "body three"];
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
  const outline: SourceOutlineItem[] = [{
    title: "Authoritative outline label",
    destination: null,
    target: { status: "resolved", sourcePage: 1 },
    items: [{
      title: "Second outline section",
      destination: null,
      target: { status: "resolved", sourcePage: 4 },
      items: [],
    }],
  }];
  return {
    kind: "document",
    id: "outline-heading-coexistence",
    imageResources: [],
    source: {
      documentId: "outline-heading-coexistence",
      outline,
      pages: texts.map((text, index) => ({
        page: index + 1,
        textItems: [{ itemIndex: 0, text }],
      })),
    },
    pages,
    navigation: buildDocumentNavigation(outline),
  };
}

test("source outline owns navigation while inferred heading still owns rendered structure", () => {
  const document = fixture();
  const xhtml = serializeEpubXhtml(document, {
    structuralHeadings: [{
      title: "rendered heading",
      sourcePage: 3,
      semanticBlockIndex: 0,
    }],
  });

  assert.deepEqual(xhtml.pages.map((page) => page.sourcePages), [[1, 2], [3, 4, 5]]);
  assert.match(xhtml.pages[1]!.xhtml, /<h1 id="heading-page-3-block-0"/);

  const navigation = serializeEpubNavigation(document, "Book", "ja", xhtml.pages);
  assert.equal(navigation.summary.mode, "outline");
  assert.equal(navigation.summary.outlineEntries, 2);
  assert.match(navigation.xhtml, /page-0001\.xhtml#source-page-1">Authoritative outline label<\/a>/);
  assert.match(navigation.xhtml, /page-0003\.xhtml#source-page-4">Second outline section<\/a>/);
  assert.doesNotMatch(navigation.xhtml, />rendered heading<\/a>/);
});
