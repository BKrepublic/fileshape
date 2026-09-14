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

function dominantRecurringClusters(candidatesByStyle: Map<string, Candidate[]>): Candidate[][] {
  const eligible = recurringClusters(candidatesByStyle);
  if (eligible.length <= 1) return eligible.map((cluster) => cluster.candidates);

  const strongest = eligible[0]!;
  const runnerUp = eligible[1]!;

  // A few recurring non-body styles are common in PDFs: cover metadata, running
  // labels, font-subset aliases, notices, and other decoration. Infer one heading
  // family only when its independent page support clearly dominates the runner-up.
  // Keep the margin itself as document-relative evidence; physical page count and
  // distances between candidate pages are deliberately irrelevant.
  const clearDominance = strongest.pageSupport >= runnerUp.pageSupport * 3;
  return clearDominance ? [strongest.candidates] : [];
}

function uniquePerSourcePage(candidates: Candidate[]): Candidate[] {
  const counts = new Map<number, number>();
  for (const candidate of candidates) {
    counts.set(candidate.sourcePage, (counts.get(candidate.sourcePage) ?? 0) + 1);
  }
  // EPUB logical grouping currently exposes one structural boundary per source
  // page. When the source presents multiple indistinguishable candidates on the
  // same page, there is not enough evidence to choose one, so omit that page
  // rather than reintroducing first-block/page-position bias.
  return candidates.filter((candidate) => counts.get(candidate.sourcePage) === 1);
}

/**
 * Infer only source-backed, recurring structural headings.
 *
 * Evidence is deliberately content- and pagination-agnostic:
 * - the block has a dominant PDF font/size style different from the document body;
 * - the same style recurs on at least two independent source pages;
 * - one recurring non-body style family is clearly dominant when families compete.
 *
 * A block does not have to be the first block on a physical PDF page, and source
 * page count/cadence never promotes or demotes it. Repagination may therefore move
 * a heading between page positions without changing its logical classification.
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

  const selected = uniquePerSourcePage(dominantRecurringClusters(candidatesByStyle).flat());
  return selected
    .sort((a, b) => a.sourcePage - b.sourcePage || a.semanticBlockIndex - b.semanticBlockIndex)
    .map(({ title, sourcePage, semanticBlockIndex }) => ({ title, sourcePage, semanticBlockIndex }));
}
