export type WritingOrientation = "vertical" | "horizontal" | "unknown";

export type OrientationDecisionSource = "run" | "sequence" | "baseline" | "none";

export type OrientationMetrics = {
  singleCharItemRatio: number;
  verticalRunRatio: number;
  horizontalRunRatio: number;
  verticalBaselineRatio: number;
  horizontalBaselineRatio: number;
  sequenceVerticalRatio: number;
  sequenceHorizontalRatio: number;
};

export type MetricOrientationDecision = {
  orientation: WritingOrientation;
  source: OrientationDecisionSource;
};

/**
 * Choose the metric-backed page orientation from representation-independent
 * geometric evidence. When most source items are individual glyphs, their
 * display-coordinate sequence describes the page composition more directly
 * than the aspect ratio of the small minority of multi-character runs.
 *
 * Thresholds are intentionally the existing FileShape thresholds. This helper
 * owns their precedence so page flow and provenance cannot drift apart.
 */
export function decideMetricOrientation(metrics: OrientationMetrics): MetricOrientationDecision {
  const glyphDominant = metrics.singleCharItemRatio >= 0.7;

  if (
    glyphDominant &&
    metrics.sequenceVerticalRatio >= 0.6 &&
    metrics.sequenceVerticalRatio > metrics.sequenceHorizontalRatio
  ) {
    return { orientation: "vertical", source: "sequence" };
  }
  if (
    glyphDominant &&
    metrics.sequenceHorizontalRatio >= 0.6 &&
    metrics.sequenceHorizontalRatio > metrics.sequenceVerticalRatio
  ) {
    return { orientation: "horizontal", source: "sequence" };
  }
  if (metrics.verticalRunRatio >= 0.6 && metrics.verticalRunRatio > metrics.horizontalRunRatio) {
    return { orientation: "vertical", source: "run" };
  }
  if (metrics.horizontalRunRatio >= 0.6 && metrics.horizontalRunRatio > metrics.verticalRunRatio) {
    return { orientation: "horizontal", source: "run" };
  }
  if (glyphDominant && metrics.verticalBaselineRatio >= 0.6) {
    return { orientation: "vertical", source: "baseline" };
  }
  if (glyphDominant && metrics.horizontalBaselineRatio >= 0.6) {
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
