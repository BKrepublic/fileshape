import type { FileShapeDocument, DocumentTextBlock } from "./document-model.js";
import type { InspectPage, InspectResult, InspectTextItem } from "./pdf-inspection-model.js";

export type StructuralHeading = {
  title: string;
  sourcePage: number;
  semanticBlockIndex: number;
};

export type HeadingFamilyEvidence = {
  styleKey: string;
  pageSupport: number;
  candidateCount: number;
  supportShare: number;
  selected: boolean;
};

export type HeadingInferenceDecision =
  | "no-body-style"
  | "no-recurring-family"
  | "single-recurring-family"
  | "clear-dominance"
  | "competing-families";

export type StructuralHeadingInference = {
  headings: StructuralHeading[];
  bodyStyle?: string;
  families: HeadingFamilyEvidence[];
  strongestPageSupport: number;
  runnerUpPageSupport: number;
  supportMargin: number;
  /** strongest / runner-up; undefined when there is no runner-up. */
  dominanceRatio?: number;
  decision: HeadingInferenceDecision;
};

type BlockStyle = {
  key: string;
  weight: number;
};

type Candidate = StructuralHeading & {
  styleKey: string;
};

type CandidateCluster = {
  candidates: Candidate[];
  pageSupport: number;
};

function styleKey(item: InspectTextItem): string {
  // Font names are opaque PDF evidence. Do not interpret words such as Bold or
  // author-specific naming conventions; recurrence within one source document
  // is the only thing that matters here. A small numeric bucket absorbs harmless
  // floating-point noise while retaining materially different text sizes.
  return `${item.fontName}\u0000${item.fontSize.toFixed(2)}`;
}

function rangeWeight(text: string): number {
  return Math.max(1, [...text].length);
}

function sourceBackedBlockText(block: DocumentTextBlock): string {
  return block.inlines
    .map((inline) => inline.kind === "text" ? inline.text : inline.base.text)
    .join("");
}

function blockStyle(block: DocumentTextBlock, page: InspectPage): BlockStyle | undefined {
  const weights = new Map<string, number>();
  for (const range of block.sourceRanges) {
    const item = page.textItems[range.itemIndex];
    if (!item) continue;
    const slice = item.text.slice(range.charStart, range.charEnd);
    if (slice.trim().length === 0) continue;
    const key = styleKey(item);
    weights.set(key, (weights.get(key) ?? 0) + rangeWeight(slice));
  }
  let best: BlockStyle | undefined;
  for (const [key, weight] of weights) {
    if (!best || weight > best.weight || (weight === best.weight && key < best.key)) {
      best = { key, weight };
    }
  }
  return best;
}

function globalBodyStyle(document: FileShapeDocument, inspection: InspectResult): string | undefined {
  const byPage = new Map(inspection.pages.map((page) => [page.page, page]));
  const totals = new Map<string, number>();
  for (const page of document.pages) {
    const sourcePage = byPage.get(page.sourcePage);
    if (!sourcePage) continue;
    for (const block of page.blocks) {
      const style = blockStyle(block, sourcePage);
      if (!style) continue;
      totals.set(style.key, (totals.get(style.key) ?? 0) + style.weight);
    }
  }
  let bestKey: string | undefined;
  let bestWeight = -1;
  for (const [key, weight] of totals) {
    if (weight > bestWeight || (weight === bestWeight && (bestKey === undefined || key < bestKey))) {
      bestKey = key;
      bestWeight = weight;
    }
  }
  return bestKey;
}

function recurringClusters(candidatesByStyle: Map<string, Candidate[]>): CandidateCluster[] {
  return [...candidatesByStyle.values()]
    .map((candidates) => ({
      candidates,
      // Recurrence means independent source-page support. Repeating the same
      // decoration several times on one page is not document-level evidence.
      pageSupport: new Set(candidates.map((candidate) => candidate.sourcePage)).size,
    }))
    .filter((cluster) => cluster.pageSupport >= 2)
    .sort((left, right) =>
      right.pageSupport - left.pageSupport ||
      right.candidates.length - left.candidates.length ||
      left.candidates[0]!.styleKey.localeCompare(right.candidates[0]!.styleKey));
}

