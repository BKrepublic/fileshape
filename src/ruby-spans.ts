import type { InspectPage, InspectTextItem } from "./pdf-inspection-model.js";
import type { ExtractedGlyph } from "./pdfjs-glyph-adapter.js";
import { dot, subtract, type Point } from "./display-geometry.js";
import { fullTextRef, mergeSourceRanges, type SourceGlyphRef, type SourceTextRef } from "./source-text.js";
import { collectTextItemEvidence } from "./text-item-evidence.js";

export type RubySpan = {
  status: "exact" | "unresolved";
  reason: "unique-contiguous-span" | "missing-glyph-geometry" | "no-base" | "ambiguous-base" | "noncontiguous-base" | "conflicting-annotations";
  annotationSourceRanges: SourceTextRef[];
  baseSourceRanges: SourceTextRef[];
  annotationGlyphRefs: SourceGlyphRef[];
  baseGlyphRefs: SourceGlyphRef[];
  /** Retain alternatives without selecting the first. */
  alternatives: SourceTextRef[][];
};
type Entry = { item: InspectTextItem; index: number };
const projection = (glyph: ExtractedGlyph, axis: Point) => dot(glyph.geometry.start, axis);

/** Exact means exact source boundaries from measured advance cells, not a claim
 * that every geometrically adjacent small label is linguistically ruby.
 * All grouping/selection is geometric; source text remains untouched.
 */
