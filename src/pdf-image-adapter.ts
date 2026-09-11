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

export type DisplayRect = { left: number; top: number; right: number; bottom: number };
export type ImageClipStatus = "none" | "exact-rect" | "complex-or-unknown";
export type ImageClipCoverage = "none" | "contains-image" | "crops-image" | "unknown";

export type ImagePaintEvidence = {
  page: number; operatorIndex: number; occurrenceIndex: number; operatorName: string; kind: ImagePaintKind;
  resourceId?: string; width?: number; height?: number; ctm: number[]; displayTransform: number[];
  displayBounds: DisplayRect; formDepth: number; clipObserved: boolean; clipStatus: ImageClipStatus;
  clipRect?: DisplayRect; clipCoverage: ImageClipCoverage; status: "supported-evidence" | "unsupported-schema"; reason?: string;
};

type OperatorList = { fnArray: number[]; argsArray: unknown[][] };
type GraphicsState = { ctm: number[]; formDepth: number; clipStatus: ImageClipStatus; clipRect?: DisplayRect };
type PendingClip = "nonzero" | "evenodd" | undefined;

const opNames = new Map<number, string>();
for (const [name, value] of Object.entries(OPS as Record<string, unknown>)) if (typeof value === "number") opNames.set(value, name);
function opCode(name: string): number | undefined { const value = (OPS as Record<string, unknown>)[name]; return typeof value === "number" ? value : undefined; }
function isFiniteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function matrix(value: unknown): number[] | undefined { return Array.isArray(value) && value.length === 6 && value.every(isFiniteNumber) ? [...value] : undefined; }
function dimensions(value: unknown): { width?: number; height?: number } {
  if (typeof value !== "object" || value === null) return {};
  const r = value as Record<string, unknown>;
  return { ...(isFiniteNumber(r.width) && r.width > 0 ? { width: r.width } : {}), ...(isFiniteNumber(r.height) && r.height > 0 ? { height: r.height } : {}) };
}
function numericArray(value: unknown): number[] | undefined {
  if (!(Array.isArray(value) || ArrayBuffer.isView(value as ArrayBufferView))) return undefined;
  const values = Array.from(value as ArrayLike<number>); return values.every(isFiniteNumber) ? values : undefined;
}
function imageOperator(name: string): boolean { return name.startsWith("paint") && (name.includes("Image") || name.includes("Mask")); }
function boundsForUnitSquare(m: number[]): DisplayRect {
  const ps = [point(m,0,0),point(m,1,0),point(m,1,1),point(m,0,1)], xs=ps.map(p=>p.x), ys=ps.map(p=>p.y);
  return { left:Math.min(...xs), top:Math.min(...ys), right:Math.max(...xs), bottom:Math.max(...ys) };
}
function intersectRects(a: DisplayRect,b: DisplayRect): DisplayRect { return {left:Math.max(a.left,b.left),top:Math.max(a.top,b.top),right:Math.min(a.right,b.right),bottom:Math.min(a.bottom,b.bottom)}; }
function rectContains(a: DisplayRect,b: DisplayRect,t=1e-7): boolean { return a.left<=b.left+t&&a.top<=b.top+t&&a.right>=b.right-t&&a.bottom>=b.bottom-t; }
function clipCoverage(s: GraphicsState,b: DisplayRect): ImageClipCoverage { return s.clipStatus==="none"?"none":s.clipStatus!=="exact-rect"||!s.clipRect?"unknown":rectContains(s.clipRect,b)?"contains-image":"crops-image"; }
function transformedRectangleBounds(path: number[],m:number[]): DisplayRect|undefined {
  if(path.length!==5||path[0]!==opCode("rectangle")) return undefined; const [,x,y,w,h]=path; if(![x,y,w,h].every(isFiniteNumber)) return undefined;
  const ps=[point(m,x!,y!),point(m,x!+w!,y!),point(m,x!+w!,y!+h!),point(m,x!,y!+h!)], t=1e-7;
  const H=(a:typeof ps[number],b:typeof ps[number])=>Math.abs(a.y-b.y)<=t,V=(a:typeof ps[number],b:typeof ps[number])=>Math.abs(a.x-b.x)<=t;
  if(!((H(ps[0]!,ps[1]!)&&V(ps[1]!,ps[2]!)&&H(ps[2]!,ps[3]!)&&V(ps[3]!,ps[0]!))||(V(ps[0]!,ps[1]!)&&H(ps[1]!,ps[2]!)&&V(ps[2]!,ps[3]!)&&H(ps[3]!,ps[0]!)))) return undefined;
  const xs=ps.map(p=>p.x),ys=ps.map(p=>p.y); return {left:Math.min(...xs),top:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)};
}
function cloneState(s:GraphicsState):GraphicsState{return{ctm:[...s.ctm],formDepth:s.formDepth,clipStatus:s.clipStatus,...(s.clipRect?{clipRect:{...s.clipRect}}:{})};}
function evidence(page:number,operatorIndex:number,occurrenceIndex:number,operatorName:string,kind:ImagePaintKind,state:GraphicsState,viewport:number[],details:Partial<ImagePaintEvidence>={}):ImagePaintEvidence{
  const displayTransform=multiply(viewport,state.ctm),displayBounds=boundsForUnitSquare(displayTransform);
  return{page,operatorIndex,occurrenceIndex,operatorName,kind,ctm:[...state.ctm],displayTransform,displayBounds,formDepth:state.formDepth,clipObserved:state.clipStatus!=="none",clipStatus:state.clipStatus,...(state.clipRect?{clipRect:{...state.clipRect}}:{}),clipCoverage:clipCoverage(state,displayBounds),status:"supported-evidence",...details};
}
function debugValue(value: unknown): unknown {
  if (ArrayBuffer.isView(value as ArrayBufferView)) return Array.from(value as ArrayLike<number>);
  if (Array.isArray(value)) return value.map(debugValue);
  if (typeof value === "object" && value !== null) return "[object]";
  return value;
}

