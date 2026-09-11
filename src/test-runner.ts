import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const WIDTH = 68;
const RULE = "=".repeat(WIDTH);

function run(command: string, args: string[]): number {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });

  if (result.error) {
    console.error(result.error.stack ?? result.error.message);
    return 1;
  }

  return result.status ?? 1;
}

function printResult(passed: boolean, failedStage?: string): void {
  console.log("");
  console.log(RULE);
  if (passed) {
    console.log("FILESHAPE TEST RESULT: PASS");
    console.log("すべての型チェックと自動テストに合格しました。");
  } else {
    console.log("!!! FILESHAPE TEST RESULT: FAIL !!!");
    if (failedStage) console.log(`FAILED STAGE: ${failedStage}`);
    console.log("この枠と、その直前の failing tests / TypeScript error を貼ってください。");
  }
  console.log(RULE);
}

const typecheckStatus = run("npm", ["run", "typecheck"]);
if (typecheckStatus !== 0) {
  printResult(false, "typecheck");
  process.exit(typecheckStatus);
}

const testFiles = readdirSync("test", { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
  .map((entry) => path.join("test", entry.name))
  .sort();

if (testFiles.length === 0) {
  console.error("No test files found under test/*.test.ts");
  printResult(false, "test discovery");
  process.exit(1);
}

const testStatus = run("npx", ["tsx", "--test", ...testFiles]);
if (testStatus !== 0) {
  printResult(false, "unit tests");
  process.exit(testStatus);
}

printResult(true);
