import type { InspectPage, InspectTextItem } from "./pdf-inspection-model.js";
import {
  measureBodyFontEvidence,
  type BodyFontEvidence,
  type PageBodyFontInput,
} from "./text-flow.js";
import { ANNOTATION_FONT_RATIO } from "./text-item-evidence.js";

const MIN_DOCUMENT_PRIOR_PAGES = 2;

export type DocumentBodyFontPrior = {
  size: number;
  supportingPages: number;
  eligiblePages: number;
  supportRatio: number;
};

export type BodyFontResolutionReason =
  | "document-prior"
  | "no-document-prior"
  | "local-majority"
  | "already-prior"
  | "prior-not-observed"
  | "ruby-role-change"
  | "no-local-evidence";

export type BodyFontResolution = PageBodyFontInput & {
  page: number;
  reason: BodyFontResolutionReason;
  prior?: DocumentBodyFontPrior;
};

export type DocumentBodyFontContext = {
  prior?: DocumentBodyFontPrior;
  resolutions: ReadonlyMap<number, BodyFontResolution>;
};

function roundedFontSize(item: InspectTextItem): number {
  return Math.round(item.fontSize * 10) / 10;
}

function hasLocalMajority(evidence: BodyFontEvidence): boolean {
  return evidence.totalWeight > 0 && evidence.dominantWeight * 2 > evidence.totalWeight;
}

function pageObservesSize(page: InspectPage, size: number): boolean {
  return page.textItems.some((item) =>
    item.text.trim().length > 0 && item.fontSize > 0 && roundedFontSize(item) === size);
}

/**
 * A document-prior body size may be used after glyph-live ruby extraction only
 * when it leaves the exact annotation/body partition unchanged. Ruby geometry
 * itself does not depend on bodyFontSize after this role split.
 */
export function bodyFontRubyRolesStable(
  items: readonly InspectTextItem[],
  localSize: number,
  candidateSize: number,
): boolean {
  if (localSize <= 0 || candidateSize <= 0) return false;
  return items.every((item) => {
    if (item.text.trim().length === 0 || item.fontSize <= 0) return true;
    const localAnnotation = item.fontSize < localSize * ANNOTATION_FONT_RATIO;
    const candidateAnnotation = item.fontSize < candidateSize * ANNOTATION_FONT_RATIO;
    return localAnnotation === candidateAnnotation;
  });
}

function documentPrior(evidenceByPage: ReadonlyMap<number, BodyFontEvidence>): DocumentBodyFontPrior | undefined {
  const strong = [...evidenceByPage.values()].filter(hasLocalMajority);
  if (strong.length < MIN_DOCUMENT_PRIOR_PAGES) return undefined;

  const support = new Map<number, number>();
  for (const evidence of strong) {
    if (evidence.size <= 0) continue;
    support.set(evidence.size, (support.get(evidence.size) ?? 0) + 1);
  }
  const ranked = [...support.entries()]
    .map(([size, pages]) => ({ size, pages }))
    .sort((left, right) => right.pages - left.pages || right.size - left.size);
  const dominant = ranked[0];
  if (!dominant || dominant.pages < MIN_DOCUMENT_PRIOR_PAGES) return undefined;
  if (dominant.pages * 2 <= strong.length) return undefined;

  return {
    size: dominant.size,
    supportingPages: dominant.pages,
    eligiblePages: strong.length,
    supportRatio: dominant.pages / strong.length,
  };
}

/**
 * Resolve only weak page-local body-font estimates with document context.
 *
 * Strong local majorities are immutable. A document prior is itself accepted
 * only when one size has a strict majority across at least two strong pages.
 * Weak pages may adopt it only when that size is actually present on the page
 * and the change cannot alter ruby annotation/body classification.
 */
export function buildDocumentBodyFontContext(
  pages: readonly InspectPage[],
): DocumentBodyFontContext {
  const evidenceByPage = new Map(
    pages.map((page) => [page.page, measureBodyFontEvidence(page.textItems)]),
  );
  const prior = documentPrior(evidenceByPage);
  const resolutions = new Map<number, BodyFontResolution>();

  for (const page of pages) {
    const evidence = evidenceByPage.get(page.page) ?? measureBodyFontEvidence(page.textItems);
    const local: BodyFontResolution = {
      page: page.page,
      size: evidence.size,
      evidence,
      source: "page-local",
      reason: evidence.size <= 0
        ? "no-local-evidence"
        : prior === undefined
          ? "no-document-prior"
          : hasLocalMajority(evidence)
            ? "local-majority"
            : evidence.size === prior.size
              ? "already-prior"
              : !pageObservesSize(page, prior.size)
                ? "prior-not-observed"
                : !bodyFontRubyRolesStable(page.textItems, evidence.size, prior.size)
                  ? "ruby-role-change"
                  : "document-prior",
      ...(prior === undefined ? {} : { prior }),
    };

    if (local.reason === "document-prior" && prior !== undefined) {
      resolutions.set(page.page, {
        ...local,
        size: prior.size,
        source: "document-prior",
      });
    } else {
      resolutions.set(page.page, local);
    }
  }

  return {
    ...(prior === undefined ? {} : { prior }),
    resolutions,
  };
}
