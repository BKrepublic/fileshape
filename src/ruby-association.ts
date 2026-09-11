import type { InspectPage, InspectTextItem } from "./pdf-inspector.js";
import type { WritingOrientation } from "./text-flow.js";

export type RubyCandidate = {
  annotationItemIndex: number;
  annotationText: string;
  /** Original extraction indexes, never offsets into reconstructed text. */
  baseItemIndexes: number[];
  status: "associated-run" | "unresolved";
  reason: "unique-nearby-run" | "unknown-orientation" | "no-nearby-run" | "ambiguous-runs";
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
  const visible = page.textItems.map((item, index) => ({ item, index }))
    .filter(({ item }) => item.text.trim().length > 0 && item.fontSize > 0);
  const annotations = visible.filter(({ item }) => item.fontSize < bodyFontSize * 0.75);
  const bases = visible.filter(({ item }) => item.fontSize >= bodyFontSize * 0.75);
  const start = (item: InspectTextItem) => orientation === "vertical" ? item.displayY : item.displayX;
  const end = (item: InspectTextItem) => start(item) +
    Math.abs(orientation === "vertical" ? item.height : item.width);

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
    const matches = bases.filter(({ item: base }) => {
      const ratio = item.fontSize / base.fontSize;
      if (ratio < 0.35 || ratio >= 0.75) return false;
      // Vertical ruby normally sits right of the base; horizontal ruby above it.
      // This initial candidate model leaves other placements unmatched.
      const distance = orientation === "vertical"
        ? item.displayX - base.displayX : base.displayY - item.displayY;
      if (distance < base.fontSize * 0.45 || distance > base.fontSize * 1.35) return false;
      const overlap = Math.min(end(item), end(base)) - Math.max(start(item), start(base));
      const length = end(item) - start(item);
      if (length <= 0 || overlap / length < 0.6) return false;
      return start(item) >= start(base) - base.fontSize * 0.5 &&
        end(item) <= end(base) + base.fontSize * 0.5;
    });
    if (matches.length > 1) return { ...result, reason: "ambiguous-runs" };
    const match = matches[0];
    if (!match) return result;
    return { ...result, baseItemIndexes: [match.index], status: "associated-run", reason: "unique-nearby-run" };
  });
}
