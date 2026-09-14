import type { InspectPage, InspectTextItem } from "./pdf-inspection-model.js";
import {
  measureMarginNoiseEvidence,
  type MarginNoiseEvidence,
} from "./margin-noise.js";
import {
  marginRecurrenceForItem,
  type DocumentMarginProfile,
  type MarginRecurrenceEvidence,
} from "./margin-recurrence.js";

export const ANNOTATION_FONT_RATIO = 0.75;

export type TextItemEvidence = {
  item: InspectTextItem;
  itemIndex: number;
  visible: boolean;
  bodyFontRatio?: number;
  /** Compact local geometry retained for document-level recurrence analysis. */
  marginEvidence: MarginNoiseEvidence;
  /** Document-level recurrence is present only when a profile was supplied. */
  marginRecurrence?: MarginRecurrenceEvidence;
  marginNoise: boolean;
  annotationSized: boolean;
  bodySized: boolean;
};

/**
 * Compute compact, content-agnostic evidence shared by flow, physical layout,
 * and ruby stages. Local margin geometry and font-size evidence are independent
 * observations. When a document margin profile is supplied, a local candidate is
 * removed only when its geometry/style cluster recurs across the document.
 * Callers without a document profile retain the legacy page-local decision.
 */
export function collectTextItemEvidence(
  page: InspectPage,
  bodyFontSize: number,
  marginProfile?: DocumentMarginProfile,
): TextItemEvidence[] {
  return page.textItems.map((item, itemIndex) => {
    const visible = item.text.trim().length > 0;
    const bodyFontRatio = bodyFontSize > 0 && item.fontSize > 0
      ? item.fontSize / bodyFontSize
      : undefined;
    const annotationCutoff = bodyFontSize * ANNOTATION_FONT_RATIO;
    const annotationSized = bodyFontSize > 0 && item.fontSize < annotationCutoff;
    const bodySized = bodyFontSize > 0 && item.fontSize >= annotationCutoff;
    const marginEvidence = measureMarginNoiseEvidence(item, page, bodyFontSize);
    const marginRecurrence = marginProfile === undefined
      ? undefined
      : marginRecurrenceForItem(marginProfile, page.page, itemIndex);
    const marginNoise = visible && marginEvidence.localCandidate &&
      (marginProfile === undefined || marginRecurrence?.recurring === true);
    return {
      item,
      itemIndex,
      visible,
      ...(bodyFontRatio === undefined ? {} : { bodyFontRatio }),
      marginEvidence,
      ...(marginRecurrence === undefined ? {} : { marginRecurrence }),
      marginNoise,
      annotationSized,
      bodySized,
    };
  });
}
