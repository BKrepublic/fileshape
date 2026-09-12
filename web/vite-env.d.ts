/// <reference types="vite/client" />

declare module "pdfjs-dist/build/pdf.worker.mjs?url" {
  const workerUrl: string;
  export default workerUrl;
}

declare module "pdfjs-dist/build/pdf.mjs" {
  export type PDFDocumentLoadingTask = {
    promise: Promise<PDFDocumentProxy>;
    destroy(): Promise<void>;
  };
  export type PDFDocumentProxy = {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
    destroy(): Promise<void>;
  };
  export type PDFPageProxy = {
    getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
  };
  export class PDFWorker {
    constructor(options?: { name?: string; port?: Worker });
    readonly promise: Promise<void>;
    readonly port: Worker;
    destroy(): void;
  }
  export const GlobalWorkerOptions: {
    workerSrc: string;
    workerPort: Worker | null;
  };
  export function getDocument(options: {
    data: Uint8Array;
    worker?: PDFWorker;
    useSystemFonts: boolean;
    disableFontFace: boolean;
  }): PDFDocumentLoadingTask;
}
