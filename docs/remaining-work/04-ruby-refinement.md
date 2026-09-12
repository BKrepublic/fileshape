# 工程4：未解決ルビを根拠に基づいて改善する

## 現在地

**完了。** Stage 21〜24で全23,097候補を分類・再生・分解し、productionのルビ判定規則を変更せずにTask 4を閉じました。

```text
EXACT_CANDIDATES=16710
UNRESOLVED_CANDIDATES=6387
UNRESOLVED_REASON_COUNTS={"no-base":5004,"ambiguous-base":577,"noncontiguous-base":792,"missing-glyph-geometry":14}
REPLAY_MISMATCHES=0
```

6,387件を0件にすることは完了条件ではありません。source-backedで一意に改善できる構造的欠陥が見つからなかったため、既存のunresolved-content preservationを正式な受け入れ動作とします。

## 根拠

### no-base 5,004

Stage 22〜23で分析済みです。

- 3,800件はproduction geometryを満たすbody lineがない。
- 残り1,204件も全件で選択base glyph=0、choice=0。
- 1,130/1,204はglyph cell overlapが50%以下。
- 残り74件はglyph cellの前、後、または間にある。

閾値や`>50%` overlap ruleを緩和すると誤対応側へ倒れるため、production変更は行いません。

### noncontiguous-base 792

Stage 24で全件を構造分解しました。

```text
NONCONTIGUOUS_FAILURE_COUNTS={"same-item-source-gap":652,"same-item-source-gap+wide-gap":52,"wide-gap":88}
```

全件にsource不連続または実測glyph間の物理的不連続があります。missing source transitionは0件です。離れたsource文字を連結してruby baseを捏造しないため、そのままunresolvedにします。

### ambiguous-base 577

主因は明確です。

```text
boundary-uncertainty=541
annotation-overhang=28
noncontiguous-selection=6
line-glyph-unmapped=2
```

boundary-uncertain 541件は全件が既存1% margin以内です。一方、16,710 exact controlsは全件margin外で、観測上の境界が明確に分離しています。overhang 28件も全件が半body-sizeを超えます。したがって安全に緩和できる閾値はありません。

### missing-glyph-geometry 14

推測幅で補完しません。source-backedなgeometryがないためunresolvedのまま保持します。

## 受け入れ結論

- production `ruby-spans.ts` の変更なし。
- 16,710 exact候補は維持。
- 6,387 unresolved候補は理由付きで保持。
- default EPUBではunresolved annotationをpage noteとして保存。
- strict CLIでは`--unresolved-ruby error`で明示的に拒否できる。
- source integrity issue 0、unknown reason 0、production/replay mismatch 0。

Task 4は「改善実装なし」ではなく、**全候補を根拠付きで評価した結果、現在のfail-closed判定と保存方針を受け入れた**状態です。件数を減らすためだけの閾値変更は禁止します。

次は[工程5：CLI版の最終受け入れ](05-cli-acceptance.md)へ進みます。
