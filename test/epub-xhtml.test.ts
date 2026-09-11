import assert from "node:assert/strict";
import test from "node:test";
import type { FileShapeDocument } from "../src/document-model.js";
import { serializeEpubXhtml } from "../src/epub-xhtml.js";

function documentFixture(): FileShapeDocument {
  return {
    kind: "document",
    id: "doc-1",
    source: {
      documentId: "doc-1",
      pages: [{
        page: 1,
        textItems: [
          { itemIndex: 0, text: "A&" },
          { itemIndex: 1, text: "漢" },
          { itemIndex: 2, text: "かん" },
          { itemIndex: 3, text: " <B> " },
        ],
      }],
    },
    pages: [{
      kind: "page",
      sourcePage: 1,
      rotation: 0,
      orientation: "horizontal",
      blocks: [{
        kind: "text",
        sourcePage: 1,
        semanticBlockIndex: 0,
        unitIndexes: [0, 1],
        semanticText: "A&漢 <B> ",
        sourceRanges: [
          { page: 1, itemIndex: 0, charStart: 0, charEnd: 2 },
          { page: 1, itemIndex: 1, charStart: 0, charEnd: 1 },
          { page: 1, itemIndex: 3, charStart: 0, charEnd: 5 },
        ],
        inlines: [
          {
            kind: "text",
            text: "A&",
            sourceRanges: [{ page: 1, itemIndex: 0, charStart: 0, charEnd: 2 }],
          },
          {
            kind: "ruby",
            base: {
              text: "漢",
              sourceRanges: [{ page: 1, itemIndex: 1, charStart: 0, charEnd: 1 }],
              glyphRefs: [],
            },
            annotation: {
              text: "かん",
              sourceRanges: [{ page: 1, itemIndex: 2, charStart: 0, charEnd: 2 }],
              glyphRefs: [],
            },
          },
          {
            kind: "text",
            text: " <B> ",
            sourceRanges: [{ page: 1, itemIndex: 3, charStart: 0, charEnd: 5 }],
          },
        ],
      }],
      unresolvedRuby: [],
      unmappedExactRuby: [],
    }],
  };
}

test("serializes exact ruby as EPUB3 XHTML and XML-escapes source text", () => {
  const result = serializeEpubXhtml(documentFixture());
  assert.equal(result.documentId, "doc-1");
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0]?.href, "text/page-0001.xhtml");
  assert.equal(result.pages[0]?.mediaType, "application/xhtml+xml");

  const xhtml = result.pages[0]?.xhtml ?? "";
  assert.match(xhtml, /xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.match(xhtml, /xml:lang="ja" lang="ja"/);
  assert.match(xhtml, /A&amp;<ruby>漢<rt>かん<\/rt><\/ruby> &lt;B&gt; /);
  assert.match(xhtml, /xml:space="preserve"/);
  assert.doesNotMatch(xhtml, /A&<ruby>/);
});

test("transports resolved writing orientation without using PDF rotation as presentation", () => {
  const document = documentFixture();
  document.pages[0]!.rotation = 90;
  document.pages[0]!.orientation = "vertical";
  const vertical = serializeEpubXhtml(document).pages[0]!.xhtml;
  assert.match(vertical, /writing-mode: vertical-rl/);
  assert.doesNotMatch(vertical, /rotate\(/);

  document.pages[0]!.orientation = "horizontal";
  const horizontal = serializeEpubXhtml(document).pages[0]!.xhtml;
  assert.match(horizontal, /writing-mode: horizontal-tb/);
});

test("unknown orientation remains explicit instead of being guessed", () => {
  const document = documentFixture();
  document.pages[0]!.orientation = "unknown";
  const xhtml = serializeEpubXhtml(document).pages[0]!.xhtml;
  assert.match(xhtml, /fileshape-orientation-unknown/);
  assert.doesNotMatch(xhtml, /writing-mode:/);
});

test("language, title and stylesheet metadata are escaped", () => {
  const xhtml = serializeEpubXhtml(documentFixture(), {
    language: "ja-JP",
    titlePrefix: "A&B <Book>",
    stylesheetHref: '../style/a&b".css',
  }).pages[0]!.xhtml;

  assert.match(xhtml, /xml:lang="ja-JP" lang="ja-JP"/);
  assert.match(xhtml, /<title>A&amp;B &lt;Book&gt; 1<\/title>/);
  assert.match(xhtml, /href="\.\.\/style\/a&amp;b&quot;\.css"/);
});

test("unresolved ruby fails closed instead of silently dropping uncertain annotation text", () => {
  const document = documentFixture();
  document.pages[0]!.unresolvedRuby.push({
    status: "unresolved",
    reason: "no-base",
    annotationSourceRanges: [{ page: 1, itemIndex: 2, charStart: 0, charEnd: 2 }],
    baseSourceRanges: [],
    annotationGlyphRefs: [],
    baseGlyphRefs: [],
    alternatives: [],
  });

  assert.throws(
    () => serializeEpubXhtml(document),
    /requires unresolved ruby policy before rendering page 1/,
  );
});

test("invalid document provenance is rejected before serialization", () => {
  const document = documentFixture();
  const first = document.pages[0]!.blocks[0]!.inlines[0]!;
  assert.equal(first.kind, "text");
  if (first.kind === "text") first.text = "tampered";
  assert.throws(() => serializeEpubXhtml(document), /invalid FileShapeDocument/);
});

test("empty metadata options are rejected", () => {
  assert.throws(() => serializeEpubXhtml(documentFixture(), { language: " " }), /language must not be empty/);
  assert.throws(() => serializeEpubXhtml(documentFixture(), { titlePrefix: "" }), /titlePrefix must not be empty/);
  assert.throws(() => serializeEpubXhtml(documentFixture(), { stylesheetHref: "" }), /stylesheetHref must not be empty/);
});
