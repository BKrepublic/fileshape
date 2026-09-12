# FileShape 残作業の実行手順書

この文書は FileShape の **CLI版 PDF -> EPUB を完成させるまでの正本ロードマップ**です。詳細な実装・検証・受け入れ条件は各 task 文書と最新 Stage 文書を優先します。

## 現在地

Stages 19–20 の通常画像 preservation / explicit cover policy は accepted。Stage 21 で全23,097 ruby候補を分類し、Stage 22 で unresolved 6,387件の coarse geometry near-miss evidence を取得しました。

```text
RUBY_CANDIDATES=23097
EXACT_CANDIDATES=16710
UNRESOLVED_CANDIDATES=6387
UNRESOLVED_REASON_COUNTS={"no-base":5004,"ambiguous-base":577,"noncontiguous-base":792,"missing-glyph-geometry":14}
NO_BASE_COARSE_ELIGIBLE=1204
NO_BASE_CROSS_DISTANCE_GE_2_BODY_WIDTHS=3662
```

## 完成までの工程

| 順序 | 指示書 | 残っている内容 | 現在 |
| --- | --- | --- | --- |
| 1 | [本文見出し・章構造](01-headings-and-sections.md) | 新しいPDF-native evidenceが得られた場合だけ再開 | **保留**。page-level navigationをaccepted fallbackとする |
| 2 | [縦書き・ルビの表示互換性](02-reading-systems.md) | 実readerでの互換性確認 | **実装済み・manual acceptance待ち** |
| 3 | [表紙・挿絵](03-images-and-cover.md) | なし | **accepted** |
| 4 | [未解決ルビの改善](04-ruby-refinement.md) | post-gate glyph-selection evidence → 必要なら限定修正 → source単位差分検証 | **実装中**。Stage 21/22 evidence accepted |
| 5 | [CLI版の最終受け入れ](05-cli-acceptance.md) | accepted scope統合、CLI/既知制限の凍結、最終validation | **未着手** |
| 後続 | [ブラウザー／Android](06-browser-android.md) | UI/環境adapter/実機 | **CLI完了後** |

## Ruby方針

- exact rubyはsource-backed;
- `--ruby on|off` 実装済み、既定`on`;
- `off`はexact annotation markupだけを外し、base text/provenanceを保持;
- unresolved rubyは別policyで、`off`でも捨てない;
- 件数を減らすこと自体は目的にしない。

Stage 22の結論として、`no-base`全体の閾値緩和はしません。5,004件中3,662件はnearest body entryがside axisで2 body widths以上離れています。一方1,204件はcoarse entry gateを全部通るため、次はproductionのglyph-cell選択、annotation coverage、source continuity、line/choice構築をread-onlyで再生します。

## 共通ルール

- website、filename、URL、Creator/Producer、font name、N-code、特定文字の見た目をparser branch条件にしない;
- PDF structure、geometry、ordering、source refsを根拠にする;
- `TextItem.str` と source ownershipをsource truthとして保持する;
- ligature、supplementary Unicode、combining sequenceを推測幅で分割しない;
- uncertain ruby / heading / image effect / coverを推測で確定しない;
- unresolved / unsupported件数を減らすために情報を捨てない;
- verifierの期待値を弱めてPASSにしない;
- private PDF、private image、本文抜粋、generated private EPUB、local reportをGitへ入れない。

## 検証

```sh
npm test
npm run verify:ruby
npm run verify:stage2
npm run verify:epubcheck
npm run verify:epub -- --epubcheck --report-dir <NEW_LOCAL_REPORT_DIR>
```

## この手順書は完成までの道のりか

**CLI版については Yes** です。Task 1〜5がCLI完成までの道筋で、Task 6はその後のbrowser/Android製品化です。
