import type { InspectPage, InspectTextItem } from "./pdf-inspection-model.js";

function charCount(text: string): number {
  return [...text.trim()].length;
}

/**
 * Identify short, smaller-than-body text that sits inside a page-edge band.
 *
 * The band scales with both page height and body em size, so the decision is
 * independent of a particular PDF page size or sample export. It is capped at
 * 12% of the page height to avoid turning ordinary body regions into margins.
 */
export function isShortMarginNoise(
  item: InspectTextItem,
  page: InspectPage,
  bodyFontSize: number,
): boolean {
  const count = charCount(item.text);
  if (count === 0 || count > 8 || bodyFontSize <= 0) return false;
  if (item.fontSize >= bodyFontSize * 0.98) return false;

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

  return edgeDistance <= edgeBand;
}
