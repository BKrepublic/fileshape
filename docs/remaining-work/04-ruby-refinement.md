# 工程4：未解決ルビを根拠に基づいて改善する

## 2026-09-12 現在の checkpoint

Task 3 は Stage 20 まで accepted。Task 4 は **4Aの全候補分類から開始**しています。Stage 21 で、各PDFを一度だけglyph付きinspectionし、private本文をreportへ書かずに全ruby候補を分類する `npm run inspect:ruby-refinement` を追加しました。

現時点では association rule は変更していません。6,387件を減らす前に、開始点の exact/unresolved 全候補、reason、orientation、rotation、annotation glyph mapping、base alternatives、source range integrity を固定します。

private corpusでのStage 21 acceptance command:

```sh
npm run inspect:ruby-refinement -- local-samples \
  --output local-reports/<NEW_FILE>.json \
  --expect-pdf-count 9 \
  --expect-page-count 5141 \
  --expect-unresolved-count 6387
```

期待値を弱めて通しません。`SOURCE_INTEGRITY_ISSUES=0` と `UNKNOWN_REASON_COUNT=0` も必須です。詳細は [Stage 21](../stage21-ruby-refinement-inventory.md) を参照してください。

## 目的と開始条件

現在ページ末尾の注記として保存している候補のうち、実測glyphとsourceから一意に対応付けられるものを改善します。**6,387件を0件にすることは完了条件ではありません。** 正しい対応を増やし、不明な文字情報を失わないことを検証します。

[共通手順](README.md)、[Stage 3の座標・source契約](../stage3-ruby.md)、[保存方針](../stage8-unresolved-content-policy.md) を読みます。工程3の受け入れ済みコードを開始点とし、6,387件という過去の値に加えて、開始点の実際の候補集合を取得します。

## 対象ファイル

| ファイル | 見る内容 |
| --- | --- |
| [diagnose-ruby.ts](../../src/diagnose-ruby.ts) | 現行の候補診断。単一PDFと任意ページを指定できる |
| [ruby-refinement-inventory.ts](../../src/ruby-refinement-inventory.ts) | Stage 21 全候補分類、安定candidate ID、privacy-safe aggregate |
| [pdfjs-glyph-adapter.ts](../../src/pdfjs-glyph-adapter.ts)、[display-geometry.ts](../../src/display-geometry.ts) | glyph計測、状態再生、座標、未対応原因 |
| [ruby-spans.ts](../../src/ruby-spans.ts) | 一意性、連続性、競合、未解決理由 |
| [document-model.ts](../../src/document-model.ts)、[content-policy.ts](../../src/content-policy.ts) | source所有、exact／未解決の保存 |
| [verify-ruby-samples.ts](../../src/verify-ruby-samples.ts)、[ruby-spans.test.ts](../../test/ruby-spans.test.ts) | 代表source対、回転／文字／競合の既存検証 |

## 4A：全候補を分類する

1. 開始SHA、入力指紋、PDF.js／設定を固定します。Stage 21では全件集計に `inspect:ruby-refinement` を使い、同じPDFをページごとに再読込しません。個別の意味確認だけ既存診断を使います。

   ```sh
   npm run diagnose:ruby -- 'local-samples/INPUT.pdf' 4
   ```

2. 匿名PDF ID、sourceページ、annotationSourceRangesを候補識別の軸にし、glyph refs、base候補、代替候補、reasonを記録します。配列の何番目かだけを安定IDにしません。Stage 21 candidate IDはPDF ID・page・annotation source rangesだけから作り、現在のreason/statusを含めません。
3. 現行の未解決理由 `missing-glyph-geometry`、`no-base`、`ambiguous-base`、`noncontiguous-base`、`conflicting-annotations` で全件を集計し、候補総数とsource範囲の保存を照合します。未知の理由は別枠に表示し、集計から落としません。
4. 各理由を、回転・書字方向・glyph欠落/曖昧mapping・base alternative数・page glyph issueなどの構造的な特徴でさらに分けます。件数の多い群、全書籍にまたがる群、補助文字や競合など少数の難しい群から代表例を選び、選び方を先に記録します。
5. 代表例について、raw text item、実測glyph、候補source、期待される親文字／注記、現在の不成立理由を比較します。目視確認で意味を補う場合は、その証拠と自動処理に利用できる構造的根拠を区別します。

