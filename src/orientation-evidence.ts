import type { PageFlowResult, WritingOrientation } from "./text-flow.js";

export type OrientationEvidenceSummary = {
  provisional: WritingOrientation;
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
 * made its compatibility label. This summary is intentionally descriptive: it
 * does not introduce a second production threshold or reinterpret the current
 * page decision. Document-level resolution may use it later without retaining
 * glyph arrays or other heavy page intermediates.
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

  return {
    provisional: orientation,
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
