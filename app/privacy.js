(function () {
  let lang = "en";
  try { lang = localStorage.getItem("wr-lang") || (/^tr\b/i.test(navigator.language || "") ? "tr" : "en"); } catch (e) { lang = /^tr\b/i.test(navigator.language || "") ? "tr" : "en"; }
  const apply = () => {
    document.documentElement.lang = lang;
    document.title = lang === "tr" ? "Gizlilik · Move Recap" : "Privacy · Move Recap";
    document.querySelectorAll("[data-block]").forEach(el => (el.hidden = el.dataset.block !== lang));
    document.querySelectorAll(".lang button").forEach(b => b.setAttribute("aria-pressed", b.dataset.lang === lang));
  };
  document.querySelector(".lang").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; lang = b.dataset.lang; try { localStorage.setItem("wr-lang", lang); } catch (err) {} apply(); });
  apply();
})();
