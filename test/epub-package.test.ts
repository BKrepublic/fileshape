import assert from "node:assert/strict";
import test from "node:test";
import type { FileShapeDocument } from "../src/document-model.js";
import { serializeEpubPackage } from "../src/epub-package.js";

const decoder = new TextDecoder();

function documentFixture(): FileShapeDocument {
  return {
    kind: "document",
    id: "fixture:book",
    imageResources: [],
    source: {
      documentId: "fixture:book",
      pages: [
        {
          page: 1,
          textItems: [
            { itemIndex: 0, text: "A漢" },
            { itemIndex: 1, text: "かん" },
          ],
        },
        {
          page: 2,
          textItems: [{ itemIndex: 0, text: "B" }],
        },
      ],
    },
    pages: [
      {
        kind: "page",
        imageOccurrences: [],
        sourcePage: 1,
        rotation: 0,
        orientation: "horizontal",
        unresolvedRuby: [],
        unmappedExactRuby: [],
        blocks: [{
          kind: "text",
          sourcePage: 1,
          semanticBlockIndex: 0,
          unitIndexes: [0],
          semanticText: "A漢",
          sourceRanges: [{ page: 1, itemIndex: 0, charStart: 0, charEnd: 2 }],
          inlines: [
            {
              kind: "text",
              text: "A",
              sourceRanges: [{ page: 1, itemIndex: 0, charStart: 0, charEnd: 1 }],
            },
            {
              kind: "ruby",
              base: {
                text: "漢",
                sourceRanges: [{ page: 1, itemIndex: 0, charStart: 1, charEnd: 2 }],
                glyphRefs: [],
              },
              annotation: {
                text: "かん",
                sourceRanges: [{ page: 1, itemIndex: 1, charStart: 0, charEnd: 2 }],
                glyphRefs: [],
              },
            },
          ],
        }],
      },
      {
        kind: "page",
        imageOccurrences: [],
        sourcePage: 2,
        rotation: 90,
        orientation: "vertical",
        unresolvedRuby: [],
        unmappedExactRuby: [],
        blocks: [{
          kind: "text",
          sourcePage: 2,
          semanticBlockIndex: 0,
          unitIndexes: [0],
          semanticText: "B",
          sourceRanges: [{ page: 2, itemIndex: 0, charStart: 0, charEnd: 1 }],
          inlines: [{
            kind: "text",
            text: "B",
            sourceRanges: [{ page: 2, itemIndex: 0, charStart: 0, charEnd: 1 }],
          }],
        }],
      },
    ],
  };
}

type ParsedEntry = {
  path: string;
  method: number;
  data: Uint8Array;
};

function localEntries(bytes: Uint8Array): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const path = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    entries.push({ path, method, data: bytes.slice(dataStart, dataStart + compressedSize) });
    offset = dataStart + compressedSize;
  }
  return entries;
}

function fileText(result: ReturnType<typeof serializeEpubPackage>, path: string): string {
  const file = result.files.find((candidate) => candidate.path === path);
  assert.ok(file, `missing ${path}`);
  return decoder.decode(file.data);
}

const fixedOptions = {
  title: "Fixture Book",
  identifier: "urn:fixture:book",
  creator: "FileShape Test",
  language: "ja",
  modified: "2026-09-11T12:34:56Z",
} as const;

test("builds the required EPUB file set in deterministic logical-resource order", () => {
  const result = serializeEpubPackage(documentFixture(), fixedOptions);
  assert.deepEqual(result.files.map((file) => file.path), [
    "mimetype",
    "META-INF/container.xml",
    "OEBPS/package.opf",
    "OEBPS/styles/fileshape.css",
    "OEBPS/nav.xhtml",
    "OEBPS/toc.ncx",
    "OEBPS/text/page-0001.xhtml",
  ]);
});

test("ZIP begins with an uncompressed exact EPUB mimetype entry", () => {
  const result = serializeEpubPackage(documentFixture(), fixedOptions);
  const entries = localEntries(result.bytes);
  assert.equal(entries[0]?.path, "mimetype");
  assert.equal(entries[0]?.method, 0);
  assert.equal(decoder.decode(entries[0]?.data), "application/epub+zip");
  assert.equal(entries.length, result.files.length);
});

test("container points to the package document", () => {
  const result = serializeEpubPackage(documentFixture(), fixedOptions);
  const container = fileText(result, "META-INF/container.xml");
  assert.match(container, /full-path="OEBPS\/package\.opf"/);
  assert.match(container, /application\/oebps-package\+xml/);
});

test("OPF manifest and spine preserve logical resource order and declare legacy NCX", () => {
  const result = serializeEpubPackage(documentFixture(), fixedOptions);
  const opf = fileText(result, "OEBPS/package.opf");
  assert.match(opf, /<dc:identifier id="pub-id">urn:fixture:book<\/dc:identifier>/);
  assert.match(opf, /<dc:title>Fixture Book<\/dc:title>/);
  assert.match(opf, /<dc:language>ja<\/dc:language>/);
  assert.match(opf, /<dc:creator>FileShape Test<\/dc:creator>/);
  assert.match(opf, /<meta property="dcterms:modified">2026-09-11T12:34:56Z<\/meta>/);
  assert.match(opf, /id="nav" href="nav.xhtml"[^>]*properties="nav"/);
  assert.match(opf, /id="ncx" href="toc\.ncx" media-type="application\/x-dtbncx\+xml"/);
  assert.match(opf, /id="fileshape-style" href="styles\/fileshape\.css" media-type="text\/css"/);
  assert.match(opf, /id="page-1" href="text\/page-0001\.xhtml"/);
  assert.doesNotMatch(opf, /id="page-2"/);
  assert.match(opf, /<spine[^>]*toc="ncx"/);
  assert.equal((opf.match(/idref="page-1"/g) ?? []).length, 1);
});