export function associateRubySpans(page: InspectPage, bodyFontSize: number): RubySpan[] {
  if (!Number.isFinite(bodyFontSize) || bodyFontSize <= 0) return [];
  const visible = collectTextItemEvidence(page, bodyFontSize)
    .filter((entry) => entry.visible)
    .map(({ item, itemIndex, annotationSized, bodySized }) => ({
      item,
      index: itemIndex,
      annotationSized,
      bodySized,
    }));
  const small = visible.filter(({ item, annotationSized }) => item.fontSize > 0 && annotationSized);
  const body = visible.filter(({ bodySized }) => bodySized);
  const groups: Entry[][] = [];
  // Form connected components of adjacent annotation runs; input order is not evidence.
  const pending = new Set(small);
  for (const seed of small) {
    if (!pending.delete(seed)) continue;
    const group = [seed];
    for (let i = 0; i < group.length; i++) for (const candidate of pending) {
      const a = group[i]!.item.displayGeometry, b = candidate.item.displayGeometry;
      if (!a || !b || dot(a.inline, b.inline) < 0.999 || dot(a.side, b.side) < 0.999) continue;
      const size = Math.max(a.crossExtent, b.crossExtent);
      if (size <= 0 || Math.min(a.crossExtent, b.crossExtent) / size < 0.9) continue;
      const delta = subtract(b.start, a.start), gap = dot(delta, a.inline);
      if (Math.abs(dot(delta, a.side)) > size * 0.15) continue;
      if (Math.min(Math.abs(gap - a.inlineExtent), Math.abs(gap + b.inlineExtent)) > size * 0.35) continue;
      pending.delete(candidate); group.push(candidate);
    }
    const axis = seed.item.displayGeometry?.inline;
    if (axis) group.sort((a, b) => dot(a.item.displayGeometry!.start, axis) - dot(b.item.displayGeometry!.start, axis));
    groups.push(group);
  }
  const results = groups.map((group): RubySpan => {
    const annotations = group.flatMap(({ item }) => item.glyphs ?? []);
    const result: RubySpan = { status: "unresolved", reason: "missing-glyph-geometry",
      annotationSourceRanges: group.map(({ item, index }) => ({ ...(item.source ?? fullTextRef(page.page, index, item.text)) })),
      baseSourceRanges: [], annotationGlyphRefs: annotations.map((g) => ({ ...g.source })), baseGlyphRefs: [], alternatives: [] };
    if (group.some(({ item }) => item.glyphMapping !== "exact" || !item.glyphs?.length || !item.displayGeometry)) return result;
    const a = group[0]!.item.displayGeometry!;
    // Reject skewed/non-orthogonal axes instead of pretending AABB projection is exact.
    if (Math.abs(dot(a.inline, a.side)) > 0.01) return result;
    const start = Math.min(...annotations.map((g) => projection(g, a.inline)));
    const end = Math.max(...annotations.map((g) => dot(g.geometry.end, a.inline)));
    const lines: Array<{ cross: number; size: number; entries: Entry[] }> = [];
    for (const entry of body) {
      const b = entry.item.displayGeometry;
      if (!b || dot(b.inline, a.inline) < 0.999 || dot(b.side, a.side) < 0.999 || Math.abs(dot(b.inline, b.side)) > 0.01) continue;
      const ratio = a.crossExtent / b.crossExtent;
      if (ratio < 0.35 || ratio >= 0.75) continue;
      const cross = dot(b.start, a.side), distance = dot(a.start, a.side) - cross;
      if (distance < b.crossExtent * 0.45 || distance > b.crossExtent * 1.35) continue;
      if (dot(b.end, a.inline) < start - b.crossExtent * 0.5 || dot(b.start, a.inline) > end + b.crossExtent * 0.5) continue;
      const line = lines.find((l) => Math.abs(l.cross - cross) < b.crossExtent * 0.15);
      if (line) line.entries.push(entry); else lines.push({ cross, size: b.crossExtent, entries: [entry] });
    }
    const choices: ExtractedGlyph[][] = [];
    let uncertain = false, noncontiguous = false;
    for (const line of lines) {
      if (line.entries.some(({ item }) => item.glyphMapping !== "exact" || !item.glyphs?.length)) { uncertain = true; continue; }
      const glyphs = line.entries.flatMap(({ item }) => item.glyphs!).sort((l, r) => projection(l, a.inline) - projection(r, a.inline));
      const selected = glyphs.filter((g) => {
        const lo = projection(g, a.inline), hi = dot(g.geometry.end, a.inline);
        const overlap = Math.min(hi, end) - Math.max(lo, start);
        const center = (lo + hi) / 2, tolerance = line.size * 0.01;
        if (overlap > tolerance && Math.min(Math.abs(center - start), Math.abs(center - end)) <= tolerance) uncertain = true;
        return hi > lo && ((center > start + tolerance && center < end - tolerance) || overlap / (hi - lo) > 0.5 + 1e-6);
      });
      if (!selected.length) continue;
      const lo = projection(selected[0]!, a.inline), hi = dot(selected.at(-1)!.geometry.end, a.inline);
      if (start < lo - line.size * 0.5 || end > hi + line.size * 0.5) { uncertain = true; continue; }
      let continuous = true;
      for (let i = 1; i < selected.length; i++) {
        const previous = selected[i - 1]!, current = selected[i]!;
        const gap = projection(current, a.inline) - dot(previous.geometry.end, a.inline);
        const left = previous.sourceRanges[0], right = current.sourceRanges[0];
        if (gap < -line.size * 0.05) { uncertain = true; continuous = false; }
        if (gap > line.size * 0.5 || !left || !right ||
          (left.itemIndex === right.itemIndex && left.charEnd !== right.charStart)) continuous = false;
      }
      if (!continuous) { noncontiguous = true; continue; }
      choices.push(selected);
    }
    result.alternatives = choices.map((choice) => mergeSourceRanges(choice.flatMap((g) => g.sourceRanges)));
    if (choices.length !== 1 || uncertain || noncontiguous) {
      result.reason = uncertain || choices.length > 1 ? "ambiguous-base" : noncontiguous ? "noncontiguous-base" : "no-base";
      return result;
    }
    result.status = "exact"; result.reason = "unique-contiguous-span";
    result.baseSourceRanges = result.alternatives[0]!;
    result.baseGlyphRefs = choices[0]!.map((g) => ({ ...g.source }));
    return result;
  });
  // Competing annotation groups must not both own the same base glyph.
  const owners = new Map<string, RubySpan[]>();
  for (const result of results) if (result.status === "exact") for (const ref of result.baseGlyphRefs) {
    const key = `${ref.page}/${ref.operatorIndex}/${ref.glyphIndex}`;
    const list = owners.get(key) ?? []; list.push(result); owners.set(key, list);
  }
  for (const list of owners.values()) if (list.length > 1) for (const result of list) {
    result.status = "unresolved"; result.reason = "conflicting-annotations";
    result.baseSourceRanges = []; result.baseGlyphRefs = [];
  }
  return results;
}
