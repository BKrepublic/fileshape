import type { InspectTextItem } from "./pdf-inspection-model.js";
import type { WritingOrientation } from "./orientation-decision.js";

export type AttachedRunAxisEvidence = {
  anchorCount: number;
  pendingCount: number;
  attachedCount: number;
  complete: boolean;
};

export type AttachedRunEvidence = {
  vertical: AttachedRunAxisEvidence;
  horizontal: AttachedRunAxisEvidence;
};

function charCount(text: string): number {
  return [...text.trim()].length;
}

function axisEvidence(
  items: InspectTextItem[],
  orientation: Exclude<WritingOrientation, "unknown">,
): AttachedRunAxisEvidence {
  const inline = (item: InspectTextItem) => orientation === "vertical" ? item.displayY : item.displayX;
  const cross = (item: InspectTextItem) => orientation === "vertical" ? item.displayX : item.displayY;
  const extent = (item: InspectTextItem) => Math.abs(orientation === "vertical" ? item.height : item.width);
  const breadth = (item: InspectTextItem) => Math.abs(orientation === "vertical" ? item.width : item.height);
  const anchors = items.filter((item) => charCount(item.text) >= 2 &&
    extent(item) >= item.fontSize * 3 && extent(item) > breadth(item) * 1.5);
  const anchorSet = new Set(anchors);
  const pending = items.filter((item) => !anchorSet.has(item));
  const originalPendingCount = pending.length;

  if (anchors.length === 0 || originalPendingCount === 0) {
    return {
      anchorCount: anchors.length,
      pendingCount: originalPendingCount,
      attachedCount: 0,
      complete: false,
    };
  }

  // A second elongated run is evidence of mixed layout, not an attachment.
  if (pending.some((item) => item.fontSize <= 0 ||
    Math.max(Math.abs(item.width), Math.abs(item.height)) > item.fontSize * 1.5)) {
    return {
      anchorCount: anchors.length,
      pendingCount: originalPendingCount,
      attachedCount: 0,
      complete: false,
    };
  }

  const attached = [...anchors];
  let attachedCount = 0;
  while (pending.length > 0) {
    const index = pending.findIndex((item) => attached.some((parent) => {
      const size = Math.max(parent.fontSize, item.fontSize);
      const ratio = Math.min(parent.fontSize, item.fontSize) / size;
      const gap = inline(item) - (inline(parent) + extent(parent));
      return ratio >= 0.75 && Math.abs(cross(item) - cross(parent)) <= size * 0.5 &&
        Math.abs(gap) <= size * 0.75 && inline(item) > inline(parent);
    }));
    if (index < 0) break;
    const [matched] = pending.splice(index, 1);
    if (matched) attached.push(matched);
    attachedCount += 1;
  }

  return {
    anchorCount: anchors.length,
    pendingCount: originalPendingCount,
    attachedCount,
    complete: attachedCount === originalPendingCount,
  };
}

/**
 * Compact geometry-only evidence for sparse text attached to an elongated run.
 * This is deliberately not a page classifier: callers must decide how much
 * surrounding document context is required before using it as orientation.
 */
export function measureAttachedRunEvidence(items: InspectTextItem[]): AttachedRunEvidence {
  return {
    vertical: axisEvidence(items, "vertical"),
    horizontal: axisEvidence(items, "horizontal"),
  };
}

export function attachedRunTendency(evidence: AttachedRunEvidence): WritingOrientation {
  const vertical = evidence.vertical.complete;
  const horizontal = evidence.horizontal.complete;
  if (vertical === horizontal) return "unknown";
  return vertical ? "vertical" : "horizontal";
}

export function emptyAttachedRunEvidence(): AttachedRunEvidence {
  return {
    vertical: { anchorCount: 0, pendingCount: 0, attachedCount: 0, complete: false },
    horizontal: { anchorCount: 0, pendingCount: 0, attachedCount: 0, complete: false },
  };
}
