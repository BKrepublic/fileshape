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
 * Return a single attached-run tendency only when every page in the ambiguous
 * run has complete, unique attached-run geometry and all pages agree. This is
 * deliberately stricter than the raw low-confidence tendency used when both
 * stable neighbours already agree.
 */
function attachedRunForWholeRun(
  observations: PageOrientationObservation[],
): WritingOrientation {
  let tendency: WritingOrientation = "unknown";
  for (const observation of observations) {
    const attached = observation.evidence?.attachedRun;
    if (!attached) return "unknown";
    const current = attachedRunTendency(attached);
    if (current === "unknown") return "unknown";
    if (tendency === "unknown") tendency = current;
    else if (tendency !== current) return "unknown";
  }
  return tendency;
}

function fillRun(
  resolved: ResolvedPageOrientation[],
  start: number,
  endExclusive: number,
  orientation: Exclude<WritingOrientation, "unknown">,
): void {
  for (let fill = start; fill < endExclusive; fill += 1) {
    const target = resolved[fill];
    if (!target) continue;
    target.resolved = orientation;
    target.source = "document-context";
  }
}

/**
 * Resolve context-ambiguous runs from stable document context.
 *
 * When both nearest stable pages agree, retained directional tendency may fill
 * the ambiguous run exactly as before.
 *
 * When only one stable side exists, or when the two stable sides disagree at a
 * writing-mode transition, resolution is narrower: every ambiguous page must
 * carry complete, unique attached-run geometry, all attached tendencies must
 * agree, and that tendency must match at least one stable neighbour. Raw weak
 * run/baseline/sequence tendency never decides a one-sided or transition case.
 *
 * Physical run length is deliberately irrelevant. Metric-backed known labels
 * remain immutable, and evidence-free or internally conflicting runs stay
 * unresolved.
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
    const ambiguousRun = ordered.slice(start, endExclusive);

    if (previous && next && previous.orientation === next.orientation) {
      if (previous.orientation === "unknown") continue;
      if (!runSupportsContext(ambiguousRun, previous.orientation)) continue;
      fillRun(resolved, start, endExclusive, previous.orientation);
      continue;
    }

    const attached = attachedRunForWholeRun(ambiguousRun);
    if (attached === "unknown") continue;

    const previousMatches = previous?.orientation === attached;
    const nextMatches = next?.orientation === attached;
    if (!previousMatches && !nextMatches) continue;

    fillRun(resolved, start, endExclusive, attached);
  }

  return resolved;
}
