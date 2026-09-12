import type { FileShapeDocument } from "./document-model.js";

export type CoverOccurrenceSelector = {
  sourcePage: number;
  operatorIndex: number;
  occurrenceIndex: number;
};

function safeInteger(value: string, label: string, minimum: number): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`cover occurrence ${label} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`cover occurrence ${label} must be ${minimum === 1 ? "a positive" : "a non-negative"} safe integer`);
  }
  return parsed;
}

/** Parse exact PDF image provenance. No page/image heuristics are accepted here. */
export function parseCoverOccurrenceSelector(value: string): CoverOccurrenceSelector {
  const parts = value.split(":");
  if (parts.length !== 3) {
    throw new Error("--cover-occurrence must be PAGE:OPERATOR:OCCURRENCE");
  }
  return {
    sourcePage: safeInteger(parts[0]!, "page", 1),
    operatorIndex: safeInteger(parts[1]!, "operator index", 0),
    occurrenceIndex: safeInteger(parts[2]!, "occurrence index", 0),
  };
}

export function coverOccurrenceLabel(selector: CoverOccurrenceSelector): string {
  return `${selector.sourcePage}:${selector.operatorIndex}:${selector.occurrenceIndex}`;
}

/** Resolve a user/source-backed exact occurrence to its already-packaged image resource. */
export function resolveCoverImageResourceId(
  document: FileShapeDocument,
  selector: CoverOccurrenceSelector,
): string {
  const matches = document.pages.flatMap((page) => page.imageOccurrences).filter((occurrence) =>
    occurrence.sourcePage === selector.sourcePage &&
    occurrence.operatorIndex === selector.operatorIndex &&
    occurrence.occurrenceIndex === selector.occurrenceIndex);

  const label = coverOccurrenceLabel(selector);
  if (matches.length === 0) {
    throw new Error(`cover occurrence not found: ${label}`);
  }
  if (matches.length !== 1) {
    throw new Error(`cover occurrence is ambiguous: ${label} matched ${matches.length} occurrences`);
  }

  const resourceId = matches[0]!.resourceId;
  const resources = document.imageResources.filter((resource) => resource.id === resourceId);
  if (resources.length !== 1) {
    throw new Error(`cover occurrence ${label} does not resolve to exactly one image resource: ${resourceId}`);
  }
  return resourceId;
}
