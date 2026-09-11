import { OPS, normalizeUnicode, version } from "pdfjs-dist/legacy/build/pdf.mjs";
import { geometry, IDENTITY, multiply, point, subtract, dot } from "./display-geometry.js";
import type { TextGeometry } from "./display-geometry.js";
import type { SourceGlyphRef, SourceTextRef } from "./source-text.js";
import type { InspectTextItem } from "./pdf-inspector.js";

/** Internal PDF.js operator glyph/font schema is isolated here and version-pinned.
 * Metrics describe advance cells, not ink outlines. Never divide run width.
 */
export type ExtractedGlyph = {
  source: SourceGlyphRef;
  unicode: string;
  text: string;
  geometry: TextGeometry;
  sourceRanges: SourceTextRef[];
};
type Font = { vertical?: boolean; fontMatrix?: number[]; defaultVMetrics?: number[];
  isType3Font?: boolean; isInvalidPDFjsFont?: boolean };
type OperatorGlyph = { unicode: string; width: number; vmetric?: number[]; isSpace?: boolean; accent?: unknown };
type OperatorList = { fnArray: number[]; argsArray: any[] };
type State = { ctm: number[]; matrix: number[]; x: number; y: number; lineX: number; lineY: number;
  size: number; font: Font | undefined; charSpacing: number; wordSpacing: number; hscale: number; rise: number; leading: number };

export function extractOperatorGlyphs(page: number, operators: OperatorList, viewport: number[],
  getFont: (id: string) => Font): { glyphs: ExtractedGlyph[]; issues: string[] } {
  const glyphs: ExtractedGlyph[] = [], issues: string[] = [];
  if (version !== "6.3.289") return { glyphs, issues: ["unsupported-pdfjs-version"] };
  let s: State = { ctm: [...IDENTITY], matrix: [...IDENTITY], x: 0, y: 0, lineX: 0, lineY: 0,
    size: 0, font: undefined, charSpacing: 0, wordSpacing: 0, hscale: 1, rise: 0, leading: 0 };
  const stack: State[] = [];
  const move = (x: number, y: number) => { s.x = s.lineX += x; s.y = s.lineY += y; };
  const setFont = (id: string, size: number) => { s.font = getFont(id); s.size = size; };
  try {
    for (let op = 0; op < operators.fnArray.length; op++) {
      const fn = operators.fnArray[op], a = operators.argsArray[op] ?? [];
      switch (fn) {
        case OPS.save: stack.push({ ...s, ctm: [...s.ctm], matrix: [...s.matrix] }); break;
        case OPS.restore: s = stack.pop() ?? s; break;
        case OPS.transform: s.ctm = multiply(s.ctm, a); break;
        case OPS.paintFormXObjectBegin:
          stack.push({ ...s, ctm: [...s.ctm], matrix: [...s.matrix] });
          if (a[0]) s.ctm = multiply(s.ctm, a[0]);
          break;
        case OPS.paintFormXObjectEnd: s = stack.pop() ?? s; break;
        case OPS.beginText: s.matrix = [...IDENTITY]; s.x = s.y = s.lineX = s.lineY = 0; break;
        case OPS.setTextMatrix: s.matrix = [...a[0]]; s.x = s.y = s.lineX = s.lineY = 0; break;
        case OPS.moveText: move(a[0], a[1]); break;
        case OPS.setLeadingMoveText: s.leading = a[1]; move(a[0], a[1]); break;
        case OPS.nextLine: move(0, s.leading); break;
        case OPS.setLeading: s.leading = -a[0]; break;
        case OPS.setFont: setFont(a[0], a[1]); break;
        case OPS.setGState:
          for (const [key, value] of a[0]) if (key === "Font") setFont(value[0], value[1]);
          break;
        case OPS.setCharSpacing: s.charSpacing = a[0]; break;
        case OPS.setWordSpacing: s.wordSpacing = a[0]; break;
        case OPS.setHScale: s.hscale = a[0] / 100; break;
        case OPS.setTextRise: s.rise = a[0]; break;
        case OPS.showText: {
          if (s.size === 0) break;
          const f = s.font, fm = f?.fontMatrix ?? [0.001, 0, 0, 0.001, 0, 0];
          if (!f || f.isType3Font || f.isInvalidPDFjsFont || s.size < 0 ||
            fm[1] !== 0 || fm[2] !== 0 || fm[0] !== fm[3]) throw new Error("unsupported-font-metrics");
          const m = multiply(viewport, multiply(s.ctm, s.matrix));
          const vertical = f.vertical === true;
          const entries: Array<OperatorGlyph | number> = a[0];
          for (let g = 0; g < entries.length; g++) {
            const glyph = entries[g]!;
            if (typeof glyph === "number") {
              if (vertical) s.y -= glyph * s.size / 1000;
              else s.x -= glyph * s.size / 1000 * s.hscale;
              continue;
            }
            if (typeof glyph.unicode !== "string" || !Number.isFinite(glyph.width) || glyph.accent) {
              throw new Error("unsupported-glyph-schema");
            }
            const width = vertical ? (glyph.vmetric ?? f.defaultVMetrics)?.[0] ?? -glyph.width : glyph.width;
            const advance = width * fm[0]! * s.size;
            const start = point(m, s.x, s.y + s.rise);
            const end = point(m, s.x + (vertical ? 0 : advance * s.hscale), s.y + s.rise + (vertical ? advance : 0));
            const side = subtract(point(m, s.x + (vertical ? s.size * s.hscale : 0),
              s.y + s.rise + (vertical ? 0 : s.size)), start);
            glyphs.push({ source: { page, operatorIndex: op, glyphIndex: g }, unicode: glyph.unicode,
              text: normalizeUnicode(glyph.unicode).replace(/\s/gu, " "), geometry: geometry(start, end, side), sourceRanges: [] });
            const spacing = s.charSpacing + (glyph.isSpace ? s.wordSpacing : 0);
            if (vertical) s.y += advance - spacing;
            else s.x += (advance + spacing) * s.hscale;
          }
          break;
        }
        // These operators are normalized to showText by the pinned worker.
        case OPS.showSpacedText: case OPS.nextLineShowText: case OPS.nextLineSetSpacingShowText:
        case OPS.beginAnnotation: case OPS.beginGroup:
          throw new Error("unsupported-text-or-container-operator");
      }
    }
  } catch (error) {
    // Never expose partially replayed positions after an unsupported state change.
    return { glyphs: [], issues: [error instanceof Error ? error.message : "glyph-replay-failed"] };
  }
  return { glyphs, issues };
}

