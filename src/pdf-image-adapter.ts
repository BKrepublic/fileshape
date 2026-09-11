import { OPS, version } from "pdfjs-dist/legacy/build/pdf.mjs";
import { IDENTITY, multiply, point } from "./display-geometry.js";

export type ImagePaintKind =
  | "xobject"
  | "xobject-repeat"
  | "inline"
  | "inline-group"
  | "image-mask"
  | "image-mask-repeat"
  | "image-mask-group"
  | "solid-color-mask"
  | "unsupported-image-op";

export type DisplayRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type ImageClipStatus = "none" | "exact-rect" | "complex-or-unknown";
export type ImageClipCoverage = "none" | "contains-image" | "crops-image" | "unknown";

export type ImagePaintEvidence = {
  page: number;
  operatorIndex: number;
  occurrenceIndex: number;
  operatorName: string;
  kind: ImagePaintKind;
  resourceId?: string;
  width?: number;
  height?: number;
  /** Current PDF graphics transform at this paint occurrence. */
  ctm: number[];
  /** PageViewport transform multiplied by ctm. */
  displayTransform: number[];
  /** Axis-aligned bounds of the transformed image unit square. */
  displayBounds: DisplayRect;
  formDepth: number;
  /** True when an explicit PDF clip is active in this graphics scope. */
  clipObserved: boolean;
  /** Exact only for rectangular clips whose transformed edges remain axis-aligned. */
  clipStatus: ImageClipStatus;
  clipRect?: DisplayRect;
  /** Whether an exact rectangular clip changes the visible image region. */
  clipCoverage: ImageClipCoverage;
  status: "supported-evidence" | "unsupported-schema";
  reason?: string;
};

type OperatorList = { fnArray: number[]; argsArray: unknown[][] };
type GraphicsState = {
  ctm: number[];
  formDepth: number;
  clipStatus: ImageClipStatus;
  clipRect?: DisplayRect;
};
type PendingClip = "nonzero" | "evenodd" | undefined;

const opNames = new Map<number, string>();
for (const [name, value] of Object.entries(OPS as Record<string, unknown>)) {
  if (typeof value === "number") opNames.set(value, name);
}

function opCode(name: string): number | undefined {
  const value = (OPS as Record<string, unknown>)[name];
  return typeof value === "number" ? value : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function matrix(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length !== 6 || !value.every(isFiniteNumber)) return undefined;
  return [...value];
}

function dimensions(value: unknown): { width?: number; height?: number } {
  if (typeof value !== "object" || value === null) return {};
  const record = value as Record<string, unknown>;
  return {
    ...(isFiniteNumber(record.width) && record.width > 0 ? { width: record.width } : {}),
    ...(isFiniteNumber(record.height) && record.height > 0 ? { height: record.height } : {}),
  };
}

function numericArray(value: unknown): number[] | undefined {
  if (!(Array.isArray(value) || ArrayBuffer.isView(value as ArrayBufferView))) return undefined;
  const values = Array.from(value as ArrayLike<number>);
  return values.every(isFiniteNumber) ? values : undefined;
}

function imageOperator(name: string): boolean {
  return name.startsWith("paint") && (name.includes("Image") || name.includes("Mask"));
}

