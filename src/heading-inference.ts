import type { FileShapeDocument, DocumentTextBlock } from "./document-model.js";
import type { InspectPage, InspectResult, InspectTextItem } from "./pdf-inspection-model.js";

export type StructuralHeading = {
  title: string;
  sourcePage: number;
  semanticBlockIndex: number;
};

type BlockStyle = {
  key: string;
  weight: number;
};

type Candidate = StructuralHeading & {
  styleKey: string;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

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

function mode(values: number[]): { value: number; count: number } | undefined {
  if (values.length === 0) return undefined;
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: { value: number; count: number } | undefined;
  for (const [value, count] of counts) {
    if (!best || count > best.count || (count === best.count && value < best.value)) {
      best = { value, count };
    }
  }
  return best;
}

function selectMajorCandidates(candidates: Candidate[], pageCount: number): Candidate[] {
  if (candidates.length < 3) return candidates;
  const ordered = [...candidates].sort((a, b) => a.sourcePage - b.sourcePage);
  const gaps = ordered.slice(1).map((candidate, index) =>
    candidate.sourcePage - ordered[index]!.sourcePage);
  const modal = mode(gaps);
  const medianGap = median(gaps);
  if (!modal || medianGap <= 0) return ordered;

  // Some documents reuse one visual heading style for short auxiliary sections
  // as well as recurring major section starts. Split them only when the source
  // itself exposes a strong short-gap population. If the cadence is not clearly
  // separable, retain the structural candidates rather than reading semantics
  // out of their words.
  const burstMinimum = Math.max(2, Math.ceil(gaps.length * 0.2));
  const hasShortGapBurst = modal.count >= burstMinimum && modal.value < medianGap * 0.75;
  if (!hasShortGapBurst) return ordered;

  const shortThreshold = Math.max(modal.value, Math.floor(medianGap / 2));
  return ordered.filter((candidate, index) => {
    const nextPage = ordered[index + 1]?.sourcePage ?? pageCount + 1;
    return nextPage - candidate.sourcePage > shortThreshold;
  });
}

function dominantRecurringClusters(
  candidatesByStyle: Map<string, Candidate[]>,
  minimumRecurrence: number,
): Candidate[][] {
  const eligible = [...candidatesByStyle.values()]
    .filter((cluster) => cluster.length >= minimumRecurrence)
    .sort((left, right) => right.length - left.length || left[0]!.styleKey.localeCompare(right[0]!.styleKey));

  if (eligible.length <= 1) return eligible;
  const strongest = eligible[0]!;
  const runnerUp = eligible[1]!;

  // A few recurring non-body styles are common in PDFs: cover metadata, running
  // labels, font-subset aliases, notices, and other decoration can all lead a
  // page. Treating every style that happens three times as a chapter signal is
  // unsafe. Infer a heading family only when one recurring page-leading style is
  // clearly dominant within this document. If two families compete at similar
  // strength, fail closed instead of inventing structure.
  const clearDominance = strongest.length >= runnerUp.length * 3;
  return clearDominance ? [strongest] : [];
}

/**
 * Infer only source-backed, recurring structural headings.
 *
 * Evidence is deliberately content-agnostic:
 * - the block leads a source page;
 * - its dominant PDF font/size style differs from the document body style;
 * - one recurring page-leading style is clearly dominant within the document;
 * - when that same style is also used for short auxiliary sections, only a
 *   document-internal cadence split may distinguish the major starts.
 *
 * If a PDF does not encode a repeatable and unambiguous structural distinction,
 * this returns no heading rather than guessing from words, digits, punctuation,
 * language, author/site conventions, filenames or external metadata.
 */
export function inferStructuralHeadings(
  document: FileShapeDocument,
  inspection: InspectResult,
): StructuralHeading[] {
  const bodyStyle = globalBodyStyle(document, inspection);
  if (!bodyStyle) return [];
  const byPage = new Map(inspection.pages.map((page) => [page.page, page]));
  const candidatesByStyle = new Map<string, Candidate[]>();

  for (const page of document.pages) {
    const first = page.blocks[0];
    const sourcePage = byPage.get(page.sourcePage);
    if (!first || !sourcePage) continue;
    const style = blockStyle(first, sourcePage);
    if (!style || style.key === bodyStyle) continue;
    const title = sourceBackedBlockText(first).trim();
    if (title.length === 0) continue;
    const candidate: Candidate = {
      title,
      sourcePage: page.sourcePage,
      semanticBlockIndex: first.semanticBlockIndex,
      styleKey: style.key,
    };
    const bucket = candidatesByStyle.get(style.key) ?? [];
    bucket.push(candidate);
    candidatesByStyle.set(style.key, bucket);
  }

  const minimumRecurrence = document.pages.length >= 20 ? 3 : 2;
  const selected: Candidate[] = [];
  for (const cluster of dominantRecurringClusters(candidatesByStyle, minimumRecurrence)) {
    selected.push(...selectMajorCandidates(cluster, inspection.pageCount));
  }

  return selected
    .sort((a, b) => a.sourcePage - b.sourcePage || a.semanticBlockIndex - b.semanticBlockIndex)
    .map(({ title, sourcePage, semanticBlockIndex }) => ({ title, sourcePage, semanticBlockIndex }));
}
