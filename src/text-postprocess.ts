import type { ConsecutiveLineBreakPolicy } from "./conversion-options.js";

export function applyConsecutiveLineBreakPolicy(
  text: string,
  policy: ConsecutiveLineBreakPolicy,
): string {
  if (policy.mode === "preserve") return text;

  const max = Math.max(1, Math.floor(policy.maxConsecutiveLineBreaks));
  const normalized = text.replace(/\r\n?/g, "\n");
  const tooMany = new RegExp(`\\n{${max + 1},}`, "g");
  return normalized.replace(tooMany, "\n".repeat(max));
}
