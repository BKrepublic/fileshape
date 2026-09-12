# 工程4：未解決ルビを根拠に基づいて改善する

## 現在地

Stage 21で全23,097候補を分類し、Stage 22でcoarse geometry near-miss evidence、Stage 23でproduction後段のglyph-selection replayまで完了しました。productionのルビ判定規則はまだ変更していません。

```text
EXACT_CANDIDATES=16710
UNRESOLVED_CANDIDATES=6387
UNRESOLVED_REASON_COUNTS={"no-base":5004,"ambiguous-base":577,"noncontiguous-base":792,"missing-glyph-geometry":14}
REPLAY_MISMATCHES=0
NO_BASE_STAGE_COUNTS={"no-eligible-line":3800,"no-glyph-selected":1204}
```

Stage 22–23の結論は、`no-base`閾値を緩和しないことです。1,204件のcoarse-eligible `no-base`も全件で選択glyph=0・choice=0であり、1,130件はglyph cellとのoverlapが50%以下、残り74件はglyph cellの前後または間にあります。したがって5,004件の`no-base`は現状のまま意図的にunresolvedで保持します。

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

`no-base`はStage 22–23で分析完了し、production変更なしで保持する判断になりました。次は残るpost-selection群をread-onlyで分解します。

主対象:

- `noncontiguous-base`: 792件;
- `ambiguous-base`: 577件;
- Stage 23 `noncontiguous-selection`: 798件;
- `boundary-uncertainty`: 541件;
- `annotation-overhang`: 28件;
- `line-glyph-unmapped`: 2件;
- `missing-annotation-geometry`: 14件。

次checkpointでは、normalized internal glyph gap、source continuity、boundary margin、annotation overhang量を測ります。ここでも分布が出るまで`ruby-spans.ts`は変更しません。

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
