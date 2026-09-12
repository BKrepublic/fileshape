# 工程3：表紙・挿絵の抽出と同梱

## 2026-09-12 現在の checkpoint

Stage 15〜17 により、この工程の **3A と 3B の evidence/resource 調査は current private corpus について必要な地点まで完了**しています。最初から棚卸しをやり直さないでください。

確認済み:

```text
9 PDFs / 5141 pages
IMAGE_PAINTS=4
XOBJECT_PAINTS=4
EXTRACTED_RESOURCES=4
UNSUPPORTED_RESOURCES=0
UNIQUE_CONTENT_RESOURCES=1
all four resources: 800x600 RGB24
CLIP_STATUS_COUNTS={"exact-rect":4}
CLIP_COVERAGE_COUNTS={"contains-image":4}
IMAGE_ISSUES=0
```

4 occurrence はすべて保持対象です。同じ PNG content hash を持つため resource bytes は1個に dedupe できますが、occurrence provenance を1個に潰してはいけません。4件とも exact rectangular clip が transformed image bounds を包含しており、current corpus では pixel cropping は不要です。

Stage 18 で production inspection と typed image resource/occurrence 境界まで実装済みです。次は本文内 placement と EPUB manifest/resource/reference を一体で実装し、その後 explicit cover policy へ進みます。cover の自動推測はしません。cropped / complex / unknown clip、mask、unsupported schema は current corpus に無くても fixture で fail closed を維持してください。

Stage 18 時点では converter は画像抽出を有効にしておらず、EPUB画像保持を完了とは扱いません。詳細は [Stage 18](../stage18-production-image-model.md) を参照してください。

詳細な引き継ぎは [Codex handoff](../codex-handoff-20260912.md)、集計は [Stage 17](../stage17-content-controls-image-placement.md) を参照してください。

## Stage 19 production image integration contract

この checkpoint は通常の本文画像だけを対象にし、cover policy は含めません。以下を一つの atomic change として実装します。

### 本文との順序

1. 各 `DocumentImageOccurrence` に `placementIndex` を追加します。値は同じページの `blocks` 間の gap（先頭を 0、末尾を `blocks.length`）を表し、整数かつ範囲内でなければモデル検証を失敗させます。
2. placement は既存の `PhysicalPageLayout` の unit position と、semantic block の `unitIndexes`、画像の `displayBounds` だけから決めます。horizontal page では上から下、vertical page では右から左を block の cross-axis 順序とします。block の座標を平均などの単一値へ潰さず、`unitIndexes` が参照する全 unit position を分類します。参照先unitが無いblock、空の`unitIndexes`、有限値でないpositionは失敗です。
3. 比較許容値 `PLACEMENT_EPSILON=1e-6` を一か所に定義します。horizontal page では、block の全 unit が `position < image.top - epsilon` なら前、全 unit が `position > image.bottom + epsilon` なら後とします。vertical page では、全 unit が `position > image.right + epsilon` なら前、全 unit が `position < image.left - epsilon` なら後とします。ひとつでも許容帯を含む画像区間に入る、同一blockのunitが画像の両側に分かれる、blockの分類が `[前..., 後...]` の一回だけの遷移にならない、または候補gapが一意でない場合はページ／operator／occurrenceを示して変換全体を失敗させます。境界上またはepsilon以内を前後へ丸めません。
4. `orientation=unknown` かつ `blocks.length>0` のページはplacement前に失敗させます。既存pipelineと同じく、unknownを許すのはvisible text blockが無いページだけです。block が0件なら gap 0を一意な placement とします。同じ gap の複数画像は horizontal では `top` 昇順、次に `left` 昇順、vertical では `right` 降順、次に `top` 昇順、orientation unknown では source `operatorIndex, occurrenceIndex` 昇順で並べ、最後の tie-breaker は常に `operatorIndex, occurrenceIndex` 昇順とします。出現を content hash で重複排除しません。
5. XHTML serializer は block と画像を `placementIndex` で交互に出力します。画像を一律にページ末尾へ移しません。current corpus の匿名再計測では4 occurrenceすべてが horizontal page の唯一の text block より下にあり、全4件で gap 1が一意です。
6. Stage 19 の表示対象は、viewport 適用後の `displayTransform` が有限値、axis-aligned、非mirrorで、decoded PNG の向きをそのまま表示できるものに限定します。回転、skew、mirror、または変換を一意に正規化できない occurrence は黙って近似せず fail closed とします。current corpus の4件はこの条件を満たします。

### EPUB resource と XHTML

