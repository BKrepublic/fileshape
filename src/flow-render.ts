import type { ConsecutiveLineBreakPolicy } from "./conversion-options.js";
import { applyConsecutiveLineBreakPolicy } from "./text-postprocess.js";
import type { PageFlowResult } from "./text-flow.js";

export function renderPageFlowText(
  flow: PageFlowResult,
  policy: ConsecutiveLineBreakPolicy,
): string {
  return applyConsecutiveLineBreakPolicy(flow.sourceSpacingText, policy);
}