function boundsForUnitSquare(transform: number[]): DisplayRect {
  const points = [
    point(transform, 0, 0),
    point(transform, 1, 0),
    point(transform, 1, 1),
    point(transform, 0, 1),
  ];
  const xs = points.map((entry) => entry.x);
  const ys = points.map((entry) => entry.y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

function intersectRects(left: DisplayRect, right: DisplayRect): DisplayRect {
  return {
    left: Math.max(left.left, right.left),
    top: Math.max(left.top, right.top),
    right: Math.min(left.right, right.right),
    bottom: Math.min(left.bottom, right.bottom),
  };
}

function rectContains(container: DisplayRect, target: DisplayRect, tolerance = 1e-7): boolean {
  return container.left <= target.left + tolerance && container.top <= target.top + tolerance &&
    container.right >= target.right - tolerance && container.bottom >= target.bottom - tolerance;
}

function clipCoverage(state: GraphicsState, image: DisplayRect): ImageClipCoverage {
  if (state.clipStatus === "none") return "none";
  if (state.clipStatus !== "exact-rect" || !state.clipRect) return "unknown";
  return rectContains(state.clipRect, image) ? "contains-image" : "crops-image";
}

function transformedRectangleBounds(
  path: number[],
  displayMatrix: number[],
): DisplayRect | undefined {
  if (path.length !== 5 || path[0] !== opCode("rectangle")) return undefined;
  const [, x, y, width, height] = path;
  if (![x, y, width, height].every(isFiniteNumber)) return undefined;
  const p0 = point(displayMatrix, x!, y!);
  const p1 = point(displayMatrix, x! + width!, y!);
  const p2 = point(displayMatrix, x! + width!, y! + height!);
  const p3 = point(displayMatrix, x!, y! + height!);
  const tolerance = 1e-7;
  const horizontal = (a: typeof p0, b: typeof p0) => Math.abs(a.y - b.y) <= tolerance;
  const vertical = (a: typeof p0, b: typeof p0) => Math.abs(a.x - b.x) <= tolerance;
  const axisAligned =
    ((horizontal(p0, p1) && vertical(p1, p2) && horizontal(p2, p3) && vertical(p3, p0)) ||
     (vertical(p0, p1) && horizontal(p1, p2) && vertical(p2, p3) && horizontal(p3, p0)));
  if (!axisAligned) return undefined;
  const xs = [p0.x, p1.x, p2.x, p3.x];
  const ys = [p0.y, p1.y, p2.y, p3.y];
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

function cloneState(state: GraphicsState): GraphicsState {
  return {
    ctm: [...state.ctm],
    formDepth: state.formDepth,
    clipStatus: state.clipStatus,
    ...(state.clipRect === undefined ? {} : { clipRect: { ...state.clipRect } }),
  };
}

function evidence(
  page: number,
  operatorIndex: number,
  occurrenceIndex: number,
  operatorName: string,
  kind: ImagePaintKind,
  state: GraphicsState,
  viewport: number[],
  details: Partial<ImagePaintEvidence> = {},
): ImagePaintEvidence {
  const displayTransform = multiply(viewport, state.ctm);
  const displayBounds = boundsForUnitSquare(displayTransform);
  return {
    page,
    operatorIndex,
    occurrenceIndex,
    operatorName,
    kind,
    ctm: [...state.ctm],
    displayTransform,
    displayBounds,
    formDepth: state.formDepth,
    clipObserved: state.clipStatus !== "none",
    clipStatus: state.clipStatus,
    ...(state.clipRect === undefined ? {} : { clipRect: { ...state.clipRect } }),
    clipCoverage: clipCoverage(state, displayBounds),
    status: "supported-evidence",
    ...details,
  };
}

/**
 * Inventory-only replay of image paint operators from pinned PDF.js.
 * It records placement evidence, resource identity and conservative clipping evidence,
 * but does not claim colour fidelity or text/image reading order.
 */
export function extractImagePaintEvidence(
  page: number,
  operators: OperatorList,
  viewport: number[],
): { paints: ImagePaintEvidence[]; issues: string[] } {
  const paints: ImagePaintEvidence[] = [];
  const issues: string[] = [];
  if (version !== "6.3.289") {
    return { paints, issues: [`unsupported-pdfjs-version:${version}`] };
  }

  let state: GraphicsState = { ctm: [...IDENTITY], formDepth: 0, clipStatus: "none" };
  const stack: GraphicsState[] = [];
  let pendingClip: PendingClip;
  const save = () => stack.push(cloneState(state));
  const restore = () => {
    const previous = stack.pop();
    if (previous) state = previous;
    else issues.push("graphics-restore-underflow");
  };

  for (let operatorIndex = 0; operatorIndex < operators.fnArray.length; operatorIndex += 1) {
    const fn = operators.fnArray[operatorIndex]!;
    const args = operators.argsArray[operatorIndex] ?? [];
    const name = opNames.get(fn) ?? `op-${fn}`;

    if (fn === opCode("save")) { save(); continue; }
    if (fn === opCode("restore")) { restore(); continue; }
    if (fn === opCode("transform")) {
      const transform = matrix(args);
      if (transform) state.ctm = multiply(state.ctm, transform);
      else issues.push(`operator-${operatorIndex}:invalid-transform`);
      continue;
    }
    if (fn === opCode("paintFormXObjectBegin")) {
      save();
      const transform = matrix(args[0]);
      if (transform) state.ctm = multiply(state.ctm, transform);
      state.formDepth += 1;
      continue;
    }
    if (fn === opCode("paintFormXObjectEnd")) { restore(); continue; }
    if (fn === opCode("clip")) { pendingClip = "nonzero"; continue; }
    if (fn === opCode("eoClip")) { pendingClip = "evenodd"; continue; }
    if (fn === opCode("constructPath")) {
      if (pendingClip !== undefined) {
        const nested = Array.isArray(args[1]) ? args[1][0] : undefined;
        const path = numericArray(nested);
        const rect = path === undefined ? undefined : transformedRectangleBounds(path, multiply(viewport, state.ctm));
        if (rect === undefined) {
          state = { ...state, clipStatus: "complex-or-unknown" };
          delete state.clipRect;
        } else if (state.clipStatus === "none") {
          state = { ...state, clipStatus: "exact-rect", clipRect: rect };
        } else if (state.clipStatus === "exact-rect" && state.clipRect) {
          state = { ...state, clipRect: intersectRects(state.clipRect, rect) };
        }
        pendingClip = undefined;
      }
      continue;
    }

    if (!imageOperator(name)) continue;
    if (pendingClip !== undefined) {
      issues.push(`operator-${operatorIndex}:image-before-clip-path-finalized`);
      state = { ...state, clipStatus: "complex-or-unknown" };
      delete state.clipRect;
      pendingClip = undefined;
    }

    if (fn === opCode("paintImageXObject")) {
      const resourceId = typeof args[0] === "string" ? args[0] : undefined;
      const width = isFiniteNumber(args[1]) && args[1] > 0 ? args[1] : undefined;
      const height = isFiniteNumber(args[2]) && args[2] > 0 ? args[2] : undefined;
      paints.push(evidence(page, operatorIndex, 0, name, "xobject", state, viewport, {
        ...(resourceId === undefined ? {} : { resourceId }),
        ...(width === undefined ? {} : { width }),
        ...(height === undefined ? {} : { height }),
        ...(resourceId === undefined ? { status: "unsupported-schema", reason: "missing-resource-id" } : {}),
      }));
      continue;
    }

    if (fn === opCode("paintImageXObjectRepeat")) {
      const resourceId = typeof args[0] === "string" ? args[0] : undefined;
      const scaleX = args[1], scaleY = args[2], positions = args[3];
      if (resourceId && isFiniteNumber(scaleX) && isFiniteNumber(scaleY) &&
          (Array.isArray(positions) || ArrayBuffer.isView(positions as ArrayBufferView))) {
        const values = Array.from(positions as ArrayLike<number>);
        if (values.length % 2 === 0 && values.every(isFiniteNumber)) {
          for (let index = 0; index < values.length; index += 2) {
            const local: GraphicsState = {
              ...cloneState(state),
              ctm: multiply(state.ctm, [scaleX, 0, 0, scaleY, values[index]!, values[index + 1]!]),
            };
            paints.push(evidence(page, operatorIndex, index / 2, name, "xobject-repeat", local, viewport, { resourceId }));
          }
          continue;
        }
      }
      paints.push(evidence(page, operatorIndex, 0, name, "xobject-repeat", state, viewport, {
        status: "unsupported-schema",
        reason: "invalid-repeat-schema",
        ...(resourceId === undefined ? {} : { resourceId }),
      }));
      continue;
    }

    if (fn === opCode("paintInlineImageXObject")) {
      paints.push(evidence(page, operatorIndex, 0, name, "inline", state, viewport, dimensions(args[0])));
      continue;
    }

    if (fn === opCode("paintImageMaskXObject")) {
      paints.push(evidence(page, operatorIndex, 0, name, "image-mask", state, viewport, dimensions(args[0])));
      continue;
    }

    if (fn === opCode("paintSolidColorImageMask")) {
      paints.push(evidence(page, operatorIndex, 0, name, "solid-color-mask", state, viewport));
      continue;
    }

    const kind: ImagePaintKind = fn === opCode("paintInlineImageXObjectGroup") ? "inline-group"
      : fn === opCode("paintImageMaskXObjectRepeat") ? "image-mask-repeat"
      : fn === opCode("paintImageMaskXObjectGroup") ? "image-mask-group"
      : "unsupported-image-op";
    paints.push(evidence(page, operatorIndex, 0, name, kind, state, viewport, {
      status: "unsupported-schema",
      reason: "group-or-unknown-image-schema",
    }));
  }

  if (pendingClip !== undefined) issues.push("clip-path-not-finalized");
  if (stack.length > 0) issues.push(`graphics-stack-not-empty:${stack.length}`);
  return { paints, issues };
}
