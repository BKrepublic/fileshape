export type ConsecutiveLineBreakPolicy =
  | { mode: "preserve" }
  | { mode: "cap"; maxConsecutiveLineBreaks: number };

export type ContentFilterOptions = {
  removePreface: boolean;
  removeAfterword: boolean;
};

export type ConversionOptions = {
  lineBreaks: ConsecutiveLineBreakPolicy;
  content: ContentFilterOptions;
};

/**
 * Fidelity-first defaults.
 *
 * Parsing should preserve evidence from the PDF. Optional cleanup happens
 * afterwards and must never be silently enabled.
 */
export const DEFAULT_CONVERSION_OPTIONS: ConversionOptions = {
  lineBreaks: { mode: "preserve" },
  content: {
    removePreface: false,
    removeAfterword: false,
  },
};