test("packaged stylesheet exists and every packaged XHTML references it", () => {
  const result = serializeEpubPackage(documentFixture(), fixedOptions);
  const css = fileText(result, "OEBPS/styles/fileshape.css");
  const nav = fileText(result, "OEBPS/nav.xhtml");
  const content = fileText(result, "OEBPS/text/page-0001.xhtml");
  assert.match(css, /writing-mode: vertical-rl/);
  assert.match(css, /ruby-position: over/);
  assert.match(nav, /href="styles\/fileshape\.css"/);
  assert.match(content, /href="\.\.\/styles\/fileshape\.css"/);
});

test("page progression direction is explicit-only and never inferred from page orientation", () => {
  const automatic = fileText(serializeEpubPackage(documentFixture(), fixedOptions), "OEBPS/package.opf");
  assert.doesNotMatch(automatic, /page-progression-direction=/);

  const rtl = fileText(serializeEpubPackage(documentFixture(), {
    ...fixedOptions,
    pageProgressionDirection: "rtl",
  }), "OEBPS/package.opf");
  assert.match(rtl, /<spine page-progression-direction="rtl" toc="ncx">/);
});

test("navigation links every source page anchor in source order even when pages share XHTML", () => {
  const result = serializeEpubPackage(documentFixture(), fixedOptions);
  const nav = fileText(result, "OEBPS/nav.xhtml");
  assert.match(nav, /epub:type="toc"/);
  const firstTarget = 'href="text/page-0001.xhtml#source-page-1"';
  const secondTarget = 'href="text/page-0001.xhtml#source-page-2"';
  assert.match(nav, /href="text\/page-0001\.xhtml#source-page-1"/);
  assert.match(nav, /href="text\/page-0001\.xhtml#source-page-2"/);
  assert.ok(nav.indexOf(firstTarget) < nav.indexOf(secondTarget));
});

test("legacy NCX fallback exposes every source page anchor in readable order", () => {
  const result = serializeEpubPackage(documentFixture(), fixedOptions);
  const ncx = fileText(result, "OEBPS/toc.ncx");
  assert.match(ncx, /xmlns="http:\/\/www\.daisy\.org\/z3986\/2005\/ncx\/"/);
  assert.match(ncx, /<docTitle><text>Fixture Book<\/text><\/docTitle>/);
  assert.match(ncx, /<text>Page 1<\/text>/);
  assert.match(ncx, /<content src="text\/page-0001\.xhtml#source-page-1"\/>/);
  assert.match(ncx, /<text>Page 2<\/text>/);
  assert.match(ncx, /<content src="text\/page-0001\.xhtml#source-page-2"\/>/);
});

test("packaged XHTML retains exact ruby and scoped mixed writing modes", () => {
  const result = serializeEpubPackage(documentFixture(), fixedOptions);
  const content = fileText(result, "OEBPS/text/page-0001.xhtml");
  assert.match(content, /A<ruby>漢<rt>かん<\/rt><\/ruby>/);
  assert.match(content, /class="fileshape-page fileshape-mixed-orientation"/);
  assert.match(content, /class="fileshape-orientation-run fileshape-horizontal" style="writing-mode: horizontal-tb;"/);
  assert.match(content, /class="fileshape-orientation-run fileshape-vertical" style="writing-mode: vertical-rl;"/);
  assert.match(content, /id="source-page-1"/);
  assert.match(content, /id="source-page-2"/);
  assert.doesNotMatch(content, /rotate\(/);
});

test("metadata is XML-escaped", () => {
  const result = serializeEpubPackage(documentFixture(), {
    ...fixedOptions,
    title: "A&B <Book>",
    identifier: "urn:a&b",
    creator: "A <B>",
  });
  const opf = fileText(result, "OEBPS/package.opf");
  assert.match(opf, /<dc:title>A&amp;B &lt;Book&gt;<\/dc:title>/);
  assert.match(opf, /<dc:identifier id="pub-id">urn:a&amp;b<\/dc:identifier>/);
  assert.match(opf, /<dc:creator>A &lt;B&gt;<\/dc:creator>/);
});

test("unresolved ruby still fails closed before archive generation", () => {
  const document = documentFixture();
  document.pages[0]!.unresolvedRuby.push({
    status: "unresolved",
    reason: "no-base",
    annotationSourceRanges: [{ page: 1, itemIndex: 1, charStart: 0, charEnd: 2 }],
    baseSourceRanges: [],
    annotationGlyphRefs: [],
    baseGlyphRefs: [],
    alternatives: [],
  });
  assert.throws(
    () => serializeEpubPackage(document, fixedOptions),
    /requires unresolved ruby policy before rendering page 1/,
  );
});
