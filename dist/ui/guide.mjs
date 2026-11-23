// The Gridiron Guide in game: a pixel handbook in the shared dialog. An index of chapter cards, a
// chapter view (hero picture, key-point cards, pro tips, "Where to find it" buttons), search
// across every chapter, and keyboard control (/ to search, ←/→ between chapters, Esc closes).
// Content is guide-content.mjs; pictures are guide-art.mjs; styles are guide.css (gg-*).
import { GUIDE_CHAPTERS, GUIDE_TITLE, GUIDE_INTRO, ROUTE_CHAPTER, searchGuide } from "./guide-content.mjs";
import { art } from "./guide-art.mjs";
import { pixelIcon } from "./pixel-icons.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const arg = (v) => esc(JSON.stringify(v));
const SEEN_KEY = "gridiron-guide-seen";
const num = (i) => String(i + 1).padStart(2, "0");

function seen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function markSeen(id) {
  try {
    const s = seen();
    s.add(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
  } catch {}
}

// Highlight query words inside already-escaped text.
function mark(textEsc, words) {
  if (!words.length) return textEsc;
  const re = new RegExp(`(${words.map((w) => esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return textEsc.replace(re, "<mark>$1</mark>");
}

export function installGuide() {
  let current = null, // chapter id or null for the index
    query = "";

  const dialog = () => document.getElementById("modal");
  const isOpen = () => !!dialog()?.open && !!dialog()?.querySelector(".gg");

  function rail() {
    const been = seen();
    return `<div class="gg-rail" role="navigation" aria-label="Chapters"><button type="button" class="gg-rail-item gg-rail-home ${current ? "" : "on"}" ${current ? "" : 'aria-current="page"'} onclick="Guide.open()"><b>${pixelIcon("league")}</b><span>All chapters</span></button><ol>${GUIDE_CHAPTERS.map(
      (c, i) =>
        `<li><button type="button" class="gg-rail-item ${current === c.id ? "on" : ""}" ${current === c.id ? 'aria-current="page"' : ""} onclick="Guide.open(${arg(c.id)})"><b>${num(i)}</b><span title="${esc(c.title)}">${esc(c.short || c.title)}</span>${been.has(c.id) ? '<i class="gg-tick" aria-label="Read">✓</i>' : ""}</button></li>`,
    ).join("")}</ol></div>`;
  }

  function indexView() {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean),
      hits = searchGuide(query),
      been = seen();
    if (!hits.length)
      return `<div class="gg-empty">${art("fog")}<p><b>Nothing matches “${esc(query)}”.</b> Try a shorter word, such as <i>cap</i>, <i>trade</i> or <i>draft</i>.</p><button type="button" class="secondary small" onclick="Guide.search('')">Clear search</button></div>`;
    const cards = hits
      .map(({ chapter: c, points }) => {
        const i = GUIDE_CHAPTERS.indexOf(c);
        const snippet = points.length
          ? `<ul class="gg-hits">${points
              .slice(0, 2)
              .map((p) => `<li><b>${mark(esc(p.title), words)}</b> ${mark(esc(p.text.length > 120 ? p.text.slice(0, 118) + "…" : p.text), words)}</li>`)
              .join("")}</ul>`
          : `<p>${mark(esc(c.lead), words)}</p>`;
        return `<li><button type="button" class="gg-card" onclick="Guide.open(${arg(c.id)})"><span class="gg-card-art">${art(c.hero.art)}</span><span class="gg-card-copy"><span class="gg-card-num">${pixelIcon(c.glyph)} Chapter ${num(i)}${been.has(c.id) ? ' <i class="gg-tick">✓ Read</i>' : ""}</span><b>${mark(esc(c.title), words)}</b>${snippet}</span></button></li>`;
      })
      .join("");
    return `${query ? `<p class="gg-intro">${hits.length} chapter${hits.length === 1 ? "" : "s"} mention “${esc(query)}”.</p>` : `<p class="gg-intro">${esc(GUIDE_INTRO)}</p>`}<ol class="gg-cards">${cards}</ol>`;
  }

  function chapterView(c) {
    const i = GUIDE_CHAPTERS.indexOf(c),
      prev = GUIDE_CHAPTERS[i - 1],
      next = GUIDE_CHAPTERS[i + 1],
      words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const where = c.where
      .map((w, k) => `<button type="button" class="${k ? "secondary " : ""}small gg-where" onclick="Guide.go(${arg(c.id)},${k})">${pixelIcon(c.glyph)}<span>${esc(w.label)}</span> →</button>`)
      .join("");
    const points = c.points
      .map(
        (p, k) =>
          `<li class="gg-point ${p.art ? "has-art" : ""}"><span class="gg-point-num" aria-hidden="true">${k + 1}</span><div><h4>${mark(esc(p.title), words)}</h4><p>${mark(esc(p.text), words)}</p></div>${p.art ? `<figure class="gg-point-art">${art(p.art)}</figure>` : ""}</li>`,
      )
      .join("");
    return `<article class="gg-chapter" aria-labelledby="gg-ch-title"><div class="gg-hero"><figure class="gg-hero-art">${art(c.hero.art)}</figure><div class="gg-hero-copy"><span class="gg-kicker">${pixelIcon(c.glyph)} Chapter ${num(i)} of ${GUIDE_CHAPTERS.length}</span><h3 id="gg-ch-title">${esc(c.title)}</h3><p class="gg-lead">${mark(esc(c.lead), words)}</p><div class="gg-where-row"><span>Where to find it</span>${where}</div></div></div><ol class="gg-points">${points}</ol><section class="gg-tips" aria-label="Pro tips"><h4>${pixelIcon("records")} Pro tips</h4><ul>${c.tips.map((t) => `<li>${mark(esc(t), words)}</li>`).join("")}</ul></section><div class="gg-pager" role="navigation" aria-label="Chapter navigation">${prev ? `<button type="button" class="secondary small" onclick="Guide.open(${arg(prev.id)})">← ${esc(prev.title)}</button>` : "<span></span>"}<button type="button" class="secondary small gg-pager-home" onclick="Guide.open()">All chapters</button>${next ? `<button type="button" class="small" onclick="Guide.open(${arg(next.id)})">${esc(next.title)} →</button>` : "<span></span>"}</div></article>`;
  }

  function mainHTML() {
    const c = current && GUIDE_CHAPTERS.find((x) => x.id === current);
    return c ? chapterView(c) : indexView();
  }

  function render({ focus = "search" } = {}) {
    const html = `<div class="gg" data-view="${current ? "chapter" : "index"}"><div class="gg-head"><span class="gg-badge" aria-hidden="true">${pixelIcon("records")}</span><div class="gg-title"><span class="gg-kicker">Handbook</span><h2>${esc(GUIDE_TITLE)}</h2></div><label class="gg-search"><span class="sr-only">Search the guide</span>${pixelIcon("scout")}<input type="search" value="${esc(query)}" placeholder="Search the guide…  ( / )" autocomplete="off" oninput="Guide.search(this.value, true)"></label><button type="button" class="icon-button" onclick="closeModal()" aria-label="Close the guide">×</button></div><div class="gg-body">${rail()}<div class="gg-main" aria-live="polite">${mainHTML()}</div></div></div>`;
    if (isOpen()) {
      const root = dialog().querySelector(".gg");
      root.dataset.view = current ? "chapter" : "index";
      root.querySelector(".gg-rail").outerHTML = rail();
      root.querySelector(".gg-main").innerHTML = mainHTML();
      root.querySelector(".gg-search input").value = query;
    } else window.modal(html);
    const d = dialog();
    d.classList.add("gg-dialog");
    if (focus === "search") d.querySelector(".gg-search input")?.focus({ preventScroll: true });
    else if (focus === "top") {
      d.scrollTop = 0;
      d.querySelector(".gg-main h3, .gg-main .gg-card")?.closest("article, li")?.querySelector("button, h3")?.focus?.({ preventScroll: true });
    }
  }

  const api = {
    chapters: GUIDE_CHAPTERS,
    // Open the index (no id) or a chapter. The guide replaces whatever dialog is open.
    open(id = null) {
      const chapter = id && GUIDE_CHAPTERS.find((c) => c.id === id);
      current = chapter ? chapter.id : null;
      if (!isOpen() || chapter) query = "";
      if (chapter) markSeen(chapter.id);
      render({ focus: isOpen() ? "top" : "search" });
      if (isOpen()) dialog().scrollTop = 0;
    },
    // The chapter for a route (the ? button), or the index.
    forRoute(route) {
      api.open(ROUTE_CHAPTER[route] || null);
    },
    search(q, typing = false) {
      query = String(q ?? "");
      if (typing && current) current = null; // searching shows matches across all chapters
      if (!isOpen()) return render();
      const root = dialog().querySelector(".gg");
      root.dataset.view = current ? "chapter" : "index";
      root.querySelector(".gg-main").innerHTML = mainHTML();
      root.querySelector(".gg-rail").outerHTML = rail();
      if (!typing) {
        const input = root.querySelector(".gg-search input");
        input.value = query;
        input.focus();
      }
    },
    // "Where to find it": close the guide and open the screen (and sub-tab) it describes.
    go(id, k = 0) {
      const w = GUIDE_CHAPTERS.find((c) => c.id === id)?.where[k];
      if (!w) return;
      window.closeModal?.();
      window.W?.open(w.route, w.tab);
      if (w.then) {
        const [obj, fn, ...args] = w.then;
        setTimeout(() => {
          try {
            window[obj]?.[fn]?.(...args);
          } catch {}
        }, 60);
      }
    },
    isOpen,
  };
  window.Guide = api;

  addEventListener("keydown", (e) => {
    if (!isOpen()) return;
    const typing = /input|textarea|select/i.test(e.target.tagName);
    if (e.key === "/" && !typing) {
      e.preventDefault();
      dialog().querySelector(".gg-search input")?.focus();
    } else if (!typing && current && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      const i = GUIDE_CHAPTERS.findIndex((c) => c.id === current),
        to = GUIDE_CHAPTERS[i + (e.key === "ArrowRight" ? 1 : -1)];
      if (to) {
        e.preventDefault();
        api.open(to.id);
      }
    } else if (typing && e.key === "Enter") {
      const first = searchGuide(query)[0];
      if (first && query) {
        e.preventDefault();
        query = "";
        api.open(first.chapter.id);
      }
    }
  });
  // The dialog is shared: drop the guide's frame class when something else opens in it.
  const d = dialog();
  if (d && !d.dataset.ggWatch) {
    d.dataset.ggWatch = "1";
    new MutationObserver(() => {
      if (!d.querySelector(":scope > .gg")) d.classList.remove("gg-dialog");
    }).observe(d, { childList: true });
    d.addEventListener("close", () => d.classList.remove("gg-dialog"));
  }
  return api;
}
