export type Point = { x: number; y: number };
export type TextGeometry = {
  start: Point;
  end: Point;
  inline: Point;
  /** Positive side: above horizontal text, right of vertical text, after viewport rotation. */
  side: Point;
  inlineExtent: number;
  crossExtent: number;
  displayWidth: number;
  displayHeight: number;
};
export const IDENTITY = [1, 0, 0, 1, 0, 0];
export function multiply(a: number[], b: number[]): number[] {
  return [a[0]! * b[0]! + a[2]! * b[1]!, a[1]! * b[0]! + a[3]! * b[1]!,
    a[0]! * b[2]! + a[2]! * b[3]!, a[1]! * b[2]! + a[3]! * b[3]!,
    a[0]! * b[4]! + a[2]! * b[5]! + a[4]!, a[1]! * b[4]! + a[3]! * b[5]! + a[5]!];
}
export function point(m: number[], x: number, y: number): Point {
  return { x: m[0]! * x + m[2]! * y + m[4]!, y: m[1]! * x + m[3]! * y + m[5]! };
}
export function dot(a: Point, b: Point): number { return a.x * b.x + a.y * b.y; }
export function subtract(a: Point, b: Point): Point { return { x: a.x - b.x, y: a.y - b.y }; }
export function unit(p: Point): Point {
  const length = Math.hypot(p.x, p.y);
  return length > 0 ? { x: p.x / length, y: p.y / length } : { x: 0, y: 0 };
}
export function geometry(start: Point, end: Point, sideVector: Point): TextGeometry {
  const advance = subtract(end, start);
  return { start, end, inline: unit(advance), side: unit(sideVector),
    inlineExtent: Math.hypot(advance.x, advance.y), crossExtent: Math.hypot(sideVector.x, sideVector.y),
    displayWidth: Math.abs(advance.x) + Math.abs(sideVector.x),
    displayHeight: Math.abs(advance.y) + Math.abs(sideVector.y) };
}

/** TextItem dimensions are magnitudes before the PageViewport transform.
 * Reconstruct their oriented vectors first; never treat width/height as an AABB.
 */
export function itemDisplayGeometry(transform: number[], viewport: number[], width: number, height: number,
  vertical: boolean): TextGeometry {
  const origin = point(transform, 0, 0);
  const inline = unit(vertical ? { x: -transform[2]!, y: -transform[3]! } : { x: transform[0]!, y: transform[1]! });
  const side = unit(vertical ? { x: transform[0]!, y: transform[1]! } : { x: transform[2]!, y: transform[3]! });
  const length = Math.abs(vertical ? height : width), breadth = Math.abs(vertical ? width : height);
  const start = point(viewport, origin.x, origin.y);
  const end = point(viewport, origin.x + inline.x * length, origin.y + inline.y * length);
  const sideEnd = point(viewport, origin.x + side.x * breadth, origin.y + side.y * breadth);
  return geometry(start, end, subtract(sideEnd, start));
}
