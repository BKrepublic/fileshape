import {
  assertDocumentModel,
  resolveSourceRanges,
  type FileShapeDocument,
} from "./document-model.js";
import type { RubySpan } from "./ruby-spans.js";
import type { SourceTextRef } from "./source-text.js";

export type UnresolvedRubyPolicy = "error" | "preserve-as-page-note";

export type PreservedUnresolvedAnnotation = {
  kind: "unresolved-annotation";
  sourcePage: number;
  reason: RubySpan["reason"];
  text: string;
  sourceRanges: SourceTextRef[];
  alternatives: SourceTextRef[][];
};

export type EpubContentPolicyPage = {
  sourcePage: number;
  notes: PreservedUnresolvedAnnotation[];
};

export type EpubContentPolicyResult = {
  document: FileShapeDocument;
  pages: EpubContentPolicyPage[];
};

export type EpubContentPolicyOptions = {
  unresolvedRuby?: UnresolvedRubyPolicy;
};

function cloneRefs(ranges: SourceTextRef[]): SourceTextRef[] {
  return ranges.map((range) => ({ ...range }));
}

function describeUnresolved(document: FileShapeDocument): string {
  const unresolved = document.pages.flatMap((page) =>
    page.unresolvedRuby.map((span) => ({ page: page.sourcePage, reason: span.reason })),
  );
  const details = unresolved
    .slice(0, 5)
    .map((entry) => `page ${entry.page}: ${entry.reason}`)
    .join("; ");
  const suffix = unresolved.length > 5 ? `; +${unresolved.length - 5} more` : "";
  return `${unresolved.length} candidate(s): ${details}${suffix}`;
}

export function applyEpubContentPolicy(
  document: FileShapeDocument,
  options: EpubContentPolicyOptions = {},
): EpubContentPolicyResult {
  assertDocumentModel(document);
  const policy = options.unresolvedRuby ?? "error";

  const unresolvedCount = document.pages.reduce((count, page) => count + page.unresolvedRuby.length, 0);
  if (policy === "error" && unresolvedCount > 0) {
    throw new Error(`EPUB serialization requires unresolved ruby policy before rendering (${describeUnresolved(document)})`);
  }

  const pages = document.pages.map((page): EpubContentPolicyPage => {
    const notes = policy === "preserve-as-page-note"
      ? page.unresolvedRuby.map((span): PreservedUnresolvedAnnotation => {
          if (span.annotationSourceRanges.length === 0) {
            throw new Error(`page ${page.sourcePage} unresolved ruby has no annotation source ranges`);
          }
          return {
            kind: "unresolved-annotation",
            sourcePage: page.sourcePage,
            reason: span.reason,
            text: resolveSourceRanges(document.source, span.annotationSourceRanges),
            sourceRanges: cloneRefs(span.annotationSourceRanges),
            alternatives: span.alternatives.map(cloneRefs),
          };
        })
      : [];
    return { sourcePage: page.sourcePage, notes };
  });

  return { document, pages };
}