/** Bind operator glyphs to extracted runs only when Unicode AND geometry agree.
 * Ligatures remain indivisible. Bidi/normalization mismatches stay unmapped.
 * Generated whitespace remains in the source item even without a glyph ref.
 */
export function bindGlyphSources(items: InspectTextItem[], glyphs: ExtractedGlyph[], page: number): void {
  const byFirst = new Map<string, ExtractedGlyph[]>();
  for (const glyph of glyphs) {
    const first = glyph.text[0];
    if (first) { const bucket = byFirst.get(first) ?? []; bucket.push(glyph); byFirst.set(first, bucket); }
  }
  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex]!, run = item.displayGeometry;
    if (!run || !item.text.trim()) continue;
    const tolerance = Math.max(0.01, run.crossExtent * 0.02);
    const firstOffset = item.text.length - item.text.trimStart().length;
    const starts = (byFirst.get(item.text[firstOffset]!) ?? []).filter((g) =>
      Math.hypot(g.geometry.start.x - run.start.x, g.geometry.start.y - run.start.y) <= tolerance);
    const matches: Array<Array<{ glyph: ExtractedGlyph; start: number; end: number }>> = [];
    for (const first of starts) {
      const index = glyphs.indexOf(first);
      let offset = firstOffset;
      const match: Array<{ glyph: ExtractedGlyph; start: number; end: number }> = [];
      for (let at = index; at < glyphs.length && offset < item.text.length; at++) {
        const glyph = glyphs[at]!, g = glyph.geometry;
        const delta = subtract(g.start, run.start), along = dot(delta, run.inline);
        if (Math.abs(dot(delta, run.side)) > tolerance || along < -tolerance ||
          along > run.inlineExtent + tolerance || dot(g.inline, run.inline) < 0.99) break;
        // PDF.js can synthesize spaces from TJ gaps. Do not assign those to a glyph.
        if (glyph.text !== " ") while (item.text[offset] === " ") offset++;
        if (!item.text.startsWith(glyph.text, offset) || !glyph.text) break;
        match.push({ glyph, start: offset, end: offset + glyph.text.length });
        offset += glyph.text.length;
      }
      const last = match.at(-1)?.glyph.geometry.end;
      if ((offset === item.text.trimEnd().length || offset === item.text.length) && last &&
        Math.hypot(last.x - run.end.x, last.y - run.end.y) <= tolerance) matches.push(match);
    }
    if (matches.length !== 1) { item.glyphMapping = matches.length ? "ambiguous" : "unmapped"; continue; }
    const match = matches[0]!;
    item.glyphMapping = "exact";
    item.glyphs = match.map(({ glyph, start, end }) => {
      glyph.sourceRanges.push({ page, itemIndex, charStart: start, charEnd: end });
      return glyph;
    });
  }
  // Duplicate/overprinted source runs must not be silently assigned to one item.
  for (const item of items) if (item.glyphs?.some((g) => g.sourceRanges.length !== 1)) {
    item.glyphMapping = "ambiguous";
    item.glyphs = [];
  }
}
