import type { InspectPage, InspectTextItem } from "./pdf-inspection-model.js";
import type { WritingOrientation } from "./text-flow.js";
import { dot, subtract } from "./display-geometry.js";
import { collectTextItemEvidence } from "./text-item-evidence.js";

export type RubyCandidate = {
  annotationItemIndex: number;
  annotationText: string;
  /** Original extraction indexes, never offsets into reconstructed text. */
  baseItemIndexes: number[];
  status: "associated-run" | "unresolved";
  reason: "unique-nearby-run" | "unknown-orientation" | "no-nearby-run" | "ambiguous-runs" | "missing-geometry";
  /** Geometry only: these are not claimed to be exact character boundaries. */
  inlineStart: number;
  inlineEnd: number;
};

/** Stage 3 first pass. Associate small text with a unique nearby body run.
 * Keep ambiguous/unmatched small text explicitly; proximity alone cannot prove
 * ruby semantics, so this sidecar does not remove text or emit EPUB ruby tags.
 * Multi-glyph base ranges require glyph advances and are deliberately deferred.
 */
export function associateRubyCandidates(
  page: InspectPage,
  orientation: WritingOrientation,
  bodyFontSize: number,
): RubyCandidate[] {
  if (!Number.isFinite(bodyFontSize) || bodyFontSize <= 0) return [];
  const visible = collectTextItemEvidence(page, bodyFontSize)
    .filter(({ item, visible }) => visible && item.fontSize > 0)
    .map(({ item, itemIndex, annotationSized }) => ({ item, index: itemIndex, annotationSized }));
  const annotations = visible.filter((entry) => entry.annotationSized);
  const bases = visible.filter((entry) => !entry.annotationSized);
  const start = (item: InspectTextItem) => item.displayGeometry
    ? dot(item.displayGeometry.start, item.displayGeometry.inline) : 0;
  const end = (item: InspectTextItem) => start(item) + (item.displayGeometry?.inlineExtent ?? 0);

  return annotations.map(({ item, index }): RubyCandidate => {
    const result: RubyCandidate = {
      annotationItemIndex: index,
      annotationText: item.text,
      baseItemIndexes: [],
      status: "unresolved",
      reason: "no-nearby-run",
      inlineStart: start(item),
      inlineEnd: end(item),
    };
    if (orientation === "unknown") return { ...result, reason: "unknown-orientation" };
    if (!item.displayGeometry) return { ...result, reason: "missing-geometry" };
    const matches = bases.filter(({ item: base }) => {
      const b = base.displayGeometry, a = item.displayGeometry!;
      if (!b || dot(a.inline, b.inline) < 0.99) return false;
      const ratio = a.crossExtent / b.crossExtent;
      if (ratio < 0.35 || ratio >= 0.75) return false;
      // Vertical ruby normally sits right of the base; horizontal ruby above it.
      // This initial candidate model leaves other placements unmatched.
      const distance = dot(subtract(a.start, b.start), b.side);
      if (distance < b.crossExtent * 0.45 || distance > b.crossExtent * 1.35) return false;
      const overlap = Math.min(end(item), end(base)) - Math.max(start(item), start(base));
      const length = end(item) - start(item);
      if (length <= 0 || overlap / length < 0.6) return false;
      return start(item) >= start(base) - b.crossExtent * 0.5 &&
        end(item) <= end(base) + b.crossExtent * 0.5;
    });
    if (matches.length > 1) return { ...result, reason: "ambiguous-runs" };
    const match = matches[0];
    if (!match) return result;
    return { ...result, baseItemIndexes: [match.index], status: "associated-run", reason: "unique-nearby-run" };
  });
}
