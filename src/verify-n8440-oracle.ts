import { readFile } from "node:fs/promises";
import path from "node:path";
import { nodeBinaryRuntime } from "./binary-runtime-node.js";
import { serializeLegacyNcx } from "./epub-ncx.js";
import { serializeEpubNavigation } from "./epub-navigation.js";
import { serializeEpubXhtml } from "./epub-xhtml.js";
import { buildDocumentFromInspection } from "./pdf-document-pipeline.js";
import { inspectPdfBytes } from "./pdf-inspector-core.js";
import { nodePdfJsResourceConfig } from "./pdf-inspector.js";

const PDF_PATH = "local-samples/N8440FE.pdf";
const TXT_PATH = "local-samples/N8440FE.txt";
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

function evaluateChapter(oldText: string, newText: string, number: number): ChapterResult {
  if (oldText === newText) {
    const expected = Math.max(1, Math.ceil(Math.max(0, oldText.length - ANCHOR_LENGTH + 1) / ANCHOR_STEP));
    return { number, exact: true, matchedAnchors: expected, expectedAnchors: expected, coverage: 1, inversions: 0 };
  }

  const matched: Array<{ oldPosition: number; newPosition: number }> = [];
  let expectedAnchors = 0;
  for (let oldPosition = 0; oldPosition + ANCHOR_LENGTH <= oldText.length; oldPosition += ANCHOR_STEP) {
    const anchor = oldText.slice(oldPosition, oldPosition + ANCHOR_LENGTH);
    if (uniqueIndex(oldText, anchor) === undefined) continue;
    expectedAnchors += 1;
    const newPosition = uniqueIndex(newText, anchor);
    if (newPosition !== undefined) matched.push({ oldPosition, newPosition });
  }

  let inversions = 0;
  let previousNewPosition = -1;
  for (const anchor of matched) {
    if (anchor.newPosition <= previousNewPosition) inversions += 1;
    previousNewPosition = Math.max(previousNewPosition, anchor.newPosition);
  }

  const coverage = expectedAnchors === 0 ? 0 : matched.length / expectedAnchors;
  return {
    number,
    exact: false,
    matchedAnchors: matched.length,
    expectedAnchors,
    coverage,
    inversions,
  };
}

