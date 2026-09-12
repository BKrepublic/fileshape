import type { DocumentImageOccurrence, DocumentTextBlock } from "./document-model.js";
import type { PhysicalPageLayout } from "./physical-layout.js";
import type { WritingOrientation } from "./text-flow.js";

export const PLACEMENT_EPSILON = 1e-6;
export const IMAGE_ASPECT_RATIO_EPSILON = 1e-6;

function occurrenceLabel(occurrence: DocumentImageOccurrence): string {
  return `page ${occurrence.sourcePage} image operator ${occurrence.operatorIndex} occurrence ${occurrence.occurrenceIndex}`;
}

function approximatelyEqual(left: number, right: number, epsilon = PLACEMENT_EPSILON): boolean {
  return Math.abs(left - right) <= epsilon * Math.max(1, Math.abs(left), Math.abs(right));
}

function boundsFromTransform(transform: number[]): DocumentImageOccurrence["displayBounds"] {
  const [a, b, c, d, e, f] = transform;
  const points = [
    [e!, f!],
    [a! + e!, b! + f!],
    [c! + e!, d! + f!],
    [a! + c! + e!, b! + d! + f!],
  ];
  const xs = points.map(([x]) => x!);
  const ys = points.map(([, y]) => y!);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

function finiteRect(rect: DocumentImageOccurrence["displayBounds"] | undefined): rect is DocumentImageOccurrence["displayBounds"] {
  return rect !== undefined && [rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite) &&
    rect.right > rect.left && rect.bottom > rect.top;
}

function rectContains(
  container: DocumentImageOccurrence["displayBounds"],
  target: DocumentImageOccurrence["displayBounds"],
): boolean {
  return container.left <= target.left + PLACEMENT_EPSILON &&
    container.top <= target.top + PLACEMENT_EPSILON &&
    container.right >= target.right - PLACEMENT_EPSILON &&
    container.bottom >= target.bottom - PLACEMENT_EPSILON;
}

function rectsOverlap(
  left: DocumentImageOccurrence["displayBounds"],
  right: DocumentImageOccurrence["displayBounds"],
): boolean {
  const width = Math.min(left.right, right.right) - Math.max(left.left, right.left);
  const height = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
  return width > PLACEMENT_EPSILON && height > PLACEMENT_EPSILON;
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
  if (!finiteRect(bounds)) return "has invalid display bounds";
  const derived = boundsFromTransform(transform);
  if (!approximatelyEqual(bounds.left, derived.left) || !approximatelyEqual(bounds.top, derived.top) ||
      !approximatelyEqual(bounds.right, derived.right) || !approximatelyEqual(bounds.bottom, derived.bottom)) {
    return "has display bounds inconsistent with display transform";
  }

  if (occurrence.clipStatus === "none") {
    if (occurrence.clipCoverage !== "none") return "has contradictory clip coverage for clipStatus=none";
    if (occurrence.clipRect !== undefined) return "has clipRect while clipStatus=none";
  } else if (occurrence.clipStatus === "exact-rect") {
    if (occurrence.clipCoverage !== "contains-image") return "has unsupported exact clip coverage";
    if (!finiteRect(occurrence.clipRect)) return "has invalid exact clipRect";
    if (!rectContains(occurrence.clipRect, bounds)) return "has exact clipRect that does not contain display bounds";
  } else {
    return `has unsupported clip status ${String(occurrence.clipStatus)}`;
  }
}

export function validateImageAspectRatio(
  occurrence: DocumentImageOccurrence,
  resourceWidth: number,
  resourceHeight: number,
): string | undefined {
  if (!Number.isInteger(resourceWidth) || resourceWidth <= 0 || !Number.isInteger(resourceHeight) || resourceHeight <= 0) {
    return "references image resource with invalid dimensions";
  }
  const displayWidth = occurrence.displayBounds.right - occurrence.displayBounds.left;
  const displayHeight = occurrence.displayBounds.bottom - occurrence.displayBounds.top;
  const left = displayWidth * resourceHeight;
  const right = displayHeight * resourceWidth;
  const relativeError = Math.abs(left - right) / Math.max(1, Math.abs(left), Math.abs(right));
  if (relativeError > IMAGE_ASPECT_RATIO_EPSILON) {
    return `has unsupported non-uniform image scaling (display ${displayWidth}x${displayHeight}, resource ${resourceWidth}x${resourceHeight})`;
  }
}

function requireAcceptedTransform(occurrence: DocumentImageOccurrence): void {
  const error = validateImageDisplayTransform(occurrence);
  if (error) throw new Error(`${occurrenceLabel(occurrence)} ${error}`);
}

function requireNoImageOverlap(occurrences: DocumentImageOccurrence[]): void {
  for (let leftIndex = 0; leftIndex < occurrences.length; leftIndex += 1) {
    const left = occurrences[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < occurrences.length; rightIndex += 1) {
      const right = occurrences[rightIndex]!;
      if (rectsOverlap(left.displayBounds, right.displayBounds)) {
        throw new Error(`${occurrenceLabel(left)} overlaps ${occurrenceLabel(right)}; layered image compositing is unsupported`);
      }
    }
  }
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
  for (const occurrence of occurrences) requireAcceptedTransform(occurrence);
  requireNoImageOverlap(occurrences);
  if (layout.orientation === "unknown" && blocks.length > 0) {
    throw new Error(`page ${occurrences[0]!.sourcePage} has text blocks but unresolved writing orientation before image placement`);
  }
  if (layout.orientation === "unknown") {
    return occurrences.map((occurrence) => ({
      ...occurrence,
      displayTransform: [...occurrence.displayTransform],
      displayBounds: { ...occurrence.displayBounds },
      placementIndex: 0,
    }));
  }

  const blockPositions = requireBlockPositions(layout, blocks, occurrences[0]!.sourcePage);
  return occurrences.map((occurrence) => {
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
}
