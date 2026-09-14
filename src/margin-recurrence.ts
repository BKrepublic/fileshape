import { measureMarginNoiseEvidence } from "./margin-noise.js";
import type { InspectPage, InspectTextItem } from "./pdf-inspection-model.js";

const MIN_PAGE_SUPPORT = 2;
const MIN_TEXT_PAGE_SUPPORT_RATIO = 0.2;
const FONT_RATIO_BUCKET = 0.05;
const EDGE_BAND_POSITION_BUCKET = 0.1;
const INLINE_CENTER_BUCKET = 0.1;

export type MarginRecurrenceEvidence = {
  clusterKey: string;
  pageSupport: number;
  supportRatio: number;
  recurring: boolean;
};

export type DocumentMarginProfile = {
  textBearingPageCount: number;
  evidenceByItem: ReadonlyMap<string, MarginRecurrenceEvidence>;
};

type Candidate = {
  key: string;
  page: number;
  clusterKey: string;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function bucket(value: number, width: number): number {
  return Math.round(value / width);
}

export function marginItemKey(page: number, itemIndex: number): string {
  return `${page}:${itemIndex}`;
}

function inlineCenterRatio(item: InspectTextItem, page: InspectPage): number {
  const width = Math.max(Math.abs(item.width), item.fontSize, 1);
  return clamp01((item.displayX + width / 2) / Math.max(1, page.width));
}

function candidateClusterKey(
  item: InspectTextItem,
  page: InspectPage,
  fontRatio: number,
  edgeSide: "top" | "bottom",
  edgeDistanceRatio: number,
  edgeBandRatio: number,
): string {
  const edgeBandPosition = edgeBandRatio > 0
    ? clamp01(edgeDistanceRatio / edgeBandRatio)
    : 1;
  return JSON.stringify([
    edgeSide,
    item.fontName,
    bucket(fontRatio, FONT_RATIO_BUCKET),
    bucket(edgeBandPosition, EDGE_BAND_POSITION_BUCKET),
    bucket(inlineCenterRatio(item, page), INLINE_CENTER_BUCKET),
  ]);
}

/**
 * Build compact document-level recurrence evidence for page-edge candidates.
 *
 * Text content is deliberately excluded. Recurrence is based only on edge side,
 * normalized edge/inline position and opaque PDF font style relative to the
 * page-local body size. This lets page numbers and running furniture recur even
 * when their visible text changes from page to page.
 */
export function buildDocumentMarginProfile(
  pages: readonly InspectPage[],
  bodyFontSizes: ReadonlyMap<number, number>,
): DocumentMarginProfile {
  const textBearingPageCount = pages.filter((page) =>
    page.textItems.some((item) => item.text.trim().length > 0)).length;
  const candidates: Candidate[] = [];

  for (const page of pages) {
    const bodyFontSize = bodyFontSizes.get(page.page) ?? 0;
    for (const [itemIndex, item] of page.textItems.entries()) {
      if (item.text.trim().length === 0) continue;
      const evidence = measureMarginNoiseEvidence(item, page, bodyFontSize);
      if (
        !evidence.localCandidate ||
        evidence.fontRatio === undefined ||
        evidence.edgeSide === "none"
      ) continue;
      candidates.push({
        key: marginItemKey(page.page, itemIndex),
        page: page.page,
        clusterKey: candidateClusterKey(
          item,
          page,
          evidence.fontRatio,
          evidence.edgeSide,
          evidence.edgeDistanceRatio,
          evidence.edgeBandRatio,
        ),
      });
    }
  }

  const pagesByCluster = new Map<string, Set<number>>();
  for (const candidate of candidates) {
    const support = pagesByCluster.get(candidate.clusterKey) ?? new Set<number>();
    support.add(candidate.page);
    pagesByCluster.set(candidate.clusterKey, support);
  }

  const evidenceByItem = new Map<string, MarginRecurrenceEvidence>();
  for (const candidate of candidates) {
    const pageSupport = pagesByCluster.get(candidate.clusterKey)?.size ?? 0;
    const supportRatio = textBearingPageCount === 0 ? 0 : pageSupport / textBearingPageCount;
    evidenceByItem.set(candidate.key, {
      clusterKey: candidate.clusterKey,
      pageSupport,
      supportRatio,
      recurring: pageSupport >= MIN_PAGE_SUPPORT && supportRatio >= MIN_TEXT_PAGE_SUPPORT_RATIO,
    });
  }

  return { textBearingPageCount, evidenceByItem };
}

export function marginRecurrenceForItem(
  profile: DocumentMarginProfile,
  page: number,
  itemIndex: number,
): MarginRecurrenceEvidence | undefined {
  return profile.evidenceByItem.get(marginItemKey(page, itemIndex));
}
