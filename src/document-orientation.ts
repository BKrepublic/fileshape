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
 * A known page with no compact evidence is treated as stable for compatibility
 * with focused callers. Production observations carry evidence. There, a known
 * label is stable only when the strongest retained evidence favors that label.
 * Ties and evidence favoring the opposite axis remain context-ambiguous.
 *
 * This deliberately adds no new confidence threshold: document context may
 * repair only labels that their own retained evidence does not strictly support.
 */
function evidenceSupportsDetected(observation: PageOrientationObservation): boolean {
  if (observation.orientation === "unknown") return false;
  if (observation.evidence === undefined) return true;

  if (observation.orientation === "vertical") {
    return observation.evidence.vertical > observation.evidence.horizontal;
  }
  return observation.evidence.horizontal > observation.evidence.vertical;
}

function isContextAmbiguous(observation: PageOrientationObservation): boolean {
  return !evidenceSupportsDetected(observation);
}

/**
 * Resolve short context-ambiguous runs from surrounding stable pages. The run
 * may contain page-level `unknown` labels and known labels whose compact
 * evidence is tied or favors the opposite axis. A run is filled only when the
 * nearest stable page on both sides exists and both sides agree.
 *
 * Strong known labels are never overridden, so genuine orientation transitions
 * remain protected. Ambiguous runs at document edges or between disagreeing
 * neighbors are likewise left unchanged.
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
      // matching known label is not a resolution event.
      if (target.detected !== previous.orientation) {
        target.resolved = previous.orientation;
        target.source = "document-context";
      }
    }
  }

  return resolved;
}