成果物は全件分類と、採用する修正候補／見送る候補の表です。理由別件数の上位だけを出して全6,387件の分析完了とはしません。

## 4B：原因を一つずつ修正する

1. 最初に、再現できて構造的な根拠を説明できる原因を一つ選びます。閾値を複数同時に変えず、現状の誤りと期待結果を再現するfixtureを作ります。
2. 同じ幾何で文字列だけが違うケース、他方の列も候補になるケース、独立した小さい文字、重複印字、切れたglyph列を反例にします。正例だけで規則を採用しません。
3. glyph取得の問題ならadapterを、対応の一意性の問題ならruby-spansを修正します。source再構成、等分幅、フォント名や特定文字の例外で迂回しません。
4. 曖昧さが残る候補は未解決のまま保持します。「ルビではない」と確定する処理を追加するなら、その証拠と本文へ保存する経路を別途設計し、候補を消すだけの処理にしません。
5. 一つの修正が局所テストと実データの対応確認に通ったら、次の原因へ進む前に差分をレビューします。根拠のある採用候補を処理し終えたら、見送った理由を記録して4Cへ進みます。

## 4C：件数ではなくsource単位で保存を照合する

1. 同じ入力・設定で開始点と修正後の候補を再取得します。候補が分裂・結合する場合も、annotationのsource範囲と文字列で対応を追います。
2. 旧未解決sourceが、新exactの注記、残る未解決注記、根拠付きで本文へ移した情報のどこにあるかを全件追跡します。新規候補と旧exactからの変更も別に数えます。
3. 新しくexactとした全候補に、一意なbase、実測glyph、連続したsource範囲、競合のない所有があるか機械的に検証します。各修正規則の実PDF例と全難例を目視レビューします。全件の意味的な正しさを目視認証した場合と、構造検証＋代表レビューの場合を区別します。
4. 既存exactが変わる項目は理由付きで個別にレビューします。過去の誤りを直す変更は可能ですが、根拠のない後退や誤対応は受け入れません。
5. EPUBではsource情報がexactルビまたは注記等の宣言した経路に残ることを検証します。ルビを追加した結果、同じ注記がページ末尾に二重に出ていないかも確認します。

## 検証と完了条件

[共通の全検証](README.md) を実行し、工程2のルビ／注記の表示項目も修正後のEPUBで再確認します。

- 全入力の候補を理由別に計数し、開始／終了のsource対応表を作成済み。範囲の欠落・意図しない二重所有0件。
- 採用した修正は正例・反例・実データで検証され、sourceを捏造せずに対応を改善している。改善できなかった群も理由付きで残っている。
- 代表検証のmapped 880/880、代表対応11/11などの意味的な条件を維持する。値が変わる場合は独立した根拠と個別レビューを添え、単なる期待値の置き換えで通さない。
- 5,141 sourceページを保存し、全9冊のEPUBCheckと選択したリーダーでの表示確認に合格。
- 最終未解決件数、理由別内訳、新exact数、変更された旧exact数、未確認の意味解釈をレビューへ記録する。「未解決0」を宣伝しない。

偽陽性、source欠落、競合を無理に解消する変更があれば、その規則の採用を止めます。根拠を示せる改善が一つもない場合は「分析完了・改善実装なし」とし、機能改善を完了扱いにせず、保存方針のままCLI版を受け入れるかという範囲の判断を提示します。

成果物は分類用の再現可能な処理、採用した限定修正、反例fixture、source単位の比較集計、既知制限、[レビュー記録](review-template.md) です。push後は工程5へ進みます。
