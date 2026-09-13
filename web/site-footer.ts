import "./footer.css";

function mountSiteFooter(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app || app.querySelector(".site-footer")) return;

  app.insertAdjacentHTML("beforeend", `
    <footer class="site-footer" aria-label="サイト情報">
      <nav class="site-footer-nav" aria-label="ガイド、ポリシーと運営情報">
        <a href="./guide/">ガイド</a>
        <a href="./about/">運営情報</a>
        <a href="./terms/">利用規約</a>
        <a href="./privacy/">プライバシー</a>
        <a href="./affiliate/">広告・アフィリエイト</a>
        <a href="./disclaimer/">免責事項</a>
        <a href="./contact/">お問い合わせ</a>
      </nav>
      <p>© FileShape</p>
    </footer>
  `);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountSiteFooter, { once: true });
} else {
  mountSiteFooter();
}
