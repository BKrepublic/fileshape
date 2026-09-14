import { readFile } from "node:fs/promises";
import process from "node:process";

type NearMissEntry = {
  candidateId: string;
  page: number;
  status: string;
  reason: string;
  nearest: null | {
    gates: string[];
    fontRatio: number | null;
    crossDistanceRatio: number | null;
    inlineGapRatio: number | null;
  };
};

type DetailEntry = {
  candidateId: string;
  page: number;
  status: string;
  reason: string;
  stage: string;
  eligibleLineCount: number;
  selectedGlyphCount: number;
  choiceCount: number;
  continuityFailures: string[];
  nearestBoundaryCenterRatio: number | null;
  startOverhangRatio: number | null;
  endOverhangRatio: number | null;
};

type NestedReport<T> = { pdfId?: string; reports?: T[] };
type Corpus<T> = { reports?: NestedReport<T>[] };

function flatten<T>(corpus: Corpus<T>): Array<T & { pdfId: string }> {
  return (corpus.reports ?? []).flatMap((pdf) =>
    (pdf.reports ?? []).map((entry) => ({ ...entry, pdfId: pdf.pdfId ?? "unknown" })),
  );
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function gateKey(gates: string[] | undefined): string {
  return gates?.length ? [...gates].sort().join("+") : "none";
}

function bucket(value: number | null): string {
  if (value === null) return "none";
  if (value <= 0.0025) return "<=0.0025";
  if (value <= 0.01) return ">0.0025-0.01";
  if (value <= 0.05) return ">0.01-0.05";
  if (value <= 0.25) return ">0.05-0.25";
  if (value <= 0.5) return ">0.25-0.50";
  return ">0.50";
}

async function main(): Promise<void> {
  const [nearMissPath, detailPath] = process.argv.slice(2);
  if (!nearMissPath || !detailPath) {
    throw new Error("usage: npm run analyze:ruby-local-evidence -- NEAR_MISS_JSON UNRESOLVED_DETAIL_JSON");
  }

  const nearMiss = JSON.parse(await readFile(nearMissPath, "utf8")) as Corpus<NearMissEntry>;
  const detail = JSON.parse(await readFile(detailPath, "utf8")) as Corpus<DetailEntry>;
  const nearEntries = flatten(nearMiss);
  const detailById = new Map(flatten(detail).map((entry) => [entry.candidateId, entry]));

  const eligibleNoBase = nearEntries.filter((entry) =>
    entry.status === "unresolved" &&
    entry.reason === "no-base" &&
    gateKey(entry.nearest?.gates) === "eligible",
  );

  const stageCounts: Record<string, number> = {};
  const selectedGlyphCounts: Record<string, number> = {};
  const choiceCounts: Record<string, number> = {};
  const boundaryBuckets: Record<string, number> = {};
  const unmatched: string[] = [];
  const examples: Array<Record<string, unknown>> = [];

  for (const entry of eligibleNoBase) {
    const detailEntry = detailById.get(entry.candidateId);
    if (!detailEntry) {
      unmatched.push(entry.candidateId);
      continue;
    }
    increment(stageCounts, detailEntry.stage);
    increment(selectedGlyphCounts, String(detailEntry.selectedGlyphCount));
    increment(choiceCounts, String(detailEntry.choiceCount));
    increment(boundaryBuckets, bucket(detailEntry.nearestBoundaryCenterRatio));

    if (examples.length < 12) {
      examples.push({
        pdfId: entry.pdfId,
        page: entry.page,
        candidateId: entry.candidateId,
        stage: detailEntry.stage,
        eligibleLineCount: detailEntry.eligibleLineCount,
        selectedGlyphCount: detailEntry.selectedGlyphCount,
        choiceCount: detailEntry.choiceCount,
        nearest: entry.nearest,
        nearestBoundaryCenterRatio: detailEntry.nearestBoundaryCenterRatio,
        startOverhangRatio: detailEntry.startOverhangRatio,
        endOverhangRatio: detailEntry.endOverhangRatio,
      });
    }
  }

  process.stdout.write([
    `ELIGIBLE_NO_BASE=${eligibleNoBase.length}`,
    `MATCHED_DETAIL=${eligibleNoBase.length - unmatched.length}`,
    `UNMATCHED_DETAIL=${unmatched.length}`,
    `STAGE_COUNTS=${JSON.stringify(stageCounts)}`,
    `SELECTED_GLYPH_COUNTS=${JSON.stringify(selectedGlyphCounts)}`,
    `CHOICE_COUNTS=${JSON.stringify(choiceCounts)}`,
    `BOUNDARY_DISTANCE_BUCKETS=${JSON.stringify(boundaryBuckets)}`,
    `EXAMPLES=${JSON.stringify(examples)}`,
  ].join("\n") + "\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
