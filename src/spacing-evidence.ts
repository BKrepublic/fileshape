export type SpacingEstimateSource =
  | "distribution"
  | "font-fallback"
  | "single-observation"
  | "none";

export type SpacingEvidence = {
  normal: number;
  sampleCount: number;
  source: SpacingEstimateSource;
};

function lowerQuartile(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.floor((sorted.length - 1) * 0.25);
  return sorted[index] ?? 0;
}

/**
 * Estimate ordinary line/column spacing without pretending that one observed
 * gap is a distribution. Two or more eligible gaps use a robust lower
 * quartile. Sparse pages fall back to body-font scale when available, while the
 * observed sample count remains visible to downstream decisions.
 */
export function estimateNormalSpacing(
  gaps: readonly number[],
  bodyFontSize: number,
  minimumGap = 0,
): SpacingEvidence {
  const samples = gaps.filter((gap) => Number.isFinite(gap) && gap > minimumGap);
  if (samples.length >= 2) {
    return {
      normal: lowerQuartile(samples),
      sampleCount: samples.length,
      source: "distribution",
    };
  }
  if (bodyFontSize > 0 && Number.isFinite(bodyFontSize)) {
    return {
      normal: bodyFontSize * 1.65,
      sampleCount: samples.length,
      source: "font-fallback",
    };
  }
  if (samples.length === 1) {
    return {
      normal: samples[0] ?? 0,
      sampleCount: 1,
      source: "single-observation",
    };
  }
  return { normal: 0, sampleCount: 0, source: "none" };
}

/** Existing paragraph-separation calibration, centralized for all consumers. */
export function paragraphGapThreshold(normalSpacing: number, bodyFontSize: number): number {
  return normalSpacing > 0
    ? Math.max(normalSpacing * 1.55, normalSpacing + bodyFontSize * 1.25)
    : Number.POSITIVE_INFINITY;
}
