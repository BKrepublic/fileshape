import type { FileShapeDocument } from "../src/document-model.js";
import type { SourceTextRef } from "../src/source-text.js";

/** Covers both writing modes, exact ruby, supplementary Unicode, XML escaping,
 * source whitespace, unresolved page notes, and a blank page. */
export function epubcheckDocumentFixture(): FileShapeDocument {
  const texts = ["  A&B <text>\tline\nbreak ", "𠮷", "よし", " 未確定 & <注> "];
  const ref = (page: number, itemIndex: number): SourceTextRef[] => [{
    page, itemIndex, charStart: 0, charEnd: texts[itemIndex]!.length,
  }];
  return {
    kind: "document",
    id: "urn:fileshape:epubcheck-fixture",
    imageResources: [],
    source: {
      documentId: "urn:fileshape:epubcheck-fixture",
      pages: [1, 2, 3].map((page) => ({
        page,
        textItems: page === 3 ? [] : texts.map((text, itemIndex) => ({ text, itemIndex })),
      })),
    },
    pages: ["horizontal", "vertical", "unknown"].map((orientation, index) => {
      const page = index + 1;
      return {
        kind: "page",
        imageOccurrences: [],
        sourcePage: page,
        rotation: 0,
        orientation: orientation as "horizontal" | "vertical" | "unknown",
        blocks: page === 3 ? [] : [{
          kind: "text",
          sourcePage: page,
          semanticBlockIndex: 0,
          unitIndexes: [0],
          semanticText: texts[0]! + texts[1]!,
          sourceRanges: [...ref(page, 0), ...ref(page, 1)],
          inlines: [
            { kind: "text", text: texts[0]!, sourceRanges: ref(page, 0) },
            {
              kind: "ruby",
              base: { text: texts[1]!, sourceRanges: ref(page, 1), glyphRefs: [] },
              annotation: { text: texts[2]!, sourceRanges: ref(page, 2), glyphRefs: [] },
            },
          ],
        }],
        unresolvedRuby: page === 3 ? [] : [{
          status: "unresolved",
          reason: "no-base",
          annotationSourceRanges: ref(page, 3),
          baseSourceRanges: [],
          annotationGlyphRefs: [],
          baseGlyphRefs: [],
          alternatives: [],
        }],
        unmappedExactRuby: [],
      };
    }),
  };
}
