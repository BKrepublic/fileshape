# 工程4：未解決ルビを根拠に基づいて改善する

## 2026-09-12 現在の checkpoint

Task 3 は Stage 20 まで accepted。Task 4 は Stage 21 の全候補分類と Stage 22 の coarse geometry near-miss evidence まで完了しています。

Stage 21 private corpus baseline:

```text
PDFS=9
PAGES=5141
RUBY_CANDIDATES=23097
EXACT_CANDIDATES=16710
UNRESOLVED_CANDIDATES=6387
UNRESOLVED_REASON_COUNTS={"no-base":5004,"ambiguous-base":577,"noncontiguous-base":792,"missing-glyph-geometry":14}
SOURCE_INTEGRITY_ISSUES=0
UNKNOWN_REASON_COUNT=0
```

Stage 22 では production threshold を変更せず、未解決候補の nearest body geometry を current coarse gates で測定しました。`no-base` 5,004件の大半は複数gateを大きく外れており、blanket threshold widening は却下します。一方、1,204件は coarse entry-level gates をすべて通過しているのに production は `no-base` のままです。したがって次は threshold ではなく、その後段の glyph-cell overlap / annotation coverage / source-contiguity / line-choice を read-only で再生して failure mechanism を分類します。

## 目的と開始条件

現在ページ末尾の注記として保存している候補のうち、実測glyphとsourceから一意に対応付けられるものを改善します。**6,387件を0件にすることは完了条件ではありません。** 正しい対応を増やし、不明な文字情報を失わないことを検証します。

[共通手順](README.md)、[Stage 3の座標・source契約](../stage3-ruby.md)、[保存方針](../stage8-unresolved-content-policy.md) を読みます。

## 対象ファイル

| ファイル | 見る内容 |
| --- | --- |
| [diagnose-ruby.ts](../../src/diagnose-ruby.ts) | 現行の候補診断。単一PDFと任意ページを指定できる |
| [ruby-refinement-inventory.ts](../../src/ruby-refinement-inventory.ts) | Stage 21 全候補分類、安定candidate ID、privacy-safe aggregate |
| [ruby-near-miss-evidence.ts](../../src/ruby-near-miss-evidence.ts) | Stage 22 coarse geometry near-miss evidence |
| [pdfjs-glyph-adapter.ts](../../src/pdfjs-glyph-adapter.ts)、[display-geometry.ts](../../src/display-geometry.ts) | glyph計測、状態再生、座標、未対応原因 |
| [ruby-spans.ts](../../src/ruby-spans.ts) | 一意性、連続性、競合、未解決理由 |
| [document-model.ts](../../src/document-model.ts)、[content-policy.ts](../../src/content-policy.ts) | source所有、exact／未解決の保存 |
| [verify-ruby-samples.ts](../../src/verify-ruby-samples.ts)、[ruby-spans.test.ts](../../test/ruby-spans.test.ts) | 代表source対、回転／文字／競合の既存検証 |

## 4A：全候補を分類する

1. `inspect:ruby-refinement` で全候補を同じPDF一回のinspectionから取得する。
2. 匿名PDF ID、sourceページ、annotationSourceRangesを候補識別の軸にし、glyph refs、base候補、reasonを記録する。
3. 全理由を計数し、未知理由・source range不整合をfail closedにする。
4. 回転・書字方向・glyph mapping・base alternatives・page glyph issuesなど構造的特徴で分類する。
5. 代表例についてraw text item、実測glyph、候補source、現在の不成立理由を比較する。

Stage 21で完了済み。全23,097候補を再現可能に分類し、6,387 unresolvedを完全照合済み。

## 4B：原因を一つずつ修正する

1. 最初に、再現できて構造的な根拠を説明できる原因を一つ選ぶ。閾値を複数同時に変えない。
2. 正例だけでなく、文字列だけ違う同形状、独立小文字、重複印字、切れたglyph列など反例fixtureを作る。
3. glyph取得問題ならadapter、対応一意性問題ならruby-spansを修正する。source再構成、等分幅、フォント名や特定文字の例外で迂回しない。
4. 曖昧さが残る候補は未解決のまま保持する。
5. 一つの修正ごとに局所testと実データsource差分を確認する。

Stage 22 evidenceにより、`no-base` 全体に対する閾値緩和は採用しません。5,004件中3,662件はnearest body entryがside axisで2 body widths以上離れ、大規模群がaxis/inline proximityも外れています。

ただし1,204件の `no-base` は coarse entry-level gatesを通過しています。次checkpointでは production後段の glyph selection をread-only再生し、以下を区別します。

- eligible lineはあるがglyph cellが一つも選択されない;
- boundary uncertainty / annotation overhang;
- source/glyph non-contiguity;
- 複数line/choice競合;
- diagnostic replayとproduction reasonの不一致。

この分布が出るまでproduction ruleは変更しません。

## 4C：件数ではなくsource単位で保存を照合する

1. 同じ入力・設定で開始点と修正後の候補を再取得する。
2. 旧未解決sourceが、新exact、残る未解決、根拠付き本文移動のどこにあるか全件追跡する。
3. 新exact全件に、一意base、実測glyph、連続source、競合なしを機械検証する。
4. 既存exact変更は理由付きで個別reviewする。
5. EPUBでsource情報が宣言した経路に残り、二重注記がないことを確認する。

## 検証と完了条件

[共通の全検証](README.md) を実行し、工程2のルビ／注記表示も修正後EPUBで再確認します。

- 全候補を理由別に計数し、開始／終了source対応表を作成済み。範囲欠落・意図しない二重所有0件。
- 採用修正は正例・反例・実データで検証され、sourceを捏造せず改善している。
- mapped 880/880、代表対応11/11等の意味的条件を維持する。値変更は独立根拠と個別review必須。
- 5,141 sourceページを保存し、全9冊EPUBCheckと選択reader表示確認に合格。
- 最終未解決件数、理由内訳、新exact数、変更された旧exact数、未確認意味解釈をreviewへ記録する。

偽陽性、source欠落、競合を無理に解消する変更があればその規則を採用しません。根拠ある改善が無ければ「分析完了・改善実装なし」とし、保存方針のままCLI版を受け入れるか判断します。