function headingCandidates(
  document: FileShapeDocument,
  inspection: InspectResult,
  bodyStyle: string,
): Map<string, Candidate[]> {
  const byPage = new Map(inspection.pages.map((page) => [page.page, page]));
  const candidatesByStyle = new Map<string, Candidate[]>();

  for (const page of document.pages) {
    const sourcePage = byPage.get(page.sourcePage);
    if (!sourcePage) continue;
    for (const block of page.blocks) {
      const style = blockStyle(block, sourcePage);
      if (!style || style.key === bodyStyle) continue;
      const title = sourceBackedBlockText(block).trim();
      if (title.length === 0) continue;
      const candidate: Candidate = {
        title,
        sourcePage: page.sourcePage,
        semanticBlockIndex: block.semanticBlockIndex,
        styleKey: style.key,
      };
      const bucket = candidatesByStyle.get(style.key) ?? [];
      bucket.push(candidate);
      candidatesByStyle.set(style.key, bucket);
    }
  }

  return candidatesByStyle;
}

function publicHeadings(clusters: CandidateCluster[]): StructuralHeading[] {
  return clusters
    .flatMap((cluster) => cluster.candidates)
    .sort((a, b) => a.sourcePage - b.sourcePage || a.semanticBlockIndex - b.semanticBlockIndex)
    .map(({ title, sourcePage, semanticBlockIndex }) => ({ title, sourcePage, semanticBlockIndex }));
}

/**
 * Infer source-backed structural headings while retaining the complete recurring
 * family competition that led to the current binary selection.
 *
 * The historical acceptance rule is intentionally unchanged: one recurring
 * family is accepted directly; when multiple families recur, the strongest must
 * have at least 3x the independent page support of the runner-up. The returned
 * support/share/margin/ratio evidence makes that empirical threshold observable
 * without changing EPUB output or interpreting text content.
 */
export function inferStructuralHeadingEvidence(
  document: FileShapeDocument,
  inspection: InspectResult,
): StructuralHeadingInference {
  const bodyStyle = globalBodyStyle(document, inspection);
  if (!bodyStyle) {
    return {
      headings: [],
      families: [],
      strongestPageSupport: 0,
      runnerUpPageSupport: 0,
      supportMargin: 0,
      decision: "no-body-style",
    };
  }

  const eligible = recurringClusters(headingCandidates(document, inspection, bodyStyle));
  if (eligible.length === 0) {
    return {
      headings: [],
      bodyStyle,
      families: [],
      strongestPageSupport: 0,
      runnerUpPageSupport: 0,
      supportMargin: 0,
      decision: "no-recurring-family",
    };
  }

  const strongest = eligible[0]!;
  const runnerUp = eligible[1];
  const totalSupport = eligible.reduce((sum, cluster) => sum + cluster.pageSupport, 0);
  const clearDominance = runnerUp === undefined || strongest.pageSupport >= runnerUp.pageSupport * 3;
  const selectedStyleKey = clearDominance ? strongest.candidates[0]!.styleKey : undefined;
  const families = eligible.map((cluster): HeadingFamilyEvidence => ({
    styleKey: cluster.candidates[0]!.styleKey,
    pageSupport: cluster.pageSupport,
    candidateCount: cluster.candidates.length,
    supportShare: totalSupport === 0 ? 0 : cluster.pageSupport / totalSupport,
    selected: cluster.candidates[0]!.styleKey === selectedStyleKey,
  }));
  const runnerUpPageSupport = runnerUp?.pageSupport ?? 0;

  return {
    headings: clearDominance ? publicHeadings([strongest]) : [],
    bodyStyle,
    families,
    strongestPageSupport: strongest.pageSupport,
    runnerUpPageSupport,
    supportMargin: strongest.pageSupport - runnerUpPageSupport,
    ...(runnerUp === undefined ? {} : { dominanceRatio: strongest.pageSupport / runnerUp.pageSupport }),
    decision: runnerUp === undefined
      ? "single-recurring-family"
      : clearDominance
        ? "clear-dominance"
        : "competing-families",
  };
}

/**
 * Backwards-compatible heading-only view. Physical pagination remains provenance,
 * not semantic structure, and the existing recurrence/dominance rule is unchanged.
 */
export function inferStructuralHeadings(
  document: FileShapeDocument,
  inspection: InspectResult,
): StructuralHeading[] {
  return inferStructuralHeadingEvidence(document, inspection).headings;
}
