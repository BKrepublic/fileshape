import { OPS, version } from "pdfjs-dist/legacy/build/pdf.mjs";
import { IDENTITY, multiply } from "./display-geometry.js";

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
  formDepth: number;
  /** A clipping operator is active in the current saved graphics scope. */
  clipObserved: boolean;
  status: "supported-evidence" | "unsupported-schema";
  reason?: string;
};

type OperatorList = { fnArray: number[]; argsArray: unknown[][] };
type GraphicsState = { ctm: number[]; clipObserved: boolean; formDepth: number };

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

function imageOperator(name: string): boolean {
  return name.startsWith("paint") && (name.includes("Image") || name.includes("Mask"));
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
  return {
    page,
    operatorIndex,
    occurrenceIndex,
    operatorName,
    kind,
    ctm: [...state.ctm],
    displayTransform: multiply(viewport, state.ctm),
    formDepth: state.formDepth,
    clipObserved: state.clipObserved,
    status: "supported-evidence",
    ...details,
  };
}

/**
 * Inventory-only replay of image paint operators from pinned PDF.js.
 * It records placement evidence and resource identity but deliberately does not
 * claim decoded image bytes, clipping geometry, colour fidelity or reading order.
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

  let state: GraphicsState = { ctm: [...IDENTITY], clipObserved: false, formDepth: 0 };
  const stack: GraphicsState[] = [];
  const save = () => stack.push({ ctm: [...state.ctm], clipObserved: state.clipObserved, formDepth: state.formDepth });
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
    if (fn === opCode("clip") || fn === opCode("eoClip")) {
      state.clipObserved = true;
      continue;
    }

    if (!imageOperator(name)) continue;

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
              ...state,
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

  if (stack.length > 0) issues.push(`graphics-stack-not-empty:${stack.length}`);
  return { paints, issues };
}
