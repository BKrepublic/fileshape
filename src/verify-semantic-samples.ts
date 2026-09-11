import { existsSync } from "node:fs";
import process from "node:process";
import { inspectPdf } from "./pdf-inspector.js";
import { reconstructPhysicalLayout } from "./physical-layout.js";
import { buildSemanticBlocks } from "./semantic-blocks.js";
import { reconstructPageFlow } from "./text-flow.js";

const WIDTH = 72;
const RULE = "=".repeat(WIDTH);

const EXPECTED_N5221_PAGE4 = `１︓白いノートと女の子
くも一つない青空の下︑きみは学校へとつづくみちをあるいていた︒
でも︑あれあれ︑おかしいぞ︒いつもは車がはしっていたり︑ともだちがあるいているみちには︑きみ一人だけしかいないんだ︒耳をすましてみても︑なんの音もきこえない︒
さて︑きみならどうする︖
︵もんだい１︶
１．手を上げてたすけをよんでみる
↓︵ア︶へすすむ
２．いえにかえる
↓︵イ︶へすすむ
３．とりあえず学校へいく
↓︵ウ︶へすすむ`;

const EXPECTED_NVL_PAGE4 = `裁縫
ご存知の方もおられると思いますが自衛隊にとって裁縫は必ず出来なければなりません
というのも入隊までに最低限の裁縫技術がないと苦労します。
自衛隊の試験に合格したら
『何月何日に××駐屯地』
という事を指示されますので指定された駐屯地に向かいます
地連の方が送ってくれますので、ご安心を
作者が前期教育を受けたのは故郷鳥取県のすぐ近く岡山県にある陸上自衛隊Ｎ駐屯地
中隊配属してから知ったのですがＮ駐屯地
教育が厳しいと評判で
また
食事がおいしい事でも評判です。
着隊して隊舎にある受付で書類等を提出した後
自分の居室に案内されます。
この時はまだ歓迎ムードがあり玄関に
『祝着隊おめでとう！！』`;

type Check = {
  label: string;
  passed: boolean;
  detail?: string;
};

async function semanticText(path: string, pageNumber: number): Promise<string> {
  const inspection = await inspectPdf(path);
  const page = inspection.pages.find((candidate) => candidate.page === pageNumber);
  if (!page) throw new Error(`${path}: page ${pageNumber} does not exist`);

  const flow = reconstructPageFlow(page);
  const physical = reconstructPhysicalLayout(page, flow.orientation, flow.bodyFontSize);
  return buildSemanticBlocks(physical, flow.bodyFontSize).text;
}

function firstDifference(expected: string, actual: string): string {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const max = Math.max(expectedLines.length, actualLines.length);

  for (let index = 0; index < max; index += 1) {
    const left = expectedLines[index];
    const right = actualLines[index];
    if (left !== right) {
      return `line ${index + 1}\nEXPECTED: ${left ?? "<missing>"}\nACTUAL:   ${right ?? "<missing>"}`;
    }
  }

  return "text differs";
}

function printFinal(checks: Check[]): never | void {
  const failed = checks.filter((check) => !check.passed);

  console.log("");
  console.log(RULE);
  if (failed.length === 0) {
    console.log("FILESHAPE SEMANTIC SAMPLE RESULT: PASS");
    console.log(`Checks passed: ${checks.length}/${checks.length}`);
    console.log("この結果だけ確認すればOKです。ログの貼り付けは不要です。");
    console.log(RULE);
    return;
  }

  console.log("!!! FILESHAPE SEMANTIC SAMPLE RESULT: FAIL !!!");
  console.log(`Checks passed: ${checks.length - failed.length}/${checks.length}`);
  for (const check of failed) {
    console.log("");
    console.log(`FAIL: ${check.label}`);
    if (check.detail) console.log(check.detail);
  }
  console.log("");
  console.log("このFAIL枠を最初から最後までそのまま貼ってください。");
  console.log(RULE);
  process.exit(1);
}

async function main(): Promise<void> {
  const n5221 = "local-samples/N5221GF.pdf";
  const nvl = "local-samples/nvl5566.pdf";
  const nvlGothic = "local-samples/nvl5566-gothic.pdf";
  const checks: Check[] = [];

  for (const path of [n5221, nvl, nvlGothic]) {
    checks.push({
      label: `sample exists: ${path}`,
      passed: existsSync(path),
      detail: existsSync(path) ? undefined : `Missing file: ${path}`,
    });
  }

  if (checks.some((check) => !check.passed)) {
    printFinal(checks);
    return;
  }

  try {
    const n5221Text = await semanticText(n5221, 4);
    checks.push({
      label: "N5221GF page 4 semantic text matches reference",
      passed: n5221Text === EXPECTED_N5221_PAGE4,
      detail:
        n5221Text === EXPECTED_N5221_PAGE4
          ? undefined
          : firstDifference(EXPECTED_N5221_PAGE4, n5221Text),
    });

    const nvlText = await semanticText(nvl, 4);
    checks.push({
      label: "nvl5566 page 4 semantic text matches reference",
      passed: nvlText === EXPECTED_NVL_PAGE4,
      detail:
        nvlText === EXPECTED_NVL_PAGE4 ? undefined : firstDifference(EXPECTED_NVL_PAGE4, nvlText),
    });

    const gothicText = await semanticText(nvlGothic, 4);
    checks.push({
      label: "nvl5566 Gothic page 4 semantic text matches Mincho",
      passed: gothicText === nvlText,
      detail: gothicText === nvlText ? undefined : firstDifference(nvlText, gothicText),
    });
  } catch (error) {
    checks.push({
      label: "semantic verification completed without exception",
      passed: false,
      detail: error instanceof Error ? error.stack ?? error.message : String(error),
    });
  }

  printFinal(checks);
}

await main();
