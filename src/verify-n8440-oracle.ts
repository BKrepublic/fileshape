import { readFile } from "node:fs/promises";
import path from "node:path";
import { nodeBinaryRuntime } from "./binary-runtime-node.js";
import { serializeLegacyNcx } from "./epub-ncx.js";
import { serializeEpubNavigation } from "./epub-navigation.js";
import { serializeEpubXhtml } from "./epub-xhtml.js";
import { inferStructuralHeadings } from "./heading-inference.js";
import { buildDocumentFromInspection } from "./pdf-document-pipeline.js";
import { inspectPdfBytes } from "./pdf-inspector-core.js";
import { nodePdfJsResourceConfig } from "./pdf-inspector.js";

const PDF_PATH = "local-oracles/N8440FE.pdf";
const TXT_PATH = "local-oracles/N8440FE.txt";
const EXPECTED_CHAPTERS = 266;
const ANCHOR_LENGTH = 24;
const ANCHOR_STEP = 64;
const MIN_CHAPTER_ANCHOR_COVERAGE = 0.85;

type OracleChapter = {
  number: number;
  title: string;
  body: string;
};

type ChapterResult = {
  number: number;
  exact: boolean;
  matchedAnchors: number;
  expectedAnchors: number;
  coverage: number;
  inversions: number;
};

function normalizeComparable(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, "");
}

function stripAozora(value: string): string {
  return normalizeComparable(
    value
      .replace(/［＃ここから前書き］[\s\S]*?［＃ここで前書き終わり］/gu, "")
      .replace(/［＃ここから後書き］[\s\S]*?［＃ここで後書き終わり］/gu, "")
      .replace(/｜([^《\r\n]+)《[^》]*》/gu, "$1")
      .replace(/([一-龯々〆ヵヶ]+)《[^》]*》/gu, "$1")
      .replace(/［＃[^］]*］/gu, "")
      .replace(/<[^>]+>/gu, ""),
  );
}

function parseOracleChapters(source: string): OracleChapter[] {
  const pattern = /［＃３字下げ］［＃中見出し］(?:［＃縦中横］)?(\d+)(?:［＃縦中横終わり］)?　(.+?)［＃中見出し終わり］/gu;
  const matches = [...source.matchAll(pattern)];
  const chapters: OracleChapter[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]!;
    const numberText = match[1];
    const title = match[2];
    if (numberText === undefined || title === undefined || match.index === undefined) continue;
    const bodyStart = match.index + match[0].length;
    const bodyEnd = matches[index + 1]?.index ?? source.length;
    chapters.push({
      number: Number.parseInt(numberText, 10),
      title: normalizeComparable(title),
      body: stripAozora(source.slice(bodyStart, bodyEnd)),
    });
  }
  return chapters;
}

function headingToken(chapter: OracleChapter): string {
  const number = chapter.number < 100
    ? String(chapter.number).padStart(2, "0")
    : String(chapter.number);
  return normalizeComparable(`${number}${chapter.title}`);
}

function uniqueIndex(haystack: string, needle: string): number | undefined {
  const first = haystack.indexOf(needle);
  if (first < 0) return undefined;
  return haystack.indexOf(needle, first + 1) < 0 ? first : undefined;
}

function chapterAnchors(body: string): string[] {
  if (body.length <= ANCHOR_LENGTH) return body.length === 0 ? [] : [body];
  const anchors: string[] = [];
  for (let start = 0; start + ANCHOR_LENGTH <= body.length; start += ANCHOR_STEP) {
    anchors.push(body.slice(start, start + ANCHOR_LENGTH));
  }
  const tail = body.slice(-ANCHOR_LENGTH);
  if (anchors.at(-1) !== tail) anchors.push(tail);
  return anchors;
}

function chapterResult(chapter: OracleChapter, pdfText: string): ChapterResult {
  const anchors = chapterAnchors(chapter.body);
  const positions: number[] = [];
  let matchedAnchors = 0;
  for (const anchor of anchors) {
    const index = uniqueIndex(pdfText, anchor);
    if (index === undefined) continue;
    matchedAnchors += 1;
    positions.push(index);
  }
  let inversions = 0;
  for (let index = 1; index < positions.length; index += 1) {
    if (positions[index]! <= positions[index - 1]!) inversions += 1;
  }
  const coverage = anchors.length === 0 ? 1 : matchedAnchors / anchors.length;
  return {
    number: chapter.number,
    exact: chapter.body.length > 0 && pdfText.includes(chapter.body),
    matchedAnchors,
    expectedAnchors: anchors.length,
    coverage,
    inversions,
  };
}

function fail(message: string): never {
  throw new Error(message);
}

const sourcePdf = await readFile(PDF_PATH);
const sourceTxt = await readFile(TXT_PATH, "utf8");
const chapters = parseOracleChapters(sourceTxt);
if (chapters.length !== EXPECTED_CHAPTERS) {
  fail(`oracle TXT chapter count changed: expected ${EXPECTED_CHAPTERS}, got ${chapters.length}`);
}

const inspection = await inspectPdfBytes(
  new Uint8Array(sourcePdf),
  nodeBinaryRuntime(),
  nodePdfJsResourceConfig(),
  (completed, total) => {
    if (completed === total || completed % 100 === 0) {
      console.log(`[oracle] inspected ${completed}/${total} pages`);
    }
  },
);
const document = buildDocumentFromInspection(inspection);
const pageTexts = document.pages.map((page) => normalizeComparable(
  page.blocks.map((block) => block.semanticText).join(""),
));
const pdfText = pageTexts.join("");

