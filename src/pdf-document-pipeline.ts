import {
  assertDocumentModel,
  buildFileShapeDocument,
  type FileShapeDocument,
} from "./document-model.js";
import { resolveDocumentOrientations } from "./document-orientation.js";
import type { InspectResult } from "./pdf-inspector.js";
import { reconstructPhysicalLayout } from "./physical-layout.js";
import { associateRubySpans } from "./ruby-spans.js";
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

function hasVisibleText(inspection: InspectResult, pageNumber: number): boolean {
  const page = inspection.pages.find((entry) => entry.page === pageNumber);
  return page?.textItems.some((item) => item.text.trim().length > 0) ?? false;
}

/**
 * Assemble the already-tested parser stages into one format-independent document pipeline.
 * This function does not infer from filenames, metadata, websites, fonts, or text content.
 */
export function buildDocumentFromInspection(
  inspection: InspectResult,
  documentId: string,
): PdfDocumentPipelineResult {
  const flows = inspection.pages.map((page) => ({
    page,
    flow: reconstructPageFlow(page),
  }));

  const orientations = resolveDocumentOrientations(
    flows.map(({ page, flow }) => ({ page: page.page, orientation: flow.orientation })),
  );
  const resolvedByPage = new Map(orientations.map((entry) => [entry.page, entry]));

  const pipelinePages: PdfDocumentPipelinePage[] = [];
  const documentPages = flows.map(({ page, flow }) => {
    const resolved = resolvedByPage.get(page.page);
    const orientation = resolved?.resolved ?? flow.orientation;
    const layout = reconstructPhysicalLayout(page, orientation, flow.bodyFontSize);

    if (orientation === "unknown") {
      if (hasVisibleText(inspection, page.page)) {
        throw new Error(`page ${page.page} has visible text but unresolved writing orientation`);
      }
      return {
        page: page.page,
        orientation,
        layout,
        semantic: buildSemanticBlocks(layout, flow.bodyFontSize),
        rubySpans: associateRubySpans(page, flow.bodyFontSize),
      };
    }

    const semantic = buildSemanticBlocks(layout, flow.bodyFontSize);
    if (flow.primaryItemCount > 0 && semantic.blocks.length === 0) {
      throw new Error(`page ${page.page} has primary text but no semantic output`);
    }

    pipelinePages.push({ page: page.page, flow, orientation });
    return {
      page: page.page,
      orientation,
      layout,
      semantic,
      rubySpans: associateRubySpans(page, flow.bodyFontSize),
    };
  });

  const document = buildFileShapeDocument({ documentId, inspection, pages: documentPages });
  assertDocumentModel(document);
  return { document, pages: pipelinePages };
}
