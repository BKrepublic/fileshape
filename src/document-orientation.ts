import { attachedRunTendency } from "./attached-run-evidence.js";
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

/** Metric-backed known labels are stable. Only unknown pages may be filled from
 * document context; sparse attached-run geometry is evidence, not a page label. */
function isContextAmbiguous(observation: PageOrientationObservation): boolean {
  return observation.orientation === "unknown";
}

function channelTendency(channel: { vertical: number; horizontal: number }): WritingOrientation {
  if (channel.vertical > channel.horizontal) return "vertical";
  if (channel.horizontal > channel.vertical) return "horizontal";
  return "unknown";
}

/**
 * Read a low-confidence directional tendency without turning it into a page
 * classification. A complete unique attached-run channel is consulted first
 * because the metric classifier has already declined to classify the page.
 * Remaining channel precedence mirrors the metric classifier, but without its
 * confidence thresholds. No new numeric threshold is introduced here.
 */
function ambiguousTendency(observation: PageOrientationObservation): WritingOrientation {
  const evidence = observation.evidence;
  if (!evidence) return "unknown";

  if (evidence.attachedRun) {
    const attached = attachedRunTendency(evidence.attachedRun);
    if (attached !== "unknown") return attached;
  }

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
    if (previous.orientation === "unknown" || next.orientation === "unknown") continue;
    if (previous.orientation !== next.orientation) continue;

    const anchorOrientation = previous.orientation;
    const ambiguousRun = ordered.slice(start, endExclusive);
    if (!runSupportsContext(ambiguousRun, anchorOrientation)) continue;

    for (let fill = start; fill < endExclusive; fill += 1) {
      const target = resolved[fill];
      if (!target) continue;
      target.resolved = anchorOrientation;
      target.source = "document-context";
    }
  }

  return resolved;
}