async function main(): Promise<void> {
  console.log(`[oracle] PDF=${path.resolve(PDF_PATH)}`);
  console.log(`[oracle] TXT=${path.resolve(TXT_PATH)}`);
  console.log("[oracle] 正解TXTを解析しています...");
  const [pdfBytesRaw, txt] = await Promise.all([
    readFile(PDF_PATH),
    readFile(TXT_PATH, "utf8"),
  ]);
  const chapters = parseOracleChapters(txt);
  if (chapters.length !== EXPECTED_CHAPTERS) {
    throw new Error(`oracle chapter count mismatch: expected ${EXPECTED_CHAPTERS}, got ${chapters.length}`);
  }
  console.log(`[oracle] 正解章数=${chapters.length}`);

  console.log("[oracle] PDFを解析しています...");
  const inspection = await inspectPdfBytes(
    new Uint8Array(pdfBytesRaw),
    path.basename(PDF_PATH),
    {},
    nodePdfJsResourceConfig,
    nodeBinaryRuntime,
    {
      onDocumentLoaded(pageCount) {
        console.log(`[oracle] PDF pages=${pageCount}`);
      },
      onPageInspected(completed, total) {
        if (completed === 1 || completed === total || completed % 100 === 0) {
          const percent = Math.floor((completed / total) * 100);
          console.log(`[oracle] PDF解析 ${completed}/${total} (${percent}%)`);
        }
      },
    },
  );

  console.log("[oracle] production document pipelineを構築しています...");
  const { document } = buildDocumentFromInspection(inspection, "urn:fileshape:n8440-oracle");
  const pageTexts = document.pages.map((page) =>
    normalizeComparable(page.blocks.map((block) => block.semanticText).join("\n")));
  const documentText = pageTexts.join("");

  const headingPositions = chapters.map((chapter) => {
    const token = headingToken(chapter);
    const position = documentText.indexOf(token);
    if (position < 0) throw new Error(`chapter ${chapter.number} heading not found: ${chapter.title}`);
    return { chapter, token, position };
  });

  const results: ChapterResult[] = [];
  for (let index = 0; index < headingPositions.length; index += 1) {
    const current = headingPositions[index]!;
    const next = headingPositions[index + 1];
    const start = current.position + current.token.length;
    const end = next?.position ?? documentText.length;
    const actual = documentText.slice(start, end);
    results.push(evaluateChapter(current.chapter.body, actual, current.chapter.number));
  }

  const exact = results.filter((result) => result.exact).length;
  const totalMatched = results.reduce((sum, result) => sum + result.matchedAnchors, 0);
  const totalExpected = results.reduce((sum, result) => sum + result.expectedAnchors, 0);
  const failures = results.filter((result) =>
    result.inversions > 0 || result.coverage < MIN_CHAPTER_ANCHOR_COVERAGE);

  console.log("[oracle] EPUB論理構造を検証しています...");
  const xhtml = serializeEpubXhtml(document, { unresolvedRubyPolicy: "preserve-as-page-note" });
  const structuralFailures: string[] = [];
  const inferredHeadings = xhtml.pages.filter((page) => page.heading !== undefined);
  if (inferredHeadings.length < EXPECTED_CHAPTERS) {
    structuralFailures.push(`inferred headings too few: ${inferredHeadings.length} < ${EXPECTED_CHAPTERS}`);
  }

  const firstChapter = xhtml.pages.find((page) => page.heading?.title.startsWith("01"));
  if (!firstChapter) {
    structuralFailures.push("chapter 01 logical XHTML not found");
  } else {
    const beforeText = "一人ぼっちで居る、と";
    const afterText = "いうのも居心地が悪い。";
    const before = firstChapter.xhtml.indexOf(beforeText);
    const after = firstChapter.xhtml.indexOf(afterText);
    if (before < 0 || after <= before) {
      structuralFailures.push("known cross-page sentence not found in chapter 01 XHTML");
    } else if (firstChapter.xhtml.slice(before, after).includes("</p>")) {
      structuralFailures.push("physical PDF page break still splits known paragraph in chapter 01");
    }
  }

  const epub3Nav = serializeEpubNavigation(document, "N8440FE", "ja", xhtml.pages).xhtml;
  const legacyNcx = serializeLegacyNcx(document, "N8440FE", "urn:fileshape:n8440-oracle", xhtml.pages);
  for (const heading of ["01天使様は水も滴るいい女", "02天使様の申し出"]) {
    if (!epub3Nav.includes(heading)) structuralFailures.push(`EPUB3 nav missing heading: ${heading}`);
    if (!legacyNcx.includes(heading)) structuralFailures.push(`NCX missing heading: ${heading}`);
  }

  console.log("");
  console.log("====================================================================");
  if (failures.length === 0 && structuralFailures.length === 0) {
    console.log("N8440FE FULL-ORDER + EPUB-STRUCTURE ORACLE: PASS");
    console.log(`chapters=${results.length}`);
    console.log(`exact_chapters=${exact}`);
    console.log(`anchors=${totalMatched}/${totalExpected}`);
    console.log("order_inversions=0");
    console.log(`inferred_headings=${inferredHeadings.length}`);
    console.log("cross_page_paragraph=PASS");
    console.log("epub3_toc=PASS");
    console.log("legacy_ncx=PASS");
  } else {
    console.log("!!! N8440FE FULL-ORDER + EPUB-STRUCTURE ORACLE: FAIL !!!");
    for (const failure of failures.slice(0, 20)) {
      console.log(
        `chapter=${failure.number} coverage=${(failure.coverage * 100).toFixed(1)}% ` +
        `anchors=${failure.matchedAnchors}/${failure.expectedAnchors} inversions=${failure.inversions}`,
      );
    }
    for (const failure of structuralFailures) console.log(`structure=${failure}`);
    process.exitCode = 1;
  }
  console.log("====================================================================");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
