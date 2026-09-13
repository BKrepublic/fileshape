const VERTICAL_PRESENTATION_PUNCTUATION = new Map<string, string>([
  ["︐", "，"],
  ["︑", "、"],
  ["︒", "。"],
  ["︓", "："],
  ["︔", "；"],
  ["︕", "！"],
  ["︖", "？"],
  ["︗", "〖"],
  ["︘", "〗"],
  ["︙", "…"],
  ["︰", "‥"],
  ["︱", "—"],
  ["︲", "–"],
  ["︵", "（"],
  ["︶", "）"],
  ["︷", "｛"],
  ["︸", "｝"],
  ["︹", "〔"],
  ["︺", "〕"],
  ["︻", "【"],
  ["︼", "】"],
  ["︽", "《"],
  ["︾", "》"],
  ["︿", "〈"],
  ["﹀", "〉"],
  ["﹁", "「"],
  ["﹂", "」"],
  ["﹃", "『"],
  ["﹄", "』"],
  ["﹇", "［"],
  ["﹈", "］"],
]);

const VERTICAL_PRESENTATION_PATTERN = /[︐︑︒︓︔︕︖︗︘︙︰︱︲︵︶︷︸︹︺︻︼︽︾︿﹀﹁﹂﹃﹄﹇﹈]/gu;

/**
 * Some vertical PDFs expose glyph-oriented Unicode presentation forms as the
 * source text. Preserve that exact text in FileShapeDocument, but replace only
 * those presentation forms at EPUB display/serialization boundaries.
 *
 * Deliberately do not run NFKC over arbitrary source text: that would also
 * rewrite unrelated compatibility characters such as halfwidth kana.
 */
export function normalizeEpubPresentationText(value: string): string {
  return value.replace(VERTICAL_PRESENTATION_PATTERN, (character) =>
    VERTICAL_PRESENTATION_PUNCTUATION.get(character) ?? character);
}

/** Backward-compatible name used by EPUB3 navigation and legacy NCX. */
export function normalizeEpubNavigationText(value: string): string {
  return normalizeEpubPresentationText(value);
}
