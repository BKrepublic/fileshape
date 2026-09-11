import { OPS, normalizeUnicode } from "pdfjs-dist/legacy/build/pdf.mjs";
import { itemDisplayGeometry, multiply } from "../src/display-geometry.js";
import { bindGlyphSources, extractOperatorGlyphs } from "../src/pdfjs-glyph-adapter.js";
import { fullTextRef } from "../src/source-text.js";
import type { InspectPage, InspectTextItem } from "../src/pdf-inspector.js";

export type Run = { chars: string[]; advances: number[]; x: number; y: number; size: number; vertical?: boolean };
export function viewport(rotation = 0, scale = 1): number[] {
  const matrices: Record<number, number[]> = {
    0: [1, 0, 0, -1, 0, 800], 90: [0, 1, 1, 0, 0, 0],
    180: [-1, 0, 0, 1, 600, 0], 270: [0, -1, -1, 0, 800, 600],
  };
  return multiply([scale, 0, 0, scale, 17, 23], matrices[rotation]!);
}
export function glyphPage(runs: Run[], rotation = 0, scale = 1): InspectPage {
  const fnArray: number[] = [], argsArray: any[] = [], textItems: InspectTextItem[] = [];
  const v = viewport(rotation, scale);
  const fonts = new Map<string, { vertical: boolean; fontMatrix: number[] }>();
  for (const [index, run] of runs.entries()) {
    const vertical = run.vertical ?? true, id = `resource-${index}`;
    fonts.set(id, { vertical, fontMatrix: [0.001, 0, 0, 0.001, 0, 0] });
    fnArray.push(OPS.beginText, OPS.setFont, OPS.setTextMatrix, OPS.showText, OPS.endText);
    argsArray.push([], [id, run.size], [[1, 0, 0, 1, run.x, 800 - run.y]], [run.chars.map((unicode, i) => ({
      unicode, width: run.advances[i]! / run.size * 1000,
      ...(vertical ? { vmetric: [-run.advances[i]! / run.size * 1000, 500, 880] } : {}),
    }))], []);
    const text = run.chars.map((c) => normalizeUnicode(c)).join("");
    const extent = run.advances.reduce((a, b) => a + b, 0);
    const transform = [run.size, 0, 0, run.size, run.x, 800 - run.y];
    const displayTransform = multiply(v, transform);
    const width = vertical ? run.size : extent, height = vertical ? extent : run.size;
    textItems.push({ text, dir: vertical ? "ttb" : "ltr", fontName: id, width, height, transform,
      displayTransform, x: run.x, y: 800 - run.y, displayX: displayTransform[4]!, displayY: displayTransform[5]!,
      fontSize: run.size, hasEOL: false, source: fullTextRef(1, index, text),
      displayGeometry: itemDisplayGeometry(transform, v, width, height, vertical) });
  }
  const extracted = extractOperatorGlyphs(1, { fnArray, argsArray }, v, (id) => fonts.get(id)!);
  bindGlyphSources(textItems, extracted.glyphs, 1);
  return { page: 1, width: 600 * scale, height: 800 * scale, rotation, userUnit: 1, view: [0, 0, 600, 800],
    textItemCount: textItems.length, imagePaintOps: 0, textItems,
    glyphIssues: extracted.issues, operatorGlyphs: extracted.glyphs };
}
export function rubyRuns(vertical = true): Run[] {
  return [
    { chars: ["漢", "字"], advances: [14, 14], x: 200, y: 100, size: 14, vertical },
    { chars: ["か", "ん", "じ"], advances: [7, 7, 7], x: vertical ? 211 : 203.5,
      y: vertical ? 103.5 : 89, size: 7, vertical },
  ];
}