1. content resource の archive path は `OEBPS/images/<64 lowercase hex contentHash>.png`、OPF manifest ID は既存 model ID と同じ `image-<contentHash>`、OPF href は `images/<contentHash>.png`、page XHTML からの参照は `../images/<contentHash>.png` とします。resource は content hash の辞書順で並べ、同じhashはbytesを1回だけ同梱します。hash、ID、bytes の不一致、重複path／ID、参照先欠落は archive 作成前に失敗させます。
2. 各 occurrence は `<figure class="fileshape-image" ...><img ... /></figure>` として独立に出力し、`data-source-page`、`data-operator-index`、`data-occurrence-index` を10進整数で保持します。`img` には決定済み相対 `src`、resource の intrinsic `width`／`height`、必須 `alt` を付けます。CSS は `max-inline-size: 100%` と `block-size: auto` を使い、縦横比を変えません。
3. 現在の PDF image model には source-backed description がないため、Stage 19 は装飾画像と推測せず、空 `alt` も使いません。暫定の非推測ラベルを `Source image from page <sourcePage>` とし、XML attribute escaping を必須にします。これは画像内容と同等の説明や EPUB Accessibility 適合を主張するものではありません。source-backed description transport は得られた時点でこのラベルより優先する別 checkpoint とします。
4. 画像だけのページは `blocks=[]`、1件以上の `imageOccurrences`、全 occurrence の `placementIndex=0` とし、通常どおり1 XHTML／1 manifest item／1 spine itemを生成します。blank page は `blocks=[]` かつ `imageOccurrences=[]` の空bodyとして同じくsource pageを保持します。画像だけのページは `fileshape-page-has-images`、blank page は `fileshape-page-blank` class を追加し、出力上も区別します。

### production limits と failure boundary

Stage 16 の current-corpus 実測は max 480,000 pixels/resource、total decoded bytes 5,760,000、total PNG bytes 604,156、4 occurrencesです。Stage 19 は以下の既定値を一つの exported production-limit object に置き、CLI option はまだ追加しません。

- width／height: 各8,192以下
- pixels/resource: 33,554,432以下
- unique resources/document: 4,096以下
- image occurrences/document: 10,000以下
- decoded bytes/document（content resource単位）: 536,870,912以下
- PNG bytes/document（dedupe後）: 268,435,456以下

正でない寸法、整数でない寸法、上限超過、加算overflowは image inspection/model 完成前に失敗させます。同一content resourceの複数occurrenceでresource bytes/pixelsを再加算しません。occurrence count はすべて数えます。診断は上限名、実測値、上限値を含め、該当occurrenceがある場合はsource page／operator／occurrenceを含めます。

`convertPdfToEpub` は `includeImages: true` を指定します。inspection、placement、model validation、XHTML、manifest、ZIPのどこか一つでも失敗した場合はEPUBを書き出さず、既存output pathも変更しません。すべて成功して完全なarchive bytesが得られた後だけ一時ファイルへ書き、同じdirectory内のatomic renameで最終pathを置き換えます。一時ファイルは成功時に残さず、失敗時も可能な範囲で削除します。partial EPUBや「対応画像だけ」の成功を返しません。

この contract は、PNGが EPUB core media type であること、利用する全publication resourceをmanifestへ列挙すること、manifest内URLを一意にすることに従います。画像の短い代替テキストを必須にしますが、sourceに存在しない画像内容は生成しません。

## 目的と開始条件

本文中に描画された画像を、その出現位置とsource根拠を保ってEPUBへ入れます。表紙は明示された情報または利用者の指定で選びます。[共通手順](README.md) と工程2の資源管理方式を確認してください。

現在の [pdf-inspector.ts](../../src/pdf-inspector.ts) は画像描画operatorを数えますが、画像本体・描画位置・出現順をモデルへ運んでいません。**描画回数、独立した画像資源数、挿絵の数は一致するとは限りません。** `imagePaintOps`だけで画像保存率を判定しません。

## 3A：画像と描画の棚卸し

1. 全9 PDFを調べ、匿名PDF ID、ページ、operator位置、画像資源参照、描画行列、クリップ、マスク、Form内の出現、反復描画をローカルに記録します。本文画像、装飾、画像化された文字を見た目だけで捨てません。
2. `getOperatorList()`の画像系operatorと資源取得経路を、固定されたPDF.jsの実装で確認します。新しいinternal依存は専用adapterへ隔離し、未対応のschemaを検知します。新規候補は `src/pdf-image-adapter.ts` です。
3. 対応できる描画と、mask／clip／色空間などを含む未対応描画を分類します。未対応を0件として消さず、理由とsource参照を残します。候補分類の全件合計を元の描画記録と照合します。
4. 権利上公開できる自作実PDF fixtureに、単一画像、inline image、同一資源の複数配置、Form内画像、回転・拡大縮小、透明／マスク、切り抜き、画像だけのページ、文字との混在を用意します。元PDFの表示を期待結果として保存します。

### 3A の現在地

Stage 15 で private corpus 全件の image paint evidence を取得済みです。Stage 16/17 で byte decode と clip classification まで進んでいるため、current corpus に対して 3A を再実行する必要はありません。新しい fixture / 新しい operator schema / 新しい corpus を追加したときだけ、必要範囲を再調査します。

