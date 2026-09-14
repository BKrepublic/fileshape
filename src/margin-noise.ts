import type { InspectPage, InspectTextItem } from "./pdf-inspection-model.js";

export type MarginEdgeSide = "top" | "bottom" | "none";

export type MarginNoiseEvidence = {
  charCount: number;
  fontRatio?: number;
  edgeSide: MarginEdgeSide;
  /** Distance from the nearest page edge, normalized by page height. */
  edgeDistanceRatio: number;
  /** Local edge-band width, normalized by page height. */
  edgeBandRatio: number;
  shortEnough: boolean;
  smallerThanBody: boolean;
  insideEdgeBand: boolean;
  /** Existing local rule, retained for compatibility while document recurrence is added later. */
  localCandidate: boolean;
};

function charCount(text: string): number {
  return [...text.trim()].length;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Measure compact, content-agnostic evidence for short marginal text.
 *
 * This intentionally separates evidence from the current deletion decision so
 * document-level recurrence can later contribute without recomputing geometry or
 * changing the local thresholds at the same time. No text words or sample IDs
 * are retained in this evidence.
 */
export function measureMarginNoiseEvidence(
  item: InspectTextItem,
  page: InspectPage,
  bodyFontSize: number,
): MarginNoiseEvidence {
  const count = charCount(item.text);
  const pageHeight = Math.max(1, page.height);
  const extent = Math.max(Math.abs(item.height), item.fontSize, 1);
  const firstEdge = Math.min(item.displayY, item.displayY + extent);
  const secondEdge = Math.max(item.displayY, item.displayY + extent);
  const distanceToTop = Math.max(0, firstEdge);
  const distanceToBottom = Math.max(0, pageHeight - secondEdge);
  const edgeDistance = Math.min(distanceToTop, distanceToBottom);
  const edgeBand = Math.min(
    pageHeight * 0.12,
    Math.max(pageHeight * 0.06, bodyFontSize * 4),
  );
  const shortEnough = count > 0 && count <= 8;
  const smallerThanBody = bodyFontSize > 0 && item.fontSize < bodyFontSize * 0.98;
  const insideEdgeBand = edgeDistance <= edgeBand;
  const edgeSide: MarginEdgeSide = !insideEdgeBand
    ? "none"
    : distanceToTop <= distanceToBottom
      ? "top"
      : "bottom";
  const fontRatio = bodyFontSize > 0 && item.fontSize > 0
    ? item.fontSize / bodyFontSize
    : undefined;

  return {
    charCount: count,
    ...(fontRatio === undefined ? {} : { fontRatio: round(fontRatio) }),
    edgeSide,
    edgeDistanceRatio: round(edgeDistance / pageHeight),
    edgeBandRatio: round(edgeBand / pageHeight),
    shortEnough,
    smallerThanBody,
    insideEdgeBand,
    localCandidate: shortEnough && smallerThanBody && insideEdgeBand,
  };
}

/**
 * Compatibility wrapper for the currently accepted local margin rule.
 * Consumers that need provenance should use `measureMarginNoiseEvidence`.
 */
export function isShortMarginNoise(
  item: InspectTextItem,
  page: InspectPage,
  bodyFontSize: number,
): boolean {
  return measureMarginNoiseEvidence(item, page, bodyFontSize).localCandidate;
}
