# 工程4：未解決ルビを根拠に基づいて改善する

## 現在地

Stage 21で全23,097候補を分類し、Stage 22でcoarse geometry near-miss evidenceまで取得済みです。productionのルビ判定規則はまだ変更していません。

```text
EXACT_CANDIDATES=16710
UNRESOLVED_CANDIDATES=6387
UNRESOLVED_REASON_COUNTS={"no-base":5004,"ambiguous-base":577,"noncontiguous-base":792,"missing-glyph-geometry":14}
NO_BASE_COARSE_ELIGIBLE=1204
NO_BASE_CROSS_DISTANCE_GE_2_BODY_WIDTHS=3662
```

Stage 22の結論は、`no-base`全体に対する閾値緩和をしないことです。1,204件だけがcoarse entry-level gatesを通るため、次はproduction後段のglyph-cell overlap / annotation coverage / source continuity / line-choiceをread-only再生し、failure mechanismを分類します。

## 原則

- 6,387件を0件にすることは完了条件ではない。
- source-backedで一意な改善だけをexactへ昇格する。
- filename、font name、文字内容、OCR、辞書、作品固有ルールを使わない。
- ligatureやsupplementary Unicodeを推測幅で分割しない。
- 曖昧な候補は未解決のまま保存する。
- verifierの期待値を弱めない。

## 4A 全候補分類

完了済み。`inspect:ruby-refinement`で各PDFを一度だけglyph付きinspectionし、candidate ID、reason、orientation、rotation、glyph mapping、base alternatives、source integrityをprivacy-safeに全件分類しました。

## 4B 原因別改善

現在ここです。

Stage 22により、大多数の`no-base`は単純なnear missではないことが確認できました。次checkpointではproduction後段をread-onlyで再生し、1,204件のcoarse-eligible `no-base`を以下に分類します。

- eligible lineはあるがglyph cellが一つも選択されない;
- boundary uncertainty / annotation overhang;
- source/glyph non-contiguity;
- 複数line/choice競合;
- replayとproduction status/reasonの不一致。

この分布が出るまで`ruby-spans.ts`は変更しません。

production変更を行う場合は、まず正例fixtureと adversarial negative fixtureを追加し、その後に一つの構造規則だけを変更します。変更後はstable candidate IDでbefore/afterを全private corpus比較します。

## 4C source単位の保存照合

production変更後に必須です。

- 旧unresolved sourceが新exactまたは残るunresolvedのどちらかへ完全対応すること;
- 新exact全件に一意base、実測glyph、連続source、競合なしがあること;
- 既存exact変更は理由付き個別review;
- EPUBで注記二重化やsource消失がないこと。

## 完了条件

- source範囲欠落・意図しない二重所有0件;
- 採用修正は正例・反例・実PDF構造で検証済み;
- mapped 880/880、代表対応11/11等の意味的baselineを維持;
- 5,141 source pages保持;
- 全9冊EPUBCheck clean;
- 最終unresolved内訳、新exact数、変更旧exact数、見送った群と理由を記録;
- 改善根拠が無ければ無理に件数を減らさず、保存方針のままTask 4を閉じる判断を行う。
