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
        <p>FileShapeは、PDFの文字や配置を読み取り、EPUBとして読みやすい形に組み直すブラウザツールです。日本語の縦書きPDFを中心に開発・検証しています。</p>
      </div>

      <div class="site-info-grid">
        <article>
          <h3>PDFは端末内で処理</h3>
          <p>PDF本文も生成したEPUBも、FileShapeのサーバーには送りません。変換はブラウザ内で行います。</p>
        </article>
        <article>
          <h3>縦書き・ルビを読み取り</h3>
          <p>PDFの配置情報をもとに、文字の向き、読む順番、段落、ルビ候補を組み直します。</p>
        </article>
        <article>
          <h3>横書きPDFも判定</h3>
          <p>横書きPDFを判定し、横書きのEPUBとして出力する処理も入っています。現在は、実際の横書きPDFを使って検証範囲を広げています。</p>
        </article>
      </div>

      <section class="site-info-section" aria-labelledby="how-to-use-title">
        <h3 id="how-to-use-title">使い方</h3>
        <ol>
          <li>上の「PDFを選ぶ」からファイルを選びます。</li>
          <li>「EPUBに変換」を押します。変換中は、このページを閉じずに待ちます。</li>
          <li>「EPUBを保存」が表示されたら、端末に保存します。</li>
        </ol>
      </section>

      <section class="site-info-section" aria-labelledby="supported-pdf-title">
        <h3 id="supported-pdf-title">変換しやすいPDF</h3>
        <p>文字を選択でき、行や列が比較的規則的に並んでいるPDFほど変換しやすくなります。スキャン画像だけのPDFにはOCRを行わないため、本文をテキストとして取り出せません。図版が多い資料や特殊な組版は、元の見た目をそのまま再現できないことがあります。</p>
        <p><a href="./guide/pdf-to-epub/">PDFからEPUBへ変換するときの注意点を詳しく見る</a></p>
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
          <p>いいえ。変換のためにPDF本文をFileShapeのサーバーへ送ることはありません。ブラウザ内で解析・変換します。</p>
        </details>
        <details>
          <summary>横書きPDFも変換できますか？</summary>
          <p>横書きの判定とEPUB出力には対応しています。ただし、現在の検証は縦書きPDFが中心です。横書きの実ファイル検証も進めています。</p>
        </details>
        <details>
          <summary>スキャンした本のPDFも変換できますか？</summary>
          <p>画像だけのPDFには対応していません。文字を選択できるPDFが対象です。</p>
        </details>
      </section>

      <p class="site-info-more"><a href="./guide/">ガイドをすべて見る</a></p>
    </section>
  `);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountSiteInfo, { once: true });
} else {
  mountSiteInfo();
}
