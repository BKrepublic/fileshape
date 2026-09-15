import "./site-info.css";

function mountSiteInfo(): void {
  const page = document.querySelector<HTMLElement>(".page-shell");
  if (!page) {
    window.addEventListener("load", mountSiteInfo, { once: true });
    return;
  }
  if (page.querySelector(".site-info")) return;

  const downloadLink = document.querySelector<HTMLAnchorElement>("#download-link");
  if (downloadLink) {
    downloadLink.classList.add("download-button");
    downloadLink.textContent = "EPUBを保存";
  }

  page.insertAdjacentHTML("beforeend", `
    <section class="site-info" aria-labelledby="about-fileshape-title">
      <div class="site-info-heading">
        <p class="eyebrow">ABOUT FILESHAPE</p>
        <h2 id="about-fileshape-title">FileShapeについて</h2>
        <p>FileShapeは、PDFの文字や配置を読み取り、読みやすいEPUBへ組み直すブラウザツールです。特に日本語の縦書きPDFを扱うことを重視しています。</p>
      </div>

      <div class="site-info-grid">
        <article>
          <h3>ファイルは端末内で処理</h3>
          <p>選択したPDF本文や生成したEPUBは、変換のためにFileShapeのサーバーへ送信しません。変換処理は原則としてブラウザ内で行います。</p>
        </article>
        <article>
          <h3>縦書き・ルビを意識して再構成</h3>
          <p>単純に文字を抜き出すのではなく、文字方向、読書順、段落、ルビ候補などをPDFの配置情報から組み立て直します。</p>
        </article>
        <article>
          <h3>横書きも判定</h3>
          <p>ページの文字方向を判定して横書き用のEPUB表現も出力します。横書きPDFについては現在、実ファイルでの検証範囲を広げています。</p>
        </article>
      </div>

      <section class="site-info-section" aria-labelledby="how-to-use-title">
        <h3 id="how-to-use-title">使い方</h3>
        <ol>
          <li>上の「PDFファイルを選ぶ」からファイルを選択します。</li>
          <li>「EPUBに変換」を押し、変換が完了するまでこのページを開いたまま待ちます。</li>
          <li>表示された「EPUBを保存」ボタンから端末へ保存します。</li>
        </ol>
      </section>

      <section class="site-info-section" aria-labelledby="supported-pdf-title">
        <h3 id="supported-pdf-title">変換に向いているPDF</h3>
        <p>本文が画像ではなく文字として格納され、文章の行や列が比較的規則的なPDFに向いています。スキャン画像だけのPDFは文字認識を行わないため、本文をテキストのEPUBとして再構成できません。複雑な図版中心の資料や特殊な組版では、元の見た目をそのまま再現できない場合があります。</p>
        <p><a href="./guide/pdf-to-epub/">PDFからEPUBへ変換するときの詳しい注意点</a></p>
      </section>

      <section class="site-info-section" aria-labelledby="after-convert-title">
        <h3 id="after-convert-title">変換したEPUBを読む</h3>
        <div class="guide-links">
          <a href="./guide/kindle-epub/">Kindleで読む</a>
          <a href="./guide/iphone-ipad/">iPhone / iPadで読む</a>
          <a href="./guide/android/">Androidで読む</a>
          <a href="./guide/windows-mac/">Windows / Macで読む</a>
          <a href="./guide/epub-apps/">EPUBアプリを選ぶ</a>
          <a href="./guide/troubleshooting/">表示が崩れたときの確認</a>
        </div>
      </section>

      <section class="site-info-section" aria-labelledby="faq-title">
        <h3 id="faq-title">よくある質問</h3>
        <details>
          <summary>PDFはサーバーへアップロードされますか？</summary>
          <p>変換処理のためにPDF本文をFileShapeのサーバーへ送信する設計にはしていません。ブラウザ内で解析・変換します。</p>
        </details>
        <details>
          <summary>横書きPDFも変換できますか？</summary>
          <p>横書き判定と横書きEPUB出力の処理は実装されています。現在は縦書きPDFを中心に検証しており、横書きについても検証範囲を広げています。</p>
        </details>
        <details>
          <summary>スキャンした本のPDFも変換できますか？</summary>
          <p>画像だけで構成されたPDFには現在対応していません。文字として格納されたPDFが対象です。</p>
        </details>
      </section>

      <p class="site-info-more"><a href="./guide/">PDF・EPUBガイドをすべて見る</a></p>
    </section>
  `);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountSiteInfo, { once: true });
} else {
  mountSiteInfo();
}
