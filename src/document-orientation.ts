import type { OrientationEvidenceSummary } from "./orientation-evidence.js";
import type { WritingOrientation } from "./text-flow.js";

export type PageOrientationObservation = {
  page: number;
  orientation: WritingOrientation;
  /** Compact geometric evidence; optional for compatibility with focused callers. */
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

function channelTendency(channel: { vertical: number; horizontal: number }): WritingOrientation {
  if (channel.vertical > channel.horizontal) return "vertical";
  if (channel.horizontal > channel.vertical) return "horizontal";
  return "unknown";
}

/**
 * Read a low-confidence directional tendency without turning it into a page
 * classification. Channel precedence mirrors the metric classifier: sequence
 * leads only for glyph-dominant pages, then run geometry, then baseline geometry.
 * No new numeric confidence threshold is introduced here.
 */
function ambiguousTendency(observation: PageOrientationObservation): WritingOrientation {
  const evidence = observation.evidence;
  if (!evidence) return "unknown";

  if ((evidence.singleCharItemRatio ?? 0) >= 0.7) {
    const sequence = channelTendency(evidence.channels.sequence);
    if (sequence !== "unknown") return sequence;
  }

  const run = channelTendency(evidence.channels.run);
  if (run !== "unknown") return run;

  return channelTendency(evidence.channels.baseline);
}

function runSupportsContext(
  observations: PageOrientationObservation[],
  orientation: Exclude<WritingOrientation, "unknown">,
): boolean {
  return observations.length > 0 && observations.every((observation) =>
    ambiguousTendency(observation) === orientation);
}

/**
 * Resolve context-ambiguous runs from surrounding stable pages.
 *
 * Physical run length is deliberately irrelevant. Resolution requires:
 * - nearest stable pages on both sides;
 * - both stable pages agree on orientation;
 * - every ambiguous page carries a retained directional tendency matching them.
 *
 * Neutral/evidence-free pages stay unresolved, as do runs containing any
 * opposite tendency. This protects real writing-mode transitions without making
 * pagination itself part of the semantic decision.
 */
export function resolveDocumentOrientations(
  observations: PageOrientationObservation[],
): ResolvedPageOrientation[] {
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

    const previous = start > 0 ? ordered[start - 1] : undefined;
    const next = endExclusive < ordered.length ? ordered[endExclusive] : undefined;

    if (!previous || !next) continue;
    if (isContextAmbiguous(previous) || isContextAmbiguous(next)) continue;
    if (previous.orientation === "unknown" || next.orientation === "unknown") continue;
    if (previous.orientation !== next.orientation) continue;

    const anchorOrientation = previous.orientation;
    const ambiguousRun = ordered.slice(start, endExclusive);
    if (!runSupportsContext(ambiguousRun, anchorOrientation)) continue;

    for (let fill = start; fill < endExclusive; fill += 1) {
      const target = resolved[fill];
      if (!target) continue;

      // Record document-context provenance only when context actually changes
      // the page decision or fills an unknown. Merely confirming an already
      // matching fallback label is not a resolution event.
      if (target.detected !== anchorOrientation) {
        target.resolved = anchorOrientation;
        target.source = "document-context";
      }
    }
  }

  return resolved;
}