const headingPositions: number[] = [];
for (const chapter of chapters) {
  const token = headingToken(chapter);
  const position = uniqueIndex(pdfText, token);
  if (position === undefined) fail(`chapter heading is missing or ambiguous: ${chapter.number}`);
  headingPositions.push(position);
}
for (let index = 1; index < headingPositions.length; index += 1) {
  if (headingPositions[index]! <= headingPositions[index - 1]!) {
    fail(`chapter headings are out of order at ${index + 1}`);
  }
}

const results = chapters.map((chapter) => chapterResult(chapter, pdfText));
const totalMatched = results.reduce((sum, result) => sum + result.matchedAnchors, 0);
const totalExpected = results.reduce((sum, result) => sum + result.expectedAnchors, 0);
const minCoverage = Math.min(...results.map((result) => result.coverage));
const totalInversions = results.reduce((sum, result) => sum + result.inversions, 0);
if (results[0]?.exact !== true) fail("chapter 1 is no longer exact after normalization");
if (minCoverage < MIN_CHAPTER_ANCHOR_COVERAGE) {
  fail(`chapter anchor coverage dropped below ${MIN_CHAPTER_ANCHOR_COVERAGE}: ${minCoverage}`);
}
if (totalInversions !== 0) fail(`anchor order inversions detected: ${totalInversions}`);

const structuralHeadings = inferStructuralHeadings(document, inspection);
console.log(`[oracle] structural headings=${structuralHeadings.length}`);
const structuralTokens = structuralHeadings.map((heading) => normalizeComparable(heading.title));
let structuralCursor = -1;
for (const chapter of chapters) {
  const expected = headingToken(chapter);
  const index = structuralTokens.indexOf(expected, structuralCursor + 1);
  if (index < 0) fail(`generic inference missed or reordered chapter ${chapter.number}`);
  structuralCursor = index;
}
const oldSnapshotHeadingSet = new Set(chapters.map(headingToken));
const selectedThroughOldSnapshot = structuralTokens.slice(0, structuralCursor + 1);
const unexpectedOldSnapshotHeadings = selectedThroughOldSnapshot.filter((token) => !oldSnapshotHeadingSet.has(token));
if (unexpectedOldSnapshotHeadings.length > 0) {
  fail(`generic inference produced false/misordered headings inside old ${EXPECTED_CHAPTERS}-chapter snapshot: ${selectedThroughOldSnapshot.length} selected`);
}

const xhtml = serializeEpubXhtml(document, { structuralHeadings });
const firstChapter = xhtml.pages.find((page) => page.heading !== undefined);
if (!firstChapter) fail("generic inference produced no logical chapter XHTML");
const beforeText = normalizeComparable("一人ぼっちで居る、と");
const afterText = normalizeComparable("いうのも居心地が悪い。");
const beforePage = document.pages.find((page) => normalizeComparable(page.blocks.map((block) => block.semanticText).join("")).includes(beforeText));
const afterPage = document.pages.find((page) => normalizeComparable(page.blocks.map((block) => block.semanticText).join("")).includes(afterText));
if (!beforePage || !afterPage) fail("known cross-page sentence fragments not found in semantic document");
console.log(`[oracle] known cross-page boundary=${beforePage.sourcePage}->${afterPage.sourcePage}`);
if (afterPage.sourcePage !== beforePage.sourcePage + 1) {
  fail(`known sentence fragments are not on adjacent source pages: ${beforePage.sourcePage}->${afterPage.sourcePage}`);
}
if (!firstChapter.sourcePages.includes(beforePage.sourcePage) || !firstChapter.sourcePages.includes(afterPage.sourcePage)) {
  fail("known sentence pages are outside chapter 01 logical XHTML");
}
const nextPageMarker = `id="source-page-${afterPage.sourcePage}"`;
const markerIndex = firstChapter.xhtml.indexOf(nextPageMarker);
if (markerIndex < 0) fail(`source-page marker missing for page ${afterPage.sourcePage}`);
const beforeMarker = firstChapter.xhtml.slice(0, markerIndex);
const lastParagraphOpen = beforeMarker.lastIndexOf("<p ");
const lastParagraphClose = beforeMarker.lastIndexOf("</p>");
if (lastParagraphOpen <= lastParagraphClose) {
  fail(`physical PDF page break still closes the paragraph before source page ${afterPage.sourcePage}`);
}
const afterMarker = firstChapter.xhtml.slice(markerIndex);
const continuationIndex = afterMarker.indexOf('class="fileshape-block-continuation"');
const nextParagraphClose = afterMarker.indexOf("</p>");
if (continuationIndex < 0 || nextParagraphClose < 0 || continuationIndex > nextParagraphClose) {
  fail(`source page ${afterPage.sourcePage} does not resume the open paragraph as a continuation`);
}

const navigation = serializeEpubNavigation(document, xhtml.pages);
const ncx = serializeLegacyNcx(document, "N8440FE", document.id, xhtml.pages);
for (const chapter of chapters) {
  const token = chapter.title;
  if (!normalizeComparable(navigation.xhtml).includes(token)) {
    fail(`EPUB3 nav is missing chapter ${chapter.number}`);
  }
  if (!normalizeComparable(ncx).includes(token)) {
    fail(`legacy NCX is missing chapter ${chapter.number}`);
  }
}

console.log(`[oracle] chapter headings=${chapters.length}`);
console.log(`[oracle] anchors=${totalMatched}/${totalExpected}`);
console.log(`[oracle] minimum chapter coverage=${(minCoverage * 100).toFixed(1)}%`);
console.log(`[oracle] inversions=${totalInversions}`);
console.log("[oracle] generic_heading_inference=PASS");
console.log("[oracle] cross_page_paragraph=PASS");
console.log("[oracle] epub3_toc=PASS");
console.log("[oracle] legacy_ncx=PASS");
