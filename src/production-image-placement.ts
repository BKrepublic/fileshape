import type { DocumentImageOccurrence, DocumentTextBlock } from "./document-model.js";
import type { PhysicalPageLayout } from "./physical-layout.js";
import type { WritingOrientation } from "./text-flow.js";

export const PLACEMENT_EPSILON = 1e-6;

function occurrenceLabel(occurrence: DocumentImageOccurrence): string {
  return `page ${occurrence.sourcePage} image operator ${occurrence.operatorIndex} occurrence ${occurrence.occurrenceIndex}`;
}

export function validateImageDisplayTransform(occurrence: DocumentImageOccurrence): string | undefined {
  const transform = occurrence.displayTransform;
  if (!Array.isArray(transform) || transform.length !== 6 || !transform.every(Number.isFinite)) {
    return "has non-finite display transform";
  }
  const [a, b, c, d] = transform;
  const determinant = a! * d! - b! * c!;
  if (!(a! > PLACEMENT_EPSILON && d! < -PLACEMENT_EPSILON &&
      Math.abs(b!) <= PLACEMENT_EPSILON && Math.abs(c!) <= PLACEMENT_EPSILON) ||
      !Number.isFinite(determinant)) {
    return "has unsupported display transform (must be supported non-rotated axis-aligned PNG orientation)";
  }
  const bounds = occurrence.displayBounds;
  if (bounds === undefined || bounds === null) return "has invalid display bounds";
  if (![bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite) ||
      bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
    return "has invalid display bounds";
  }
}

function requireAcceptedTransform(occurrence: DocumentImageOccurrence): void {
  const error = validateImageDisplayTransform(occurrence);
  if (error) throw new Error(`${occurrenceLabel(occurrence)} ${error}`);
}

function requireBlockPositions(
  layout: PhysicalPageLayout,
  blocks: DocumentTextBlock[],
  page: number,
): number[][] {
  const units = new Map(layout.units.map((unit) => [unit.index, unit]));
  return blocks.map((block) => {
    if (block.unitIndexes.length === 0) {
      throw new Error(`page ${page} block ${block.semanticBlockIndex} has empty unitIndexes`);
    }
    const positions = block.unitIndexes.map((index) => {
      const unit = units.get(index);
      if (!unit) throw new Error(`page ${page} block ${block.semanticBlockIndex} references missing unit ${index}`);
      if (!Number.isFinite(unit.position)) {
        throw new Error(`page ${page} block ${block.semanticBlockIndex} references unit ${index} with non-finite position`);
      }
      return unit.position;
    });
    return positions;
  });
}

function relation(
  orientation: WritingOrientation,
  positions: number[],
  bounds: DocumentImageOccurrence["displayBounds"],
): "before" | "after" | "ambiguous" {
  if (orientation === "horizontal") {
    if (positions.every((position) => position < bounds.top - PLACEMENT_EPSILON)) return "before";
    if (positions.every((position) => position > bounds.bottom + PLACEMENT_EPSILON)) return "after";
    return "ambiguous";
  }
  if (orientation === "vertical") {
    if (positions.every((position) => position > bounds.right + PLACEMENT_EPSILON)) return "before";
    if (positions.every((position) => position < bounds.left - PLACEMENT_EPSILON)) return "after";
    return "ambiguous";
  }
  return "ambiguous";
}

/** Assign deterministic text/image gaps while preserving every occurrence. */
export function assignImagePlacements(
  layout: PhysicalPageLayout | undefined,
  blocks: DocumentTextBlock[],
  occurrences: DocumentImageOccurrence[],
): DocumentImageOccurrence[] {
  if (occurrences.length === 0) return [];
  if (layout === undefined) throw new Error("image placement requires a physical page layout");
  if (layout.orientation === "unknown" && blocks.length > 0) {
    throw new Error(`page ${occurrences[0]!.sourcePage} has text blocks but unresolved writing orientation before image placement`);
  }
  if (layout.orientation === "unknown") {
    return occurrences.map((occurrence) => {
        requireAcceptedTransform(occurrence);
        return { ...occurrence, displayTransform: [...occurrence.displayTransform], displayBounds: { ...occurrence.displayBounds }, placementIndex: 0 };
      });
  }

  const blockPositions = requireBlockPositions(layout, blocks, occurrences[0]!.sourcePage);
  const placed = occurrences.map((occurrence) => {
    requireAcceptedTransform(occurrence);
    const relations = blockPositions.map((positions) => relation(layout.orientation, positions, occurrence.displayBounds));
    if (relations.some((value) => value === "ambiguous")) {
      throw new Error(`${occurrenceLabel(occurrence)} has ambiguous placement geometry`);
    }
    let seenAfter = false;
    let beforeCount = 0;
    for (const value of relations) {
      if (value === "after") seenAfter = true;
      else if (seenAfter) throw new Error(`${occurrenceLabel(occurrence)} has non-monotonic block placement`);
      else beforeCount += 1;
    }
    return {
      ...occurrence,
      displayTransform: [...occurrence.displayTransform],
      displayBounds: { ...occurrence.displayBounds },
      placementIndex: beforeCount,
    };
  });
  return placed;
}
