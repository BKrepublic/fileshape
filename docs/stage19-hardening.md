# Stage 19 hardening checkpoint

2026-09-12 の独立レビュー `stage19-review.md` で見つかった Stage 19 の production image safety gap に対する修正 checkpoint。

Hardening implementation ancestor:

```text
f92ba16d7ccbcb48f6f89a6f7bc528a5fe3c106c
```

GitHub Actions CI run #57 はこの commit で成功した。typecheck / unit tests / real EPUBCheck integration は green。private `local-samples/` は GitHub runner に存在しないため、9 PDF acceptance は未実行。

## 修正済み

- R1: decoded resource と display bounds の縦横比が一致しない non-uniform scale を production extraction で fail closed。
- R2: pinned PDF.js operator list の `setGState` を再生し、image paint 時点で fill alpha=1、blend=`source-over`、soft maskなし、transfer mapなし、transparency group外であることを要求。証明できない compositing は fail closed。
- R3: 同一ページの image display bounds が正の面積で重なる場合、layered compositing 未対応として fail closed。境界接触は重なりとみなさない。
- R4: `displayTransform` から再計算した bounds と model `displayBounds` を照合。clip status / coverage / clipRect の cross-field invariant と contains-image を model validation で再確認。
- R5: raw decoded image object の width / height / pixels / decoded byte length を PNG copy/deflate 前に production preflight。document-wide final limits も維持。
- R6: `verify:epub` に XHTML image occurrence、OPF image manifest、ZIP PNG entry、content hash の相互整合検査を追加。private corpus expectation は4 occurrences / 1 unique PNG content resource。
- R7: PDF interpolation=true を EPUB reader 任せにせず、現在は XHTML render 前に fail closed。`verify:image-model` は interpolated occurrence count を集計できる。

既存 Stage 19 synthetic fixture が transform と bounds を不整合に作っていたため、新しい model invariant を弱めず fixture 側を修正した。最終 remote CI は green。

## 次の private acceptance

次は最新 `codex-next-20260912` で private corpus を実行する。

1. image-model verifier で9 PDFs / 5,141 pages / 4 occurrences / 1 unique resourceを再確認し、`INTERPOLATED_IMAGE_OCCURRENCES` を確認する。
2. interpolated occurrence が0である場合のみ、ruby / Stage 2 regression と full EPUB regressionへ進む。0でなければ該当機能を黙って近似せず停止する。
3. full EPUB verifier は従来 baselineに加え、4 image occurrences / 1 unique PNG / XHTML→OPF→ZIP consistency / EPUBCheck 9/9を要求する。
4. 成功後に Stage 19をacceptedとして記録し、その後 explicit cover policyへ進む。

この checkpoint は verifier を弱めず、private本文・PDF・抽出画像・生成EPUBを repository に追加しない。
