/** Half-open UTF-16 offsets into the unmodified PDF.js TextItem.str.
 * A character range is not a glyph range: one glyph may encode several code points.
 * Item indexes count TextItems only (including empty/whitespace items).
 * The owning document supplies document identity; page is one-based.
 */
export type SourceTextRef = {
  page: number;
  itemIndex: number;
  charStart: number;
  charEnd: number;
};

export type SourceGlyphRef = { page: number; operatorIndex: number; glyphIndex: number };

export function fullTextRef(page: number, itemIndex: number, text: string): SourceTextRef {
  return { page, itemIndex, charStart: 0, charEnd: text.length };
}

export function mergeSourceRanges(ranges: SourceTextRef[]): SourceTextRef[] {
  const result: SourceTextRef[] = [];
  for (const range of ranges) {
    const previous = result.at(-1);
    if (previous && previous.page === range.page && previous.itemIndex === range.itemIndex &&
      previous.charEnd === range.charStart) previous.charEnd = range.charEnd;
    else result.push({ ...range });
  }
  return result;
}
