import {
  decideMetricOrientation,
  type OrientationDecisionSource,
} from "./orientation-decision.js";
import type { PageFlowResult, WritingOrientation } from "./text-flow.js";

export type { OrientationDecisionSource } from "./orientation-decision.js";

export type OrientationEvidenceSummary = {
  provisional: WritingOrientation;
  decisionSource: OrientationDecisionSource;
  /** Needed to preserve the page classifier's channel precedence downstream. */
  singleCharItemRatio: number;
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

/**
 * Preserve the independent geometric orientation channels after page flow has
 * made its compatibility label. The max-channel score remains diagnostic only.
 * `decisionSource` is derived from the same shared metric decision used by page
 * flow, so provenance cannot drift when precedence changes.
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
  const metric = decideMetricOrientation(metrics);
  const decisionSource: OrientationDecisionSource = orientation === "unknown"
    ? "none"
    : metric.orientation === orientation
      ? metric.source
      : "attached-run";

  return {
    provisional: orientation,
    decisionSource,
    singleCharItemRatio: metrics.singleCharItemRatio,
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
