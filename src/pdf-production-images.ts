import type {
  DisplayRect,
  ImageClipCoverage,
  ImageClipStatus,
} from "./pdf-image-adapter.js";
import { extractImagePaintEvidence } from "./pdf-image-adapter.js";
import {
  resolvePdfImageResource,
  type PdfImagePixelKind,
} from "./pdf-image-resource-adapter.js";

export type InspectedImageResource = {
  /** Deterministic EPUB-facing identity derived only from the PNG content bytes. */
  id: string;
  contentHash: string;
  mediaType: "image/png";
  extension: "png";
  width: number;
  height: number;
  pixelKind: PdfImagePixelKind;
  bytes: Uint8Array;
};

export type InspectedImageOccurrence = {
  sourcePage: number;
  operatorIndex: number;
  occurrenceIndex: number;
  resourceId: string;
  displayTransform: number[];
  displayBounds: DisplayRect;
  formDepth: number;
  interpolate: boolean;
  clipStatus: ImageClipStatus;
  clipCoverage: ImageClipCoverage;
  clipRect?: DisplayRect;
};

type OperatorList = { fnArray: number[]; argsArray: unknown[][] };
type PdfObjects = { get(id: string): unknown };

function occurrenceLabel(page: number, operatorIndex: number, occurrenceIndex: number): string {
  return `page ${page} image operator ${operatorIndex} occurrence ${occurrenceIndex}`;
}

function acceptedClip(status: ImageClipStatus, coverage: ImageClipCoverage): boolean {
  return (status === "none" && coverage === "none") ||
    (status === "exact-rect" && coverage === "contains-image");
}

function validBounds(bounds: DisplayRect): boolean {
  return [bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite) &&
    bounds.right > bounds.left && bounds.bottom > bounds.top;
}

/**
 * Convert pinned PDF.js image paint evidence into the production transport
 * boundary. Only decoded XObjects whose visible unit square is not cropped are
 * accepted here. Every other schema stays explicit and fail-closed.
 */
export function extractProductionPageImages(
  page: number,
  operators: OperatorList,
  viewport: number[],
  store: PdfObjects,
): { resources: InspectedImageResource[]; occurrences: InspectedImageOccurrence[] } {
  const evidence = extractImagePaintEvidence(page, operators, viewport);
  if (evidence.issues.length > 0) {
    throw new Error(`page ${page} image operator replay failed: ${evidence.issues.join(", ")}`);
  }

  const resourcesBySourceId = new Map<string, { resource: InspectedImageResource; interpolate: boolean }>();
  const resourcesByContentId = new Map<string, InspectedImageResource>();
  const occurrences: InspectedImageOccurrence[] = [];

  for (const paint of evidence.paints) {
    const label = occurrenceLabel(page, paint.operatorIndex, paint.occurrenceIndex);
    if (paint.status !== "supported-evidence") {
      throw new Error(`${label} uses unsupported schema: ${paint.reason ?? paint.kind}`);
    }
    if ((paint.kind !== "xobject" && paint.kind !== "xobject-repeat") || paint.resourceId === undefined) {
      throw new Error(`${label} uses unsupported production image kind: ${paint.kind}`);
    }
    if (!acceptedClip(paint.clipStatus, paint.clipCoverage)) {
      throw new Error(`${label} has unsupported clip: ${paint.clipStatus}/${paint.clipCoverage}`);
    }
    if (!validBounds(paint.displayBounds)) {
      throw new Error(`${label} has invalid display bounds`);
    }

    let sourceResource = resourcesBySourceId.get(paint.resourceId);
    if (!sourceResource) {
      const extracted = resolvePdfImageResource(store, paint.resourceId);
      if ("status" in extracted) {
        throw new Error(`${label} resource extraction failed: ${extracted.reason}`);
      }
      const id = `image-${extracted.contentHash}`;
      let resource = resourcesByContentId.get(id);
      if (!resource) {
        resource = {
          id,
          contentHash: extracted.contentHash,
          mediaType: extracted.mediaType,
          extension: extracted.extension,
          width: extracted.width,
          height: extracted.height,
          pixelKind: extracted.pixelKind,
          bytes: Uint8Array.from(extracted.bytes),
        };
        resourcesByContentId.set(id, resource);
      }
      sourceResource = { resource, interpolate: extracted.interpolate };
      resourcesBySourceId.set(paint.resourceId, sourceResource);
    }

    occurrences.push({
      sourcePage: page,
      operatorIndex: paint.operatorIndex,
      occurrenceIndex: paint.occurrenceIndex,
      resourceId: sourceResource.resource.id,
      displayTransform: [...paint.displayTransform],
      displayBounds: { ...paint.displayBounds },
      formDepth: paint.formDepth,
      interpolate: sourceResource.interpolate,
      clipStatus: paint.clipStatus,
      clipCoverage: paint.clipCoverage,
      ...(paint.clipRect === undefined ? {} : { clipRect: { ...paint.clipRect } }),
    });
  }

  return { resources: [...resourcesByContentId.values()], occurrences };
}
