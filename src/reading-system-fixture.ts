import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDocumentNavigation, type SourceOutlineItem } from "./document-navigation.js";
import type { FileShapeDocument } from "./document-model.js";
import { serializeEpubPackage } from "./epub-package.js";
import type { SourceTextRef } from "./source-text.js";

const DOCUMENT_ID = "fixture:reading-system";

function ref(page: number, itemIndex: number, text: string): SourceTextRef {
  return { page, itemIndex, charStart: 0, charEnd: text.length };
}

function sourceOutline(): SourceOutlineItem[] {
  return [{
    title: "Fixture",
    destination: [0, "Fit"],
    target: { status: "resolved", sourcePage: 1 },
    items: [
      {
        title: "Vertical",
        destination: [1, "Fit"],
        target: { status: "resolved", sourcePage: 2 },
        items: [],
      },
      {
        title: "Mixed",
        destination: [2, "Fit"],
        target: { status: "resolved", sourcePage: 3 },
        items: [],
      },
    ],
  }];
}

export function readingSystemFixtureDocument(): FileShapeDocument {
  const horizontal = "横書き Latin 123。";
  const rubyBase = "漢";
  const rubyAnnotation = "かん";
  const longRubyBase = "長";
  const longRubyAnnotation = "ながいよみ";
  const supplementary = "𠮷";
  const combining = "e\u0301";
  const note = "未解決注記<&>";
  const vertical = "縦書き ABC 123、。";
  const mixed = "混在文書\n\n空白行";
  const outline = sourceOutline();

  return {
    kind: "document",
    id: DOCUMENT_ID,
    source: {
      documentId: DOCUMENT_ID,
      outline,
      pages: [
        {
          page: 1,
          textItems: [
            { itemIndex: 0, text: horizontal },
            { itemIndex: 1, text: rubyBase },
            { itemIndex: 2, text: rubyAnnotation },
            { itemIndex: 3, text: longRubyBase },
            { itemIndex: 4, text: longRubyAnnotation },
            { itemIndex: 5, text: supplementary },
            { itemIndex: 6, text: combining },
            { itemIndex: 7, text: note },
          ],
        },
        { page: 2, textItems: [{ itemIndex: 0, text: vertical }] },
        { page: 3, textItems: [{ itemIndex: 0, text: mixed }] },
        { page: 4, textItems: [] },
      ],
    },
    navigation: buildDocumentNavigation(outline),
    pages: [
      {
        kind: "page",
        sourcePage: 1,
        rotation: 0,
        orientation: "horizontal",
        blocks: [{
          kind: "text",
          sourcePage: 1,
          semanticBlockIndex: 0,
          unitIndexes: [0],
          semanticText: `${horizontal}${rubyBase}${longRubyBase}${supplementary}${combining}`,
          sourceRanges: [
            ref(1, 0, horizontal),
            ref(1, 1, rubyBase),
            ref(1, 3, longRubyBase),
            ref(1, 5, supplementary),
            ref(1, 6, combining),
          ],
          inlines: [
            { kind: "text", text: horizontal, sourceRanges: [ref(1, 0, horizontal)] },
            {
              kind: "ruby",
              base: { text: rubyBase, sourceRanges: [ref(1, 1, rubyBase)], glyphRefs: [] },
              annotation: { text: rubyAnnotation, sourceRanges: [ref(1, 2, rubyAnnotation)], glyphRefs: [] },
            },
            {
              kind: "ruby",
              base: { text: longRubyBase, sourceRanges: [ref(1, 3, longRubyBase)], glyphRefs: [] },
              annotation: { text: longRubyAnnotation, sourceRanges: [ref(1, 4, longRubyAnnotation)], glyphRefs: [] },
            },
            { kind: "text", text: supplementary, sourceRanges: [ref(1, 5, supplementary)] },
            { kind: "text", text: combining, sourceRanges: [ref(1, 6, combining)] },
          ],
        }],
        unresolvedRuby: [{
          status: "unresolved",
          reason: "no-base",
          annotationSourceRanges: [ref(1, 7, note)],
          baseSourceRanges: [],
          annotationGlyphRefs: [],
          baseGlyphRefs: [],
          alternatives: [],
        }],
        unmappedExactRuby: [],
      },
      {
        kind: "page",
        sourcePage: 2,
        rotation: 90,
        orientation: "vertical",
        blocks: [{
          kind: "text",
          sourcePage: 2,
          semanticBlockIndex: 0,
          unitIndexes: [0],
          semanticText: vertical,
          sourceRanges: [ref(2, 0, vertical)],
          inlines: [{ kind: "text", text: vertical, sourceRanges: [ref(2, 0, vertical)] }],
        }],
        unresolvedRuby: [],
        unmappedExactRuby: [],
      },
      {
        kind: "page",
        sourcePage: 3,
        rotation: 0,
        orientation: "horizontal",
        blocks: [{
          kind: "text",
          sourcePage: 3,
          semanticBlockIndex: 0,
          unitIndexes: [0],
          semanticText: mixed,
          sourceRanges: [ref(3, 0, mixed)],
          inlines: [{ kind: "text", text: mixed, sourceRanges: [ref(3, 0, mixed)] }],
        }],
        unresolvedRuby: [],
        unmappedExactRuby: [],
      },
      {
        kind: "page",
        sourcePage: 4,
        rotation: 0,
        orientation: "unknown",
        blocks: [],
        unresolvedRuby: [],
        unmappedExactRuby: [],
      },
    ],
  };
}

export function buildReadingSystemFixtureEpub(): Uint8Array {
  return serializeEpubPackage(readingSystemFixtureDocument(), {
    title: "FileShape Reading System Fixture",
    identifier: DOCUMENT_ID,
    language: "ja",
    modified: "2026-09-11T00:00:00Z",
    unresolvedRubyPolicy: "preserve-as-page-note",
    pageProgressionDirection: "rtl",
  }).bytes;
}

async function main(): Promise<void> {
  const [output = "reading-system-fixture.epub", ...extra] = process.argv.slice(2);
  if (extra.length > 0 || output.startsWith("--")) {
    throw new Error("usage: npm run fixture:reader -- [OUTPUT.epub]");
  }
  const absolute = path.resolve(output);
  await writeFile(absolute, buildReadingSystemFixtureEpub());
  console.log(`EPUB=${absolute}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
