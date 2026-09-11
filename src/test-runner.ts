import { spawnSync } from "node:child_process";
import process from "node:process";

const WIDTH = 68;
const RULE = "=".repeat(WIDTH);

function run(command: string, args: string[], options: { shell?: boolean } = {}): number {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: options.shell ?? false,
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

const testStatus = run("npx", ["tsx", "--test", "test/*.test.ts"], { shell: true });
if (testStatus !== 0) {
  printResult(false, "unit tests");
  process.exit(testStatus);
}

printResult(true);
