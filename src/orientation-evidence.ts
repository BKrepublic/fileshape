import type { AttachedRunEvidence } from "./attached-run-evidence.js";
import {
  decideMetricOrientation,
  type OrientationDecisionSource,
} from "./orientation-decision.js";
import type { PageFlowResult, WritingOrientation } from "./text-flow.js";

export type { OrientationDecisionSource } from "./orientation-decision.js";

export type OrientationEvidenceSummary = {
  provisional: WritingOrientation;
  decisionSource: OrientationDecisionSource;
  /** Needed to preserve classifier channel precedence; optional for older focused fixtures. */
  singleCharItemRatio?: number;
  vertical: number;
  horizontal: number;
  margin: number;
  channels: {
    run: { vertical: number; horizontal: number };
    baseline: { vertical: number; horizontal: number };
    sequence: { vertical: number; horizontal: number };
  };
  /** Independent sparse endpoint-attachment evidence. Never a page label by itself. */
  attachedRun?: AttachedRunEvidence;
};

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Preserve independent geometric orientation channels after page flow. The
 * provisional label and decision source come only from the metric classifier;
 * sparse attached-run evidence is retained separately so downstream document
 * context can use it without pretending it already classified the page.
 */
export function summarizeOrientationEvidence(
  orientation: WritingOrientation,
  metrics: PageFlowResult["metrics"],
  attachedRun?: AttachedRunEvidence,
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
  const decisionSource: OrientationDecisionSource =
    metric.orientation === orientation ? metric.source : "none";

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
    ...(attachedRun === undefined ? {} : { attachedRun }),
  };
}
