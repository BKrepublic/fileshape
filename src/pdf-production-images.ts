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
  decodedByteLength: number;
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

export const PRODUCTION_IMAGE_LIMITS = Object.freeze({
  maxWidth: 8_192,
  maxHeight: 8_192,
  maxPixelsPerResource: 33_554_432,
  maxUniqueResources: 4_096,
  maxOccurrences: 10_000,
  maxDecodedBytes: 536_870_912,
  maxPngBytes: 268_435_456,
});

type ImageOccurrenceLocation = Pick<InspectedImageOccurrence, "sourcePage" | "operatorIndex" | "occurrenceIndex">;

function limitError(name: string, actual: number, limit: number, occurrence?: ImageOccurrenceLocation): Error {
  const source = occurrence === undefined
    ? ""
    : ` at page ${occurrence.sourcePage} operator ${occurrence.operatorIndex} occurrence ${occurrence.occurrenceIndex}`;
  return new Error(`production image limit ${name} exceeded: actual ${actual}, limit ${limit}${source}`);
}

/** Validate all document-wide production image budgets after extraction. */
export function validateProductionImageLimits(
  resources: Array<Pick<InspectedImageResource, "width" | "height" | "pixelKind" | "decodedByteLength" | "bytes" | "id">>,
  occurrences: Array<Pick<InspectedImageOccurrence, "resourceId" | "sourcePage" | "operatorIndex" | "occurrenceIndex">>,
): void {
  if (resources.length > PRODUCTION_IMAGE_LIMITS.maxUniqueResources) {
    throw limitError("unique resources/document", resources.length, PRODUCTION_IMAGE_LIMITS.maxUniqueResources);
  }
  if (occurrences.length > PRODUCTION_IMAGE_LIMITS.maxOccurrences) {
    throw limitError("image occurrences/document", occurrences.length, PRODUCTION_IMAGE_LIMITS.maxOccurrences, occurrences[PRODUCTION_IMAGE_LIMITS.maxOccurrences]);
  }
  const occurrencesByResource = new Map<string, typeof occurrences[number]>();
  for (const occurrence of occurrences) occurrencesByResource.set(occurrence.resourceId, occurrence);
  let decodedBytes = 0;
  let pngBytes = 0;
  for (const resource of resources) {
    const occurrence = occurrencesByResource.get(resource.id);
    if (!Number.isInteger(resource.width) || resource.width <= 0) {
      throw new Error(`production image dimensions must be positive integers: width ${resource.width}${occurrence === undefined ? "" : ` at page ${occurrence.sourcePage} operator ${occurrence.operatorIndex} occurrence ${occurrence.occurrenceIndex}`}`);
    }
    if (!Number.isInteger(resource.height) || resource.height <= 0) {
      throw new Error(`production image dimensions must be positive integers: height ${resource.height}${occurrence === undefined ? "" : ` at page ${occurrence.sourcePage} operator ${occurrence.operatorIndex} occurrence ${occurrence.occurrenceIndex}`}`);
    }
    if (resource.width > PRODUCTION_IMAGE_LIMITS.maxWidth) throw limitError("width", resource.width, PRODUCTION_IMAGE_LIMITS.maxWidth, occurrence);
    if (resource.height > PRODUCTION_IMAGE_LIMITS.maxHeight) throw limitError("height", resource.height, PRODUCTION_IMAGE_LIMITS.maxHeight, occurrence);
    if (resource.pixelKind !== "gray1" && resource.pixelKind !== "rgb24" && resource.pixelKind !== "rgba32") {
      throw new Error(`unsupported production image pixel kind: ${String(resource.pixelKind)}${occurrence === undefined ? "" : ` at page ${occurrence.sourcePage} operator ${occurrence.operatorIndex} occurrence ${occurrence.occurrenceIndex}`}`);
    }
    const pixels = resource.width * resource.height;
    if (!Number.isSafeInteger(pixels) || pixels > PRODUCTION_IMAGE_LIMITS.maxPixelsPerResource) {
      throw limitError("pixels/resource", pixels, PRODUCTION_IMAGE_LIMITS.maxPixelsPerResource, occurrence);
    }
    const expectedDecoded = resource.pixelKind === "gray1"
      ? Math.ceil(resource.width / 8) * resource.height
      : pixels * (resource.pixelKind === "rgb24" ? 3 : 4);
    if (!Number.isInteger(resource.decodedByteLength) || resource.decodedByteLength !== expectedDecoded) {
      throw new Error(`decoded byte length mismatch: actual ${resource.decodedByteLength}, expected ${expectedDecoded}${occurrence === undefined ? "" : ` at page ${occurrence.sourcePage} operator ${occurrence.operatorIndex} occurrence ${occurrence.occurrenceIndex}`}`);
    }
    const decoded = resource.decodedByteLength;
    if (!Number.isSafeInteger(decoded) || decodedBytes > PRODUCTION_IMAGE_LIMITS.maxDecodedBytes - decoded) {
      throw limitError("decoded bytes/document", decodedBytes + decoded, PRODUCTION_IMAGE_LIMITS.maxDecodedBytes, occurrence);
    }
    decodedBytes += decoded;
    if (pngBytes > PRODUCTION_IMAGE_LIMITS.maxPngBytes - resource.bytes.byteLength) {
      throw limitError("PNG bytes/document", pngBytes + resource.bytes.byteLength, PRODUCTION_IMAGE_LIMITS.maxPngBytes, occurrence);
    }
    pngBytes += resource.bytes.byteLength;
  }
}

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
          decodedByteLength: extracted.decodedByteLength,
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
