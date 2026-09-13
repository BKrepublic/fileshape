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

  console.log("[oracle] 汎用レイアウト見出し推定を検証しています...");
  const structuralHeadings = inferStructuralHeadings(document, inspection);
  console.log(`[oracle] structural headings=${structuralHeadings.length}`);
  const structuralFailures: string[] = [];

  const expectedTokens = chapters.map(headingToken);
  const inferredTokens = structuralHeadings.map((heading) => normalizeComparable(heading.title));
  const expectedPositions = expectedTokens.map((token) => inferredTokens.indexOf(token));
  if (expectedPositions.some((position) => position < 0)) {
    const missing = expectedTokens.filter((_, index) => expectedPositions[index]! < 0).slice(0, 10);
    structuralFailures.push(`generic inference missing oracle headings: ${missing.join(", ")}`);
  }
  for (let index = 1; index < expectedPositions.length; index += 1) {
    if (expectedPositions[index]! <= expectedPositions[index - 1]!) {
      structuralFailures.push(`generic heading order mismatch at oracle chapter ${index + 1}`);
      break;
    }
  }

  const lastExpectedIndex = expectedPositions.at(-1) ?? -1;
  if (lastExpectedIndex >= 0) {
    const selectedThroughOldSnapshot = inferredTokens.slice(0, lastExpectedIndex + 1);
    if (selectedThroughOldSnapshot.length !== EXPECTED_CHAPTERS ||
        selectedThroughOldSnapshot.some((token, index) => token !== expectedTokens[index])) {
      structuralFailures.push(
        `generic inference produced false/misordered headings inside old 266-chapter snapshot: ` +
        `${selectedThroughOldSnapshot.length} selected`,
      );
    }
  }

  const xhtml = serializeEpubXhtml(document, {
    unresolvedRubyPolicy: "preserve-as-page-note",
    structuralHeadings,
  });
  const inferredPages = xhtml.pages.filter((page) => page.heading !== undefined);
  const firstToken = expectedTokens[0]!;
  const secondToken = expectedTokens[1]!;
  const firstChapter = inferredPages.find((page) =>
    page.heading !== undefined && normalizeComparable(page.heading.title) === firstToken);
  if (!firstChapter) {
    structuralFailures.push("chapter 01 logical XHTML not found");
  } else {
    const beforeText = normalizeComparable("一人ぼっちで居る、と");
    const afterText = normalizeComparable("いうのも居心地が悪い。");
    const beforePage = document.pages.find((page) =>
      normalizeComparable(page.blocks.map((block) => block.semanticText).join("")).includes(beforeText));
    const afterPage = document.pages.find((page) =>
      normalizeComparable(page.blocks.map((block) => block.semanticText).join("")).includes(afterText));

    if (!beforePage || !afterPage) {
      structuralFailures.push("known cross-page sentence fragments not found in semantic document");
    } else {
      console.log(`[oracle] known cross-page boundary=${beforePage.sourcePage}->${afterPage.sourcePage}`);
      if (afterPage.sourcePage !== beforePage.sourcePage + 1) {
        structuralFailures.push(
          `known sentence fragments are not on adjacent source pages: ` +
          `${beforePage.sourcePage}->${afterPage.sourcePage}`,
        );
      } else if (!firstChapter.sourcePages.includes(beforePage.sourcePage) ||
                 !firstChapter.sourcePages.includes(afterPage.sourcePage)) {
        structuralFailures.push(
          `known sentence pages are outside chapter 01 logical XHTML: ` +
          `${beforePage.sourcePage}->${afterPage.sourcePage}`,
        );
      } else {
        const marker = `id="source-page-${afterPage.sourcePage}"`;
        const markerIndex = firstChapter.xhtml.indexOf(marker);
        if (markerIndex < 0) {
          structuralFailures.push(`source-page marker missing for page ${afterPage.sourcePage}`);
        } else {
          const prefix = firstChapter.xhtml.slice(0, markerIndex);
          const lastParagraphOpen = prefix.lastIndexOf("<p ");
          const lastParagraphClose = prefix.lastIndexOf("</p>");
          if (lastParagraphOpen < 0 || lastParagraphOpen <= lastParagraphClose) {
            structuralFailures.push(
              `physical PDF page break still closes the paragraph before source page ${afterPage.sourcePage}`,
            );
          }

          const nextParagraphClose = firstChapter.xhtml.indexOf("</p>", markerIndex);
          const continuation = firstChapter.xhtml.indexOf(
            'class="fileshape-block-continuation"',
            markerIndex,
          );
          if (continuation < 0 ||
              (nextParagraphClose >= 0 && continuation > nextParagraphClose)) {
            structuralFailures.push(
              `source page ${afterPage.sourcePage} does not resume the open paragraph as a continuation`,
            );
          }
        }
      }
    }
  }

  const epub3Nav = serializeEpubNavigation(document, "N8440FE", "ja", xhtml.pages).xhtml;
  const legacyNcx = serializeLegacyNcx(document, "N8440FE", "urn:fileshape:n8440-oracle", xhtml.pages);
  const normalizedEpub3Nav = normalizeComparable(epub3Nav);
  const normalizedLegacyNcx = normalizeComparable(legacyNcx);
  for (const token of [firstToken, secondToken]) {
    if (!normalizedEpub3Nav.includes(token)) structuralFailures.push(`EPUB3 nav missing heading: ${token}`);
    if (!normalizedLegacyNcx.includes(token)) structuralFailures.push(`NCX missing heading: ${token}`);
  }

  console.log("");
  console.log("====================================================================");
  if (failures.length === 0 && structuralFailures.length === 0) {
    console.log("N8440FE FULL-ORDER + GENERIC EPUB-STRUCTURE ORACLE: PASS");
    console.log(`chapters=${results.length}`);
    console.log(`exact_chapters=${exact}`);
    console.log(`anchors=${totalMatched}/${totalExpected}`);
    console.log("order_inversions=0");
    console.log(`structural_headings=${structuralHeadings.length}`);
    console.log("generic_heading_inference=PASS");
    console.log("cross_page_paragraph=PASS");
    console.log("epub3_toc=PASS");
    console.log("legacy_ncx=PASS");
  } else {
    console.log("!!! N8440FE FULL-ORDER + GENERIC EPUB-STRUCTURE ORACLE: FAIL !!!");
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