## 3B：画像モデルと取得処理を実装する

1. 画像のbytes／media type／寸法を持つ資源と、sourceページ・operator・描画位置・順序を持つ出現情報を分けます。元資源を共有しても、出現位置を重複排除してはいけません。
2. 元の符号化データを保存できる場合と、表示を再現するため変換する場合を分けます。変換するときは色・透明度・clip・向きを原表示と比較します。元画像bytesをそのままJPEG/PNGと決めつけません。
3. content hash等で決定的な資源IDを割り当てます。同じ元資源でも描画効果が違う場合は、必要な表示結果を区別します。名前衝突や同名による上書きを拒否します。
4. モデルへ画像出現ノードとprovenanceを追加し、本文との順序を既存の幾何とsource順序から決めます。一意に決められない位置は未解決として残します。全画像を単にページ末尾へ付けて位置保存済みとしません。
5. 画像だけのページを有効な内容として扱えるか [pdf-document-pipeline.ts](../../src/pdf-document-pipeline.ts) と [document-model.ts](../../src/document-model.ts) を確認します。sourceページを除去せず、読み順と空白ページとの区別を保持します。
6. 画像寸法／総画素数／出力サイズの上限を設計し、超過時は明確に失敗させます。黙って画像を落として成功にしません。上限値は対象データの観測とメモリ測定に基づき、後から変更できる場所に置きます。

### 3B の現在地

Stage 16 で decoded image resource adapter と deterministic PNG resource identity は実装済みです。Stage 17 で current corpus の clip は 4/4 `exact-rect + contains-image` と確認済みです。

したがって次の未完了部分は主に:

- typed document/publication model への image resource / occurrence transport;
- text/image reading-order placement;
- resource limits の production contract;
- cropped/complex/unknown clip の fixture/fail-closed contract;
- image-only page behavior の production validation。

## 3C：EPUBへ組み込む

1. [epub-package.ts](../../src/epub-package.ts) に資源を同梱し、media type・manifest・相対参照を整合させます。元PDF内の任意の名前をZIPの絶対パスや親ディレクトリ参照として使いません。
2. [epub-xhtml.ts](../../src/epub-xhtml.ts) から正しい出現位置へ参照し、工程2のCSSで縦横比とリフローを保ちます。画像の代替説明は原資料の明示情報を優先し、内容を推測した説明を付けません。意味が未確認の画像を装飾と決めつけません。
3. 表紙選択は自動推測を既定にしません。選択根拠がないPDFは表紙未指定のまま、通常の本文画像として保持します。利用者指定を追加する場合はsourceページ／画像出現など指定方式を設計し、存在検証・usage・失敗時の挙動をテストします。現時点に表紙指定CLIオプションはありません。
4. 表紙が明示指定された場合にだけ、EPUBのcover-image指定と必要な表紙表示を追加します。本文内にも同じ画像がある場合の重複表示方針を決め、元の本文出現を無断で削除しません。
5. 未対応画像の既定動作は、欠落を知らせて変換失敗とする設計を出発点にします。将来「省略して継続」を追加するなら明示的な方針・利用者への報告が必要です。未対応が残る状態で画像保持対応を全面完了としません。

## 検証と完了条件

[共通の全検証](README.md) と工程2の画像関連表示確認を実行します。

- 各元画像出現が、出力内の対応出現または明示的な未対応診断へ追跡できる。本文挿絵の欠落／位置違い／勝手な重複排除0件。
- 全出力画像参照に実体とmanifest項目があり、寸法・透明度・向き・clipをfixtureで比較済み。
- 同一資源の再利用、独立した複数出現、明示表紙指定、表紙なし、画像だけのページ、未対応時の失敗を実PDFで確認済み。
- 9 PDF／5,141 sourceページと本文・ルビ・注記の所有を保持し、全9冊のEPUBCheckに合格。表紙ページを増やす場合はEPUB内項目数とsourceページ数を分けて計上する。
- 全コーパスの画像出現棚卸しを取り終え、対応／未対応を区別した実測と、少なくとも対応する全表示パターンのfixture証拠がある。コーパスに該当画像がなければ、実コーパス検証とfixture検証を区別して報告する。

資源取得の仕様を特定できない、mask／clipが再現できない、配置が一意でない場合はその対応を保留します。画像を別の絵へ生成し直したり、本文全体を画像化して問題を隠したりしません。

成果物は画像adapter・モデル／serializer変更、資源整合検証、実PDF fixture、匿名の対応表、表紙指定の使い方、[レビュー記録](review-template.md) です。ローカルに取り出した画像は検証・公開集計後に削除します。push後は工程4へ進みます。

確認先：[PDF.js page API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html)、[EPUB 3.3](https://www.w3.org/TR/epub-33/)。internalの画像形式は固定された実装を直接確認してください。
