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
 * EPUB navigation is normally rendered horizontally even when the source page
 * is vertical. Some PDFs expose glyph-oriented Unicode vertical presentation
 * forms (for example U+FE35/U+FE36) as text. Preserve the exact source text in
 * FileShapeDocument, but replace only those presentation forms when emitting
 * human-readable navigation labels.
 *
 * Deliberately do not run NFKC over arbitrary source text: that would also
 * rewrite unrelated compatibility characters such as halfwidth kana.
 */
export function normalizeEpubNavigationText(value: string): string {
  return value.replace(VERTICAL_PRESENTATION_PATTERN, (character) =>
    VERTICAL_PRESENTATION_PUNCTUATION.get(character) ?? character);
}
