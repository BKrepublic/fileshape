import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReadingSystemFixtureEpub,
  readingSystemFixtureDocument,
} from "../src/reading-system-fixture.js";
import { serializeEpubPackage } from "../src/epub-package.js";

const decoder = new TextDecoder();

function fileText(result: ReturnType<typeof serializeEpubPackage>, path: string): string {
  const file = result.files.find((candidate) => candidate.path === path);
  assert.ok(file, `missing ${path}`);
  return decoder.decode(file.data);
}

test("reading-system fixture covers mixed writing, ruby, notes, hierarchy and a blank page", () => {
  const document = readingSystemFixtureDocument();
  assert.equal(document.pages.length, 4);
  assert.equal(document.pages[0]!.orientation, "horizontal");
  assert.equal(document.pages[1]!.orientation, "vertical");
  assert.equal(document.pages[3]!.blocks.length, 0);
  assert.equal(document.navigation?.[0]?.children.length, 2);

  const result = serializeEpubPackage(document, {
    title: "FileShape Reading System Fixture",
    identifier: document.id,
    language: "ja",
    modified: "2026-09-11T00:00:00Z",
    unresolvedRubyPolicy: "preserve-as-page-note",
    pageProgressionDirection: "rtl",
  });

  const page1 = fileText(result, "OEBPS/text/page-0001.xhtml");
  const page2 = fileText(result, "OEBPS/text/page-0002.xhtml");
  const page3 = fileText(result, "OEBPS/text/page-0003.xhtml");
  const page4 = fileText(result, "OEBPS/text/page-0004.xhtml");
  const nav = fileText(result, "OEBPS/nav.xhtml");
  const opf = fileText(result, "OEBPS/package.opf");

  assert.match(page1, /<ruby>漢<rt>かん<\/rt><\/ruby>/);
  assert.match(page1, /<ruby>長<rt>ながいよみ<\/rt><\/ruby>/);
  assert.match(page1, /𠮷é/);
  assert.match(page1, /fileshape-unresolved-notes/);
  assert.match(page1, /未解決注記&lt;&amp;&gt;/);
  assert.match(page2, /fileshape-vertical/);
  assert.match(page3, /混在文書\n\n空白行/);
  assert.doesNotMatch(page4, /fileshape-block/);
  assert.match(nav, /Fixture/);
  assert.match(nav, /Vertical/);
  assert.match(nav, /Mixed/);
  assert.match(opf, /page-progression-direction="rtl"/);
  assert.match(opf, /styles\/fileshape\.css/);
});

test("reading-system fixture archive is deterministic", () => {
  assert.deepEqual(buildReadingSystemFixtureEpub(), buildReadingSystemFixtureEpub());
});
