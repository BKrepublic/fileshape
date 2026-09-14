import type { InspectPage, InspectTextItem } from "./pdf-inspection-model.js";
import { isShortMarginNoise } from "./margin-noise.js";

export const ANNOTATION_FONT_RATIO = 0.75;

export type TextItemEvidence = {
  item: InspectTextItem;
  itemIndex: number;
  visible: boolean;
  bodyFontRatio?: number;
  marginNoise: boolean;
  annotationSized: boolean;
  bodySized: boolean;
};

/**
 * Compute compact, content-agnostic evidence shared by flow, physical layout,
 * and ruby stages. This deliberately does not assign one final semantic role:
 * margin evidence and font-size evidence are independent observations, and each
 * downstream stage may keep its existing fail-closed policy for them.
 */
export function collectTextItemEvidence(
  page: InspectPage,
  bodyFontSize: number,
): TextItemEvidence[] {
  return page.textItems.map((item, itemIndex) => {
    const visible = item.text.trim().length > 0;
    const bodyFontRatio = bodyFontSize > 0 && item.fontSize > 0
      ? item.fontSize / bodyFontSize
      : undefined;
    const annotationCutoff = bodyFontSize * ANNOTATION_FONT_RATIO;
    const annotationSized = bodyFontSize > 0 && item.fontSize < annotationCutoff;
    const bodySized = bodyFontSize > 0 && item.fontSize >= annotationCutoff;
    return {
      item,
      itemIndex,
      visible,
      ...(bodyFontRatio === undefined ? {} : { bodyFontRatio }),
      marginNoise: visible && isShortMarginNoise(item, page, bodyFontSize),
      annotationSized,
      bodySized,
    };
  });
}
