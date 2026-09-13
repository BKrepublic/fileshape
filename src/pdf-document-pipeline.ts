import {
  assertDocumentModel,
  buildFileShapeDocument,
  type FileShapeDocument,
} from "./document-model.js";
import { resolveDocumentOrientations } from "./document-orientation.js";
import type { InspectResult } from "./pdf-inspection-model.js";
import { reconstructPhysicalLayout } from "./physical-layout.js";
import { associateRubySpans, type RubySpan } from "./ruby-spans.js";
import { buildSemanticBlocks } from "./semantic-blocks.js";
import { reconstructPageFlow, type PageFlowResult } from "./text-flow.js";

export type PdfDocumentPipelinePage = {
  page: number;
  flow: PageFlowResult;
  orientation: "vertical" | "horizontal";
};

export type PdfDocumentPipelineResult = {
  document: FileShapeDocument;
  pages: PdfDocumentPipelinePage[];
};

export type PdfDocumentPipelineControl = {
  /** Reuse page-local flow analysis already computed during inspection. */
  precomputedFlows?: ReadonlyMap<number, PageFlowResult>;
  /** Called after each source page has been reduced to document structure. */
  onPageBuilt?: (completedPages: number, totalPages: number) => void;
};

function hasVisibleText(inspection: InspectResult, pageNumber: number): boolean {
  const page = inspection.pages.find((entry) => entry.page === pageNumber);
  return page?.textItems.some((item) => item.text.trim().length > 0) ?? false;
}

function pageFlow(
  page: InspectResult["pages"][number],
  precomputedFlows: ReadonlyMap<number, PageFlowResult> | undefined,
): PageFlowResult {
  if (precomputedFlows === undefined) return reconstructPageFlow(page);
  const flow = precomputedFlows.get(page.page);
  if (flow === undefined) throw new Error(`missing precomputed page flow for page ${page.page}`);
  return flow;
}

/**
 * Assemble the already-tested parser stages into one format-independent document pipeline.
 * This function does not infer from filenames, metadata, websites, fonts, or text content.
 */
export function buildDocumentFromInspection(
  inspection: InspectResult,
  documentId: string,
  precomputedRubySpans?: ReadonlyMap<number, RubySpan[]>,
  control?: PdfDocumentPipelineControl,
): PdfDocumentPipelineResult {
  const flows = inspection.pages.map((page) => ({
    page,
    flow: pageFlow(page, control?.precomputedFlows),
  }));

  const orientations = resolveDocumentOrientations(
    flows.map(({ page, flow }) => ({ page: page.page, orientation: flow.orientation })),
  );
  const resolvedByPage = new Map(orientations.map((entry) => [entry.page, entry]));

  const pipelinePages: PdfDocumentPipelinePage[] = [];
  const documentPages = flows.map(({ page, flow }, index) => {
    const resolved = resolvedByPage.get(page.page);
    const orientation = resolved?.resolved ?? flow.orientation;
    const layout = reconstructPhysicalLayout(page, orientation, flow.bodyFontSize);
    const rubySpans = precomputedRubySpans === undefined
      ? associateRubySpans(page, flow.bodyFontSize)
      : precomputedRubySpans.get(page.page);

    if (rubySpans === undefined) {
      throw new Error(`missing precomputed ruby spans for page ${page.page}`);
    }

    let documentPage;
    if (orientation === "unknown") {
      if (hasVisibleText(inspection, page.page)) {
        throw new Error(`page ${page.page} has visible text but unresolved writing orientation`);
      }
      documentPage = {
        page: page.page,
        orientation,
        layout,
        semantic: buildSemanticBlocks(layout, flow.bodyFontSize),
        rubySpans,
      };
    } else {
      const semantic = buildSemanticBlocks(layout, flow.bodyFontSize);
      if (flow.primaryItemCount > 0 && semantic.blocks.length === 0) {
        throw new Error(`page ${page.page} has primary text but no semantic output`);
      }

      pipelinePages.push({ page: page.page, flow, orientation });
      documentPage = {
        page: page.page,
        orientation,
        layout,
        semantic,
        rubySpans,
      };
    }

    control?.onPageBuilt?.(index + 1, flows.length);
    return documentPage;
  });

  const document = buildFileShapeDocument({ documentId, inspection, pages: documentPages });
  assertDocumentModel(document);
  return { document, pages: pipelinePages };
}
