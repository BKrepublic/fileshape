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
  /** Preserved verbatim; the current resolver does not reinterpret it yet. */
  evidence?: OrientationEvidenceSummary;
};

export type DocumentOrientationOptions = {
  /** Avoid inferring across very long ambiguous sections. */
  maxUnknownRun?: number;
};

/**
 * Resolve short runs of page-level `unknown` orientation from surrounding
 * text-bearing pages. An unknown run is filled only when the nearest known
 * page on both sides exists and both sides agree. This deliberately avoids
 * guessing at document edges or across orientation transitions.
 *
 * Compact orientation evidence is carried through unchanged so a later
 * confidence-aware resolver can use it without retaining heavy page geometry.
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
  while (index < resolved.length) {
    const current = resolved[index];
    if (!current || current.detected !== "unknown") {
      index += 1;
      continue;
    }

    const start = index;
    while (index < resolved.length && resolved[index]?.detected === "unknown") {
      index += 1;
    }
    const endExclusive = index;
    const runLength = endExclusive - start;

    if (runLength > maxUnknownRun) continue;

    const previous = start > 0 ? resolved[start - 1] : undefined;
    const next = endExclusive < resolved.length ? resolved[endExclusive] : undefined;

    if (!previous || !next) continue;
    if (previous.detected === "unknown" || next.detected === "unknown") continue;
    if (previous.detected !== next.detected) continue;

    for (let fill = start; fill < endExclusive; fill += 1) {
      const target = resolved[fill];
      if (!target) continue;
      target.resolved = previous.detected;
      target.source = "document-context";
    }
  }

  return resolved;
}
