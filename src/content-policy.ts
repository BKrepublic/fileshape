import {
  assertDocumentModel,
  resolveSourceRanges,
  type FileShapeDocument,
} from "./document-model.js";
import type { RubySpan } from "./ruby-spans.js";
import type { SourceTextRef } from "./source-text.js";

export type UnresolvedRubyPolicy =
  | "error"
  | "preserve-as-page-note"
  | "preserve-as-hidden-provenance";

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
  hiddenProvenance: PreservedUnresolvedAnnotation[];
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

function firstUnresolvedError(document: FileShapeDocument): Error | undefined {
  const page = document.pages.find((candidate) => candidate.unresolvedRuby.length > 0);
  if (!page) return undefined;
  const details = page.unresolvedRuby
    .slice(0, 5)
    .map((span) => span.reason)
    .join(", ");
  const suffix = page.unresolvedRuby.length > 5 ? `, +${page.unresolvedRuby.length - 5} more` : "";
  return new Error(
    `EPUB serialization requires unresolved ruby policy before rendering page ${page.sourcePage} (${page.unresolvedRuby.length} candidate(s): ${details}${suffix})`,
  );
}

function preserveAnnotation(
  document: FileShapeDocument,
  sourcePage: number,
  span: RubySpan,
): PreservedUnresolvedAnnotation {
  if (span.annotationSourceRanges.length === 0) {
    throw new Error(`page ${sourcePage} unresolved ruby has no annotation source ranges`);
  }
  return {
    kind: "unresolved-annotation",
    sourcePage,
    reason: span.reason,
    text: resolveSourceRanges(document.source, span.annotationSourceRanges),
    sourceRanges: cloneRefs(span.annotationSourceRanges),
    alternatives: span.alternatives.map(cloneRefs),
  };
}

export function applyEpubContentPolicy(
  document: FileShapeDocument,
  options: EpubContentPolicyOptions = {},
): EpubContentPolicyResult {
  assertDocumentModel(document);
  const policy = options.unresolvedRuby ?? "error";

  if (policy === "error") {
    const error = firstUnresolvedError(document);
    if (error) throw error;
  }

  const pages = document.pages.map((page): EpubContentPolicyPage => {
    const preserved = policy === "error"
      ? []
      : page.unresolvedRuby.map((span) => preserveAnnotation(document, page.sourcePage, span));
    return {
      sourcePage: page.sourcePage,
      notes: policy === "preserve-as-page-note" ? preserved : [],
      hiddenProvenance: policy === "preserve-as-hidden-provenance" ? preserved : [],
    };
  });

  return { document, pages };
}
