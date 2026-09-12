# Codex handoff — 2026-09-12

この文書は FileShape の次セッションを GitHub だけから再開するための入口です。正本ロードマップは `docs/remaining-work/README.md`、現状は `docs/continuation-status.md`、Stage 19 hardening は `docs/stage19-hardening.md` を参照してください。

## 開始点

**`main` から開始しないでください。** Stage 18 / 19 と hardening は `codex-next-20260912` にあります。

```text
branch: codex-next-20260912
required Stage 19 implementation ancestor: 254b001aa6903ab18056b271d0b31d8c5154d2ca
required Stage 19 hardening ancestor: f92ba16d7ccbcb48f6f89a6f7bc528a5fe3c106c
```

作業時点の最新 `codex-next-20260912` HEAD を開始点にし、上記2 commit が ancestor であることを確認してください。handoff/docs更新でbranch HEADは先へ進むので、固定SHAへresetしてはいけません。

```sh
git switch codex-next-20260912
git pull --ff-only
git rev-parse HEAD
git merge-base --is-ancestor 254b001aa6903ab18056b271d0b31d8c5154d2ca HEAD
git merge-base --is-ancestor f92ba16d7ccbcb48f6f89a6f7bc528a5fe3c106c HEAD
```

次に `docs/stage19-review.md`、`docs/stage19-hardening.md`、`docs/continuation-status.md`、`docs/remaining-work/README.md` を確認します。

## 現在地

Stage 19 production image integration は実装済みです。独立レビューで見つかった R1〜R7 に対し、hardening implementation も入っています。

- R1: non-uniform scale を fail closed。
- R2: image paint 時点の `setGState` compositing を検査し、非default alpha / blend / soft mask / transfer / transparency group を fail closed。
- R3: layered image overlap を fail closed。
- R4: transform→bounds と clip cross-field invariant をmodelで再検証。
- R5: PNG構築前のper-resource production preflightを追加。
- R6: full EPUB verifierに XHTML / OPF / ZIP image accountingを追加。
- R7: interpolation=true はEPUB renderでfail closedし、image-model verifierが件数を集計する。

Remote CIは hardening implementation `f92ba16d7ccbcb48f6f89a6f7bc528a5fe3c106c` で成功しています。typecheck / unit tests / real EPUBCheck integrationはgreenです。private corpusはGitHub runnerにないため、9-PDF acceptanceだけが残っています。

### private corpus baseline

```text
9 PDFs / 5,141 pages
unresolved annotations: 6,387
outline entries: 250 in 6 PDFs / unresolved 0
image occurrences: 4
unique PNG content resource: 1
known images: 800x600 RGB24, exact-rect contains-image
marked-content occurrences: 0
```

exact rubyは `--ruby on|off` 実装済み。unresolved rubyは別policyで、ruby offでも捨てません。

## 次にやること

最優先は **hardened Stage 19 private acceptance** です。新しい実装はprivate PDFsに対してまだ未検証なので、cover policyへ進む前にこれを確定します。

1. `verify:image-model` を9 PDFで再実行し、9 / 5,141 / 4 / 1を確認する。
2. `INTERPOLATED_IMAGE_OCCURRENCES` を確認する。0でなければfull EPUBへ進まず停止し、interpolation policyを再検討する。
3. image-modelが通れば `verify:ruby` と `verify:stage2` を再実行する。
4. その後 `verify:epub -- --epubcheck --report-dir <NEW_LOCAL_REPORT_DIR>` を実行する。
5. 9/9 EPUB、5,141/5,141 pages、6,387 unresolved、250/250 outline、4/4 image occurrences、1/1 unique PNG、XHTML→OPF→ZIP consistency、EPUBCheck 9/9 zero warning/errorを要求する。
6. 成功後のみ Stage 19 accepted とし、docsを更新して explicit cover policyへ進む。

## その後の道順

1. headings/sections: source-backed body anchorが無いため保留。page-level nav accepted fallback。
2. reading systems: Stage 14実装済み、実reader acceptance未完了。
3. images/cover: hardened Stage 19 private acceptance → explicit cover policy。
4. unresolved ruby refinement: 6,387件の改善。
5. CLI final acceptance。
6. browser/Android: CLI完了後。

## 禁止事項

- verifierを弱めてPASSにしない。
- website / filename / URL / Creator / Producer / font name / N-code / character appearance固有ルールを追加しない。
- source text/provenanceを推測値で置換しない。
- unresolved ruby、unsupported image、unknown effectを件数を減らす目的で捨てない。
- private PDF、抽出画像、本文断片、generated EPUB、local reportをcommitしない。
- review blockerを「current corpusでは見えない」だけで解決扱いにしない。

## Codex 開始時の最小指示

```text
BKrepublic/fileshape の codex-next-20260912 最新HEADから作業する。mainから開始しない。
254b001aa6903ab18056b271d0b31d8c5154d2ca と f92ba16d7ccbcb48f6f89a6f7bc528a5fe3c106c がHEADのancestorであることを確認する。
docs/codex-handoff-20260912.md、docs/stage19-review.md、docs/stage19-hardening.md、docs/continuation-status.md、docs/remaining-work/README.md を読む。
現在の最優先は hardened Stage 19 private acceptance。image-modelでinterpolation evidenceを確認してからruby / Stage2 / full EPUB+EPUBCheckを実行し、4 occurrences / 1 PNG / XHTML-OPF-ZIP整合まで確認する。成功後にのみStage 19 acceptedとし、explicit cover policyへ進む。
```
