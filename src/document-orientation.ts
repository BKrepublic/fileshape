import type { OrientationEvidenceSummary } from "./orientation-evidence.js";
import type { WritingOrientation } from "./text-flow.js";

export type PageOrientationObservation = {
  page: number;
  orientation: WritingOrientation;
  /** Compact geometric evidence; optional for compatibility with focused tests/callers. */
  evidence?: OrientationEvidenceSummary;
};

export type ResolvedPageOrientation = {
  page: number;
  detected: WritingOrientation;
  resolved: WritingOrientation;
  source: "detected" | "document-context" | "unresolved";
  /** Preserved verbatim so downstream diagnostics can inspect the source evidence. */
  evidence?: OrientationEvidenceSummary;
};

export type DocumentOrientationOptions = {
  /** Avoid inferring across very long ambiguous sections. */
  maxUnknownRun?: number;
};

/**
 * Document context may fill an unknown page or reconsider only a page whose
 * known label came from the attached-run fallback. Run/sequence/baseline labels
 * remain stable even when another retained evidence channel disagrees: the page
 * classifier already chose its decisive source, and document resolution must
 * not invent a second classifier by comparing unrelated channel maxima.
 *
 * A known page with no compact evidence is treated as stable for compatibility
 * with focused callers.
 */
function isContextAmbiguous(observation: PageOrientationObservation): boolean {
  if (observation.orientation === "unknown") return true;
  if (observation.evidence === undefined) return false;
  return observation.evidence.decisionSource === "attached-run";
}

/**
 * Resolve short context-ambiguous runs from surrounding stable pages. A run is
 * filled only when the nearest stable page on both sides exists and both sides
 * agree. Strong metric-backed labels are never overridden, so genuine writing-
 * mode transitions and conflicting but decisive page evidence remain protected.
 */
export function resolveDocumentOrientations(
  observations: PageOrientationObservation[],
  options: DocumentOrientationOptions = {},
): ResolvedPageOrientation[] {
  const maxUnknownRun = options.maxUnknownRun ?? 8;
  const ordered = [...observations].sort((left, right) => left.page - right.page);
  const resolved: ResolvedPageOrientation[] = ordered.map((entry) => ({
    page: entry.page,
    detected: entry.orientation,
    resolved: entry.orientation,
    source: entry.orientation === "unknown" ? "unresolved" : "detected",
    ...(entry.evidence === undefined ? {} : { evidence: entry.evidence }),
  }));

  let index = 0;
  while (index < ordered.length) {
    const current = ordered[index];
    if (!current || !isContextAmbiguous(current)) {
      index += 1;
      continue;
    }

    const start = index;
    while (index < ordered.length) {
      const observation = ordered[index];
      if (!observation || !isContextAmbiguous(observation)) break;
      index += 1;
    }
    const endExclusive = index;
    const runLength = endExclusive - start;

    if (runLength > maxUnknownRun) continue;

    const previous = start > 0 ? ordered[start - 1] : undefined;
    const next = endExclusive < ordered.length ? ordered[endExclusive] : undefined;

    if (!previous || !next) continue;
    if (isContextAmbiguous(previous) || isContextAmbiguous(next)) continue;
    if (previous.orientation === "unknown" || next.orientation === "unknown") continue;
    if (previous.orientation !== next.orientation) continue;

    for (let fill = start; fill < endExclusive; fill += 1) {
      const target = resolved[fill];
      if (!target) continue;

      // Record document-context provenance only when context actually changes
      // the page decision or fills an unknown. Merely confirming an already
      // matching fallback label is not a resolution event.
      if (target.detected !== previous.orientation) {
        target.resolved = previous.orientation;
        target.source = "document-context";
      }
    }
  }

  return resolved;
}