export function extractImagePaintEvidence(page:number,operators:OperatorList,viewport:number[]):{paints:ImagePaintEvidence[];issues:string[]}{
  const paints:ImagePaintEvidence[]=[],issues:string[]=[]; if(version!=="6.3.289")return{paints,issues:[`unsupported-pdfjs-version:${version}`]};
  let state:GraphicsState={ctm:[...IDENTITY],formDepth:0,clipStatus:"none"}; const stack:GraphicsState[]=[]; let pendingClip:PendingClip;
  const save=()=>stack.push(cloneState(state)); const restore=()=>{const p=stack.pop();if(p)state=p;else issues.push("graphics-restore-underflow");};
  for(let operatorIndex=0;operatorIndex<operators.fnArray.length;operatorIndex+=1){const fn=operators.fnArray[operatorIndex]!,args=operators.argsArray[operatorIndex]??[],name=opNames.get(fn)??`op-${fn}`;
    if(fn===opCode("save")){save();continue;} if(fn===opCode("restore")){restore();continue;}
    if(fn===opCode("transform")){const t=matrix(args);if(t)state.ctm=multiply(state.ctm,t);else issues.push(`operator-${operatorIndex}:invalid-transform`);continue;}
    if(fn===opCode("paintFormXObjectBegin")){save();const t=matrix(args[0]);if(t)state.ctm=multiply(state.ctm,t);state.formDepth+=1;continue;}
    if(fn===opCode("paintFormXObjectEnd")){restore();continue;} if(fn===opCode("clip")){pendingClip="nonzero";continue;} if(fn===opCode("eoClip")){pendingClip="evenodd";continue;}
    if(fn===opCode("constructPath")){if(pendingClip!==undefined){console.error("FILESHAPE_CLIP_SCHEMA="+JSON.stringify(args.map(debugValue)));const nested=Array.isArray(args[1])?args[1][0]:undefined,path=numericArray(nested),rect=path?transformedRectangleBounds(path,multiply(viewport,state.ctm)):undefined;
      if(!rect){state={...state,clipStatus:"complex-or-unknown"};delete state.clipRect;}else if(state.clipStatus==="none")state={...state,clipStatus:"exact-rect",clipRect:rect};else if(state.clipStatus==="exact-rect"&&state.clipRect)state={...state,clipRect:intersectRects(state.clipRect,rect)};pendingClip=undefined;}continue;}
    if(!imageOperator(name))continue; if(pendingClip!==undefined){issues.push(`operator-${operatorIndex}:image-before-clip-path-finalized`);state={...state,clipStatus:"complex-or-unknown"};delete state.clipRect;pendingClip=undefined;}
    if(fn===opCode("paintImageXObject")){const resourceId=typeof args[0]==="string"?args[0]:undefined,width=isFiniteNumber(args[1])&&args[1]>0?args[1]:undefined,height=isFiniteNumber(args[2])&&args[2]>0?args[2]:undefined;paints.push(evidence(page,operatorIndex,0,name,"xobject",state,viewport,{...(resourceId?{resourceId}:{}),...(width?{width}:{}),...(height?{height}:{}),...(resourceId?{}:{status:"unsupported-schema",reason:"missing-resource-id"})}));continue;}
    if(fn===opCode("paintImageXObjectRepeat")){const resourceId=typeof args[0]==="string"?args[0]:undefined,scaleX=args[1],scaleY=args[2],positions=args[3];if(resourceId&&isFiniteNumber(scaleX)&&isFiniteNumber(scaleY)&&(Array.isArray(positions)||ArrayBuffer.isView(positions as ArrayBufferView))){const values=Array.from(positions as ArrayLike<number>);if(values.length%2===0&&values.every(isFiniteNumber)){for(let i=0;i<values.length;i+=2){const local={...cloneState(state),ctm:multiply(state.ctm,[scaleX,0,0,scaleY,values[i]!,values[i+1]!])};paints.push(evidence(page,operatorIndex,i/2,name,"xobject-repeat",local,viewport,{resourceId}));}continue;}}paints.push(evidence(page,operatorIndex,0,name,"xobject-repeat",state,viewport,{status:"unsupported-schema",reason:"invalid-repeat-schema",...(resourceId?{resourceId}:{})}));continue;}
    if(fn===opCode("paintInlineImageXObject")){paints.push(evidence(page,operatorIndex,0,name,"inline",state,viewport,dimensions(args[0])));continue;}
    if(fn===opCode("paintImageMaskXObject")){paints.push(evidence(page,operatorIndex,0,name,"image-mask",state,viewport,dimensions(args[0])));continue;}
    if(fn===opCode("paintSolidColorImageMask")){paints.push(evidence(page,operatorIndex,0,name,"solid-color-mask",state,viewport));continue;}
    const kind:ImagePaintKind=fn===opCode("paintInlineImageXObjectGroup")?"inline-group":fn===opCode("paintImageMaskXObjectRepeat")?"image-mask-repeat":fn===opCode("paintImageMaskXObjectGroup")?"image-mask-group":"unsupported-image-op";paints.push(evidence(page,operatorIndex,0,name,kind,state,viewport,{status:"unsupported-schema",reason:"group-or-unknown-image-schema"}));
  }
  if(pendingClip!==undefined)issues.push("clip-path-not-finalized");if(stack.length>0)issues.push(`graphics-stack-not-empty:${stack.length}`);return{paints,issues};
}
