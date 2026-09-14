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
};

/**
 * Compute compact, content-agnostic evidence shared by flow, physical layout,
 * and ruby stages. This deliberately does not assign one final semantic role:
 * margin evidence and annotation-size evidence are independent observations,
 * and each downstream stage may have a different fail-closed policy for them.
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
    const annotationSized = bodyFontSize > 0 && item.fontSize < bodyFontSize * ANNOTATION_FONT_RATIO;
    return {
      item,
      itemIndex,
      visible,
      ...(bodyFontRatio === undefined ? {} : { bodyFontRatio }),
      marginNoise: visible && isShortMarginNoise(item, page, bodyFontSize),
      annotationSized,
    };
  });
}
