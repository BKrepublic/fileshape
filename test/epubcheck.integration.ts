import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildDocumentNavigation, type SourceOutlineItem } from "../src/document-navigation.js";
import { serializeEpubPackage } from "../src/epub-package.js";
import { createEpubChecker, epubCheckSummary } from "../src/epubcheck.js";
import { buildDocumentFromInspection } from "../src/pdf-document-pipeline.js";
import { inspectPdf } from "../src/pdf-inspector.js";
import { convertPdfToEpub } from "../src/pdf-to-epub.js";
import { epubcheckDocumentFixture } from "./epubcheck-fixture.js";
import { imagePdfBytes } from "./pdf-image-fixture.js";
import { pdfBytes } from "./pdf-fixture.js";

// This explicit integration command must fail, never skip, when Java/JAR is missing.
const checker = await createEpubChecker();
const options = {
  title: "FileShape & EPUBCheck <fixture>",
  modified: "2026-09-11T00:00:00Z",
  unresolvedRubyPolicy: "preserve-as-page-note",
} as const;

test("real EPUBCheck accepts both writing modes, ruby, notes, Unicode and a blank page", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "fileshape-epubcheck-fixture-"));
  try {
    const input = path.join(temporary, "日本語 with spaces & symbols.epub");
    const report = path.join(temporary, "report.json");
    const epub = serializeEpubPackage(epubcheckDocumentFixture(), options);
    await writeFile(input, epub.bytes);
    const result = await checker.check(input, report);
    assert.equal(result.valid, true, epubCheckSummary(result) + JSON.stringify(result.messages));
    assert.equal(JSON.parse(await readFile(report, "utf8")).checker.checkerVersion, checker.version);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("real EPUBCheck rejects a deliberately nonconforming language tag", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "fileshape-epubcheck-negative-"));
  try {
    const input = path.join(temporary, "invalid.epub");
    const epub = serializeEpubPackage(epubcheckDocumentFixture(), { ...options, language: "not_a_language" });
    await writeFile(input, epub.bytes);
    const result = await checker.check(input);
    assert.equal(result.valid, false);
    assert.notEqual(result.exitCode, 0);
    assert.ok(result.errors > 0);
    assert.ok(result.messages.length > 0);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("production PDF outline-to-EPUB navigation passes real EPUBCheck", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "fileshape-epubcheck-production-"));
  try {
    const input = path.join(temporary, "fixture.pdf");
    const output = path.join(temporary, "fixture.epub");
    await writeFile(input, pdfBytes({ outline: true }));
    const conversion = await convertPdfToEpub(input, output, options);
    assert.equal(conversion.pageCount, 1);
    assert.deepEqual(conversion.navigation, { mode: "outline", outlineEntries: 4, unresolvedOutlineEntries: 2 });
    const result = await checker.check(output);
    assert.equal(result.valid, true, epubCheckSummary(result) + JSON.stringify(result.messages));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("all-unresolved outline falls back to conforming page navigation without dropping labels", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "fileshape-epubcheck-unlinked-"));
  try {
    const document = epubcheckDocumentFixture();
    const outline: SourceOutlineItem[] = [{ title: "Unavailable", destination: null,
      target: { status: "unresolved", reason: "no-destination" }, items: [] }];
    document.source.outline = outline;
    document.navigation = buildDocumentNavigation(outline);
    const epub = serializeEpubPackage(document, options);
    const input = path.join(temporary, "fixture.epub");
    await writeFile(input, epub.bytes);
    assert.equal(epub.navigation.mode, "pages");
    const result = await checker.check(input);
    assert.equal(result.valid, true, epubCheckSummary(result) + JSON.stringify(result.messages));
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("explicit image occurrence cover designation passes real EPUBCheck", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "fileshape-epubcheck-cover-"));
  try {
    const input = path.join(temporary, "image.pdf");
    const output = path.join(temporary, "image-cover.epub");
    await writeFile(input, imagePdfBytes({ includeInline: false, rotation: 0 }));

    const inspection = await inspectPdf(input, { includeGlyphs: true, includeImages: true });
    const { document } = buildDocumentFromInspection(inspection, "urn:fileshape:cover-integration");
    const first = document.pages.flatMap((page) => page.imageOccurrences)[0];
    assert.ok(first, "fixture must expose at least one production image occurrence");

    const conversion = await convertPdfToEpub(input, output, {
      ...options,
      coverOccurrence: {
        sourcePage: first.sourcePage,
        operatorIndex: first.operatorIndex,
        occurrenceIndex: first.occurrenceIndex,
      },
    });
    assert.equal(conversion.coverImageResourceId, first.resourceId);

    const result = await checker.check(output);
    assert.equal(result.valid, true, epubCheckSummary(result) + JSON.stringify(result.messages));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
