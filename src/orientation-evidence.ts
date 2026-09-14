import type { PageFlowResult, WritingOrientation } from "./text-flow.js";

export type OrientationDecisionSource = "run" | "sequence" | "baseline" | "attached-run" | "none";

export type OrientationEvidenceSummary = {
  provisional: WritingOrientation;
  decisionSource: OrientationDecisionSource;
  vertical: number;
  horizontal: number;
  margin: number;
  channels: {
    run: { vertical: number; horizontal: number };
    baseline: { vertical: number; horizontal: number };
    sequence: { vertical: number; horizontal: number };
  };
};

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

type MetricDecision = {
  orientation: WritingOrientation;
  source: Exclude<OrientationDecisionSource, "attached-run">;
};

/**
 * Replay only the metric-backed portion of the page orientation decision.
 * These conditions intentionally match text-flow.ts::detectOrientation exactly;
 * they add no new threshold. If the final page label is known but no metric
 * branch produced it, the decision came from the attached-run fallback.
 *
 * This is a temporary provenance bridge. The thresholds remain owned by page
 * flow; they must not be tuned here independently.
 */
function metricDecision(metrics: PageFlowResult["metrics"]): MetricDecision {
  if (metrics.verticalRunRatio >= 0.6 && metrics.verticalRunRatio > metrics.horizontalRunRatio) {
    return { orientation: "vertical", source: "run" };
  }
  if (metrics.horizontalRunRatio >= 0.6 && metrics.horizontalRunRatio > metrics.verticalRunRatio) {
    return { orientation: "horizontal", source: "run" };
  }
  if (
    metrics.singleCharItemRatio >= 0.7 &&
    metrics.sequenceVerticalRatio >= 0.6 &&
    metrics.sequenceVerticalRatio > metrics.sequenceHorizontalRatio
  ) {
    return { orientation: "vertical", source: "sequence" };
  }
  if (
    metrics.singleCharItemRatio >= 0.7 &&
    metrics.sequenceHorizontalRatio >= 0.6 &&
    metrics.sequenceHorizontalRatio > metrics.sequenceVerticalRatio
  ) {
    return { orientation: "horizontal", source: "sequence" };
  }
  if (metrics.singleCharItemRatio >= 0.7 && metrics.verticalBaselineRatio >= 0.6) {
    return { orientation: "vertical", source: "baseline" };
  }
  if (metrics.singleCharItemRatio >= 0.7 && metrics.horizontalBaselineRatio >= 0.6) {
    return { orientation: "horizontal", source: "baseline" };
  }
  if (metrics.verticalBaselineRatio > metrics.horizontalBaselineRatio * 1.5) {
    return { orientation: "vertical", source: "baseline" };
  }
  if (metrics.horizontalBaselineRatio > metrics.verticalBaselineRatio * 1.5) {
    return { orientation: "horizontal", source: "baseline" };
  }
  return { orientation: "unknown", source: "none" };
}

/**
 * Preserve the independent geometric orientation channels after page flow has
 * made its compatibility label. The max-channel score remains diagnostic only.
 * `decisionSource` records which existing page-level rule actually produced the
 * label so document-level resolution does not reinterpret unrelated channels as
 * a second competing classifier.
 */
export function summarizeOrientationEvidence(
  orientation: WritingOrientation,
  metrics: PageFlowResult["metrics"],
): OrientationEvidenceSummary {
  const vertical = Math.max(
    metrics.verticalRunRatio,
    metrics.verticalBaselineRatio,
    metrics.sequenceVerticalRatio,
  );
  const horizontal = Math.max(
    metrics.horizontalRunRatio,
    metrics.horizontalBaselineRatio,
    metrics.sequenceHorizontalRatio,
  );
  const metric = metricDecision(metrics);
  const decisionSource: OrientationDecisionSource = orientation === "unknown"
    ? "none"
    : metric.orientation === orientation
      ? metric.source
      : "attached-run";

  return {
    provisional: orientation,
    decisionSource,
    vertical: round(vertical),
    horizontal: round(horizontal),
    margin: round(Math.abs(vertical - horizontal)),
    channels: {
      run: {
        vertical: metrics.verticalRunRatio,
        horizontal: metrics.horizontalRunRatio,
      },
      baseline: {
        vertical: metrics.verticalBaselineRatio,
        horizontal: metrics.horizontalBaselineRatio,
      },
      sequence: {
        vertical: metrics.sequenceVerticalRatio,
        horizontal: metrics.sequenceHorizontalRatio,
      },
    },
  };
}
