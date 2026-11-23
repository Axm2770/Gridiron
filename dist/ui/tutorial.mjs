// Tutorials and in-game help: guided tours that ring real interface elements with a pixel pointer
// and show a small pixel diagram where it helps, a Help & tutorials centre (the ? button) with
// progress and replay, the Gridiron Guide (guide.mjs), per-screen help, glossary tooltips, one
// gentle first-run welcome and a dismissible "First time here?" chip on screens not yet toured.
// Progress is stored per device, so saves are never touched.
import { TOURS, SCREEN_HELP, GLOSSARY } from "./tutorial-content.mjs";
import { GUIDE_CHAPTERS, ROUTE_CHAPTER } from "./guide-content.mjs";
import { art } from "./guide-art.mjs";
import { installGuide } from "./guide.mjs";

const KEY = "gridiron-tutorials";
const escape = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// { completed: {tourId: date}, step: {tourId: furthest step}, welcomed, tips (glossary tooltips),
//   hints ("First time here?" chips), dismissed: {route: 1} }
export function loadProgress() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { completed: v.completed || {}, step: v.step || {}, welcomed: !!v.welcomed, tips: v.tips !== false, hints: v.hints !== false, dismissed: v.dismissed || {} };
  } catch {
    return { completed: {}, step: {}, welcomed: false, tips: true, hints: true, dismissed: {} };
  }
}
function saveProgress(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}
export function tourProgress(p = loadProgress()) {
  return TOURS.map((t) => ({
    id: t.id,
    title: t.title,
    done: !!p.completed[t.id],
    reached: p.completed[t.id] ? t.steps.length : Math.min(p.step[t.id] || 0, t.steps.length),
    total: t.steps.length,
  }));
}
// The tour a "First time here?" chip offers on a route, or null: only for screens with a tour the
// player hasn't started, after the welcome, and not dismissed there.
export function chipTour(route, p = loadProgress()) {
  const id = SCREEN_HELP[route]?.tour;
  if (!id || !p.welcomed || !p.hints || p.dismissed[route] || p.completed[id] || p.step[id]) return null;
  return TOURS.find((t) => t.id === id) || null;
}
// The screen a step runs on: its own route, else the nearest earlier step's (so Back works).
export function stepRoute(tour, index) {
  for (let i = index; i >= 0; i--) if (tour.steps[i].route) return { route: tour.steps[i].route, tab: tour.steps[i].tab };
  return null;
}

const visible = (el) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== "hidden";
};
function findTarget(target) {
  for (const sel of [].concat(target || [])) {
    let list = [];
    try {
      list = [...document.querySelectorAll(sel)];
    } catch {}
    const el = list.find(visible);
    if (el) return el;
  }
  return null;
}

// A chunky pixel arrow; rotated by CSS to point at the target.
const POINTER = `<svg viewBox="0 0 11 9" shape-rendering="crispEdges" aria-hidden="true"><path fill="var(--px-ink, #05070d)" d="M5 0h2v1h1v1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1v1h-2v-2h-5v-5h5z"/><path fill="var(--gd-accent)" d="M6 1h1v1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1v-2h-5v-3h5z"/></svg>`;

export function installTutorials({ getSection, isBusy = () => false }) {
  let active = null; // { tour, index }
  let layer = null;
  let clickHandler = null;
  const guide = installGuide();

  // An open <dialog> sits in the browser's top layer and makes the rest of the page inert, so
  // while one is open the tour layer lives inside it to stay visible and clickable.
  function host() {
    return document.querySelector("dialog[open]") || document.body;
  }
  function ensureLayer() {
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "tour-layer";
      layer.innerHTML = `<div class="tour-spotlight" aria-hidden="true"></div><div class="tour-pointer" aria-hidden="true">${POINTER}</div><div class="tour-card" role="dialog" aria-modal="false" aria-labelledby="tour-title"></div>`;
    }
    const h = host();
    if (layer.parentNode !== h) h.appendChild(layer);
    return layer;
  }
  document.getElementById("modal")?.addEventListener("close", () => {
    if (!active || !layer) return;
    ensureLayer();
    const step = active.tour.steps[active.index];
    place(step.target ? findTarget(step.target) : null);
  });

  function place(el) {
    // Re-positioning is queued (animation frames, resize, dialog close) and can land after a
    // tour ends or before its first card exists.
    if (!layer || !active) return;
    const spot = layer.querySelector(".tour-spotlight"),
      pointer = layer.querySelector(".tour-pointer"),
      card = layer.querySelector(".tour-card");
    const vw = window.innerWidth,
      vh = window.innerHeight,
      narrow = vw <= 640;
    if (!el) {
      spot.style.cssText = "display:none";
      pointer.style.cssText = "display:none";
      layer.classList.add("tour-centered");
      card.style.cssText = "";
      return;
    }
    layer.classList.remove("tour-centered");
    const r = el.getBoundingClientRect(),
      pad = 6,
      top = Math.max(4, r.top - pad),
      left = Math.max(4, r.left - pad),
      width = Math.max(8, Math.min(vw - left - 4, r.width + pad * 2)),
      height = Math.max(8, Math.min(vh - top - 4, r.height + pad * 2));
    spot.style.cssText = `display:block;top:${top}px;left:${left}px;width:${width}px;height:${height}px`;
    // Card beside the target where it fits: right, left, below, above, else bottom-centre. The
    // pointer sits in the gap and points at the ring.
    const gap = 30,
      cw = Math.min(360, vw - 32),
      ch = card.offsetHeight || 260;
    let x, y, dir;
    const midY = Math.min(Math.max(top + height / 2, 24), vh - 24),
      midX = Math.min(Math.max(left + width / 2, 24), vw - 24);
    if (narrow) {
      // Phones: the card docks to the bottom (CSS); the pointer points down at the target if it
      // is above the card, else it hides.
      x = 16;
      y = vh - ch - 16;
      dir = top + height < y - gap ? "down" : null;
    } else if (left + width + gap + cw < vw - 8 && height < vh * 0.8) {
      x = left + width + gap;
      y = Math.min(Math.max(16, midY - ch / 2), vh - ch - 16);
      dir = "left";
    } else if (left - gap - cw > 8 && height < vh * 0.8) {
      x = left - gap - cw;
      y = Math.min(Math.max(16, midY - ch / 2), vh - ch - 16);
      dir = "right";
    } else if (top + height + gap + ch < vh) {
      x = Math.min(Math.max(16, midX - cw / 2), vw - cw - 16);
      y = top + height + gap;
      dir = "up";
    } else if (top - gap - ch > 0) {
      x = Math.min(Math.max(16, midX - cw / 2), vw - cw - 16);
      y = top - gap - ch;
      dir = "down";
    } else {
      // A big target (a whole board): dock the card to the viewport edge with the most room
      // beside it, overlapping the target's edge rather than its middle.
      const roomR = vw - (left + width),
        roomL = left;
      x = roomR >= roomL ? vw - cw - 16 : 16;
      y = Math.min(Math.max(16, midY - ch / 2), vh - ch - 16);
      dir = null;
    }
    card.style.cssText = narrow ? "" : `left:${x}px;top:${y}px;width:${cw}px`;
    const P = 32; // pointer box
    const at = {
      left: [left + width + 2, midY - P / 2],
      right: [left - P - 2, midY - P / 2],
      up: [midX - P / 2, top + height + 2],
      down: [midX - P / 2, Math.max(4, top - P - 2)],
    }[dir];
    pointer.style.cssText = at ? `display:block;left:${at[0]}px;top:${at[1]}px` : "display:none";
    pointer.dataset.dir = dir || "";
  }

  function detachClick() {
    if (clickHandler) document.removeEventListener("click", clickHandler, true);
    clickHandler = null;
  }

  // Older screens (Matchday, Tactics, Media room) are views of their own rather than sections.
  const currentRoute = () => {
    const v = typeof view !== "undefined" ? view : null;
    return v && v !== "Franchise" ? v : getSection?.() || "Overview";
  };

  async function show() {
    if (!active) return;
    const { tour, index } = active,
      step = tour.steps[index],
      where = stepRoute(tour, index);
    detachClick();
    // A step's own route always opens; an inherited one only when the player has wandered off
    // (Back after a later step moved screens).
    if (where && (step.route || where.route !== currentRoute())) {
      // A profile or dialog opened during an earlier step closes when the tour moves screens.
      if (document.getElementById("modal")?.open) window.closeModal?.();
      if (where.route !== currentRoute() || step.tab) window.W?.open(where.route, step.tab ?? where.tab);
      await new Promise((r) => setTimeout(r, 220));
      if (!active || active.index !== index) return;
    }
    if (step.prepare) {
      try {
        step.prepare();
      } catch {}
      await new Promise((r) => setTimeout(r, 160));
      if (!active || active.index !== index) return;
    }
    ensureLayer();
    const el = step.target ? findTarget(step.target) : null;
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    const last = index === tour.steps.length - 1,
      n = tour.steps.length,
      blocks = tour.steps.map((_, i) => `<i class="${i < index ? "done" : i === index ? "now" : ""}"></i>`).join(""),
      chapter = step.guide && GUIDE_CHAPTERS.find((c) => c.id === step.guide);
    layer.querySelector(".tour-card").innerHTML = `<div class="tour-meta"><span>${escape(tour.title)}</span><span>${index + 1} / ${n}</span></div>${step.art ? `<div class="tour-art">${art(step.art)}</div>` : ""}<h2 id="tour-title">${escape(step.title)}</h2><p>${escape(step.body)}</p>${el && step.click ? `<p class="tour-hint">Click the highlighted item to try it.</p>` : ""}${chapter ? `<button type="button" class="link tour-more" onclick="Tutorial.readMore('${chapter.id}')">Read more in the guide: ${escape(chapter.title)} →</button>` : ""}<div class="tour-progress" aria-hidden="true">${blocks}</div><div class="tour-actions"><button class="secondary small" onclick="Tutorial.stop()">${last ? "Close" : "Skip tour"}</button><span></span>${index ? `<button class="secondary small" onclick="Tutorial.prev()" aria-label="Previous step">←</button>` : ""}<button class="small" onclick="Tutorial.next()">${last ? "Finish" : "Next →"}</button></div>`;
    place(el);
    // Re-place after layout settles (fonts, the card's own height).
    requestAnimationFrame(() => active && place(step.target ? findTarget(step.target) : null));
    if (el && step.click) {
      clickHandler = (e) => {
        if (el.contains(e.target)) {
          detachClick();
          setTimeout(() => active && api.next(), 350);
        }
      };
      document.addEventListener("click", clickHandler, true);
    }
    const p = loadProgress();
    p.step[tour.id] = Math.max(p.step[tour.id] || 0, index + 1);
    saveProgress(p);
    layer.querySelector(".tour-actions button:last-child")?.focus({ preventScroll: true });
  }

  function finish(completed) {
    if (!active) return;
    const id = active.tour.id;
    detachClick();
    active = null;
    layer?.remove();
    layer = null;
    if (completed) {
      const p = loadProgress();
      p.completed[id] = new Date().toISOString().slice(0, 10);
      saveProgress(p);
      const next = TOURS.find((t) => !p.completed[t.id]);
      window.toast?.(next ? `Tour complete. Next up: ${next.title} (? → Help & tutorials).` : "All tours complete. The Gridiron Guide (?) has the details.");
    }
    window.render?.();
  }

  function annotateGlossary(root = document.getElementById("app")) {
    if (!root || !loadProgress().tips) return;
    const terms = new Map(Object.entries(GLOSSARY).map(([k, v]) => [k.toLowerCase(), v]));
    root.querySelectorAll("th, dt, small, h3, .eyebrow, label, .gd-stat span, .hub-health-row span").forEach((el) => {
      if (el.dataset.glossary || el.children.length) return;
      const text = el.textContent.trim().toLowerCase();
      const tip = terms.get(text);
      if (!tip) return;
      el.dataset.glossary = "1";
      el.classList.add("glossary-term");
      el.setAttribute("title", tip);
      el.setAttribute("tabindex", "0");
    });
  }

  // "First time here?" beside the ? button on screens with a tour the player hasn't started.
  function addChip() {
    const box = document.querySelector("#app .title-row .page-context");
    if (!box || box.querySelector(".tour-chip") || active) return;
    const route = currentRoute(),
      tour = chipTour(route);
    if (!tour) return;
    box.insertAdjacentHTML(
      "afterbegin",
      `<span class="tour-chip" role="group" aria-label="Tour for this screen"><button type="button" class="tour-chip-go" onclick="Tutorial.start('${tour.id}')" title="${escape(tour.summary)}"><i aria-hidden="true">▶</i><span>First time here? <b>${tour.minutes}-min tour</b></span></button><button type="button" class="tour-chip-x" onclick="Tutorial.dismiss('${escape(route).replace(/'/g, "\\'")}')" aria-label="Hide the tour suggestion for this screen" title="Not now">×</button></span>`,
    );
  }

  function helpCentre(tab = "Tours") {
    const progress = tourProgress(),
      section = currentRoute(),
      label = document.querySelector("#app .title-row h1")?.textContent?.trim() || section,
      help = SCREEN_HELP[section],
      chapter = GUIDE_CHAPTERS.find((c) => c.id === ROUTE_CHAPTER[section]),
      done = progress.filter((t) => t.done).length;
    const tours = TOURS.map((t, i) => {
      const pr = progress[i],
        blocks = t.steps.map((_, k) => `<i class="${k < pr.reached ? "on" : ""}"></i>`).join("");
      return `<li class="help-tour ${pr.done ? "done" : ""}"><div><b>${escape(t.title)}</b><small>${escape(t.summary)}</small><span class="help-tour-meta"><span class="help-blocks" aria-hidden="true">${blocks}</span>${pr.done ? "✓ Completed" : pr.reached ? `${pr.reached} of ${pr.total} steps` : `${t.steps.length} steps · ${t.minutes} min`}</span></div><button class="${pr.done ? "secondary " : ""}small" onclick="Tutorial.start('${t.id}')">${pr.done ? "Replay" : pr.reached ? "Resume" : "Start"}</button></li>`;
    }).join("");
    const glossary = Object.entries(GLOSSARY)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`)
      .join("");
    const tabs = ["Tours", "This screen", "Glossary"]
      .map((t) => `<button class="${t === tab ? "active" : ""}" role="tab" aria-selected="${t === tab}" onclick="Tutorial.help('${t}')">${t}</button>`)
      .join("");
    const guideBanner = `<button type="button" class="help-guide" onclick="Guide.open()"><span class="help-guide-art">${art("trophy")}</span><span><b>The Gridiron Guide</b><small>${GUIDE_CHAPTERS.length} illustrated chapters: the calendar, simulation, the cap, trades, the draft, morale, the board and more.</small></span><span class="help-guide-go">Open →</span></button>`;
    const body =
      tab === "Glossary"
        ? `<dl class="help-glossary">${glossary}</dl><p class="subtitle">Underlined labels around the game show these definitions when you hover or focus them.</p>`
        : tab === "This screen"
          ? `<div class="help-screen"><h3>${escape(label)}</h3><p>${escape(help?.text || "Use the sidebar or Ctrl+K search to move between screens; the breadcrumb and ← Back retrace your steps.")}</p><div class="help-screen-actions">${help?.tour ? `<button class="small" onclick="Tutorial.start('${help.tour}')">▶ Show me around</button>` : ""}${chapter ? `<button class="secondary small" onclick="Guide.open('${chapter.id}')">Read: ${escape(chapter.title)}</button>` : ""}</div><h3>Getting around</h3><ul><li><b>Sidebar</b>: every area of the club.</li><li><b>Search</b> (Ctrl+K / ⌘K): any player, screen, action or guide chapter.</li><li><b>← Back</b> (Alt+←): the previous screen.</li><li><b>Continue</b>: the next game or decision.</li></ul></div>`
          : `${guideBanner}<p class="help-intro">Short guided tours point at the real screens. ${done}/${TOURS.length} completed.</p><ul class="help-tours">${tours}</ul>`;
    const p = loadProgress();
    window.modal(
      `<div class="help-centre"><div class="help-head"><div><div class="eyebrow">HELP & TUTORIALS</div><h2>Learn the game</h2></div><button class="icon-button" onclick="closeModal()" aria-label="Close help">×</button></div><div class="segmented help-tabs" role="tablist">${tabs}</div>${body}<div class="modal-actions"><label class="help-tips"><input type="checkbox" ${p.tips ? "checked" : ""} onchange="Tutorial.tips(this.checked)"> Glossary tooltips</label><label class="help-tips"><input type="checkbox" ${p.hints ? "checked" : ""} onchange="Tutorial.hints(this.checked)"> “First time here?” tips</label><button class="secondary small" onclick="Tutorial.reset()">Reset progress</button><button onclick="closeModal()">Close</button></div></div>`,
    );
  }

  const api = {
    tours: TOURS,
    start(id) {
      const tour = TOURS.find((t) => t.id === id);
      if (!tour) return;
      if (isBusy()) {
        window.toast?.("Finish the current simulation before starting a tour.");
        return;
      }
      window.closeModal?.();
      document.querySelectorAll(".tour-chip").forEach((c) => c.remove());
      // Resume where the player left off, unless the tour was finished (then replay from the top).
      const p = loadProgress(),
        at = p.completed[id] ? 0 : Math.min(Math.max((p.step[id] || 1) - 1, 0), tour.steps.length - 1);
      active = { tour, index: at };
      show();
    },
    next() {
      if (!active) return;
      if (active.index >= active.tour.steps.length - 1) return finish(true);
      active.index++;
      show();
    },
    prev() {
      if (!active || !active.index) return;
      active.index--;
      show();
    },
    stop() {
      if (!active) return;
      finish(active.index >= active.tour.steps.length - 1);
    },
    // "Read more": leave the tour (keeping progress) and open the guide chapter.
    readMore(id) {
      if (active) finish(active.index >= active.tour.steps.length - 1);
      guide.open(id);
    },
    active: () => (active ? { id: active.tour.id, index: active.index } : null),
    help: helpCentre,
    guide: (id) => guide.open(id),
    tips(on) {
      const p = loadProgress();
      p.tips = !!on;
      saveProgress(p);
      if (!on)
        document.querySelectorAll(".glossary-term").forEach((el) => {
          el.classList.remove("glossary-term");
          el.removeAttribute("title");
          el.removeAttribute("tabindex");
          delete el.dataset.glossary;
        });
      else annotateGlossary();
    },
    hints(on) {
      const p = loadProgress();
      p.hints = !!on;
      saveProgress(p);
      if (!on) document.querySelectorAll(".tour-chip").forEach((c) => c.remove());
    },
    dismiss(route) {
      const p = loadProgress();
      p.dismissed[route] = 1;
      saveProgress(p);
      document.querySelectorAll(".tour-chip").forEach((c) => c.remove());
    },
    reset() {
      const p = loadProgress();
      saveProgress({ completed: {}, step: {}, welcomed: false, tips: p.tips, hints: true, dismissed: {} });
      helpCentre("Tours");
    },
    welcome() {
      const p = loadProgress();
      p.welcomed = true;
      saveProgress(p);
      const first = TOURS[0];
      window.modal(
        `<div class="help-welcome"><div class="eyebrow">WELCOME, COACH</div><h2>Want a quick tour?</h2><div class="help-welcome-art">${art("welcome")}</div><p>${first.steps.length} short steps walk you through your first week: the overview, an inbox decision, your lineup, the game plan and matchday.</p><p class="help-welcome-small">Replay it, or try the topic tours and the illustrated Gridiron Guide, any time from the <b>?</b> button.</p><div class="modal-actions"><button class="secondary" onclick="closeModal()">Skip</button><button onclick="Tutorial.start('${first.id}')">▶ Show me</button></div></div>`,
      );
    },
    // Dev check: walk every step and report targets that don't resolve on the current markup.
    async audit({ tours = TOURS } = {}) {
      const missing = [];
      for (const tour of tours)
        for (const [i, step] of tour.steps.entries()) {
          const where = stepRoute(tour, i);
          if (where && (step.route || where.route !== currentRoute())) {
            window.closeModal?.();
            window.W?.open(where.route, step.tab ?? where.tab);
            await new Promise((r) => setTimeout(r, 400));
          }
          if (step.prepare) {
            try {
              step.prepare();
            } catch {}
            await new Promise((r) => setTimeout(r, 250));
          }
          if (step.target) {
            const sels = [].concat(step.target),
              hit = sels.findIndex((s) => findTarget(s));
            if (hit) missing.push({ tour: tour.id, step: i, title: step.title, hit, targets: sels });
          }
        }
      return missing;
    },
    annotate: annotateGlossary,
  };
  window.Tutorial = api;

  // The ? button on every screen opens the help centre on this screen's help.
  if (window.W) {
    window.W.help = () => helpCentre(SCREEN_HELP[currentRoute()] ? "This screen" : "Tours");
    window.W.guide = (id) => guide.open(id);
  }

  addEventListener("keydown", (e) => {
    if (!active) return;
    if (e.key === "Escape") api.stop();
    else if (e.key === "ArrowRight" && !/input|textarea|select/i.test(e.target.tagName)) api.next();
    else if (e.key === "ArrowLeft" && !/input|textarea|select/i.test(e.target.tagName)) api.prev();
  });
  addEventListener("resize", () => active && place(findTarget(active.tour.steps[active.index].target)));

  // The welcome waits for any cutscene (a new coach arrives on a new career) and dialog to finish.
  let welcomeTimer = null;
  function offerWelcome(tries = 0) {
    if (welcomeTimer) return;
    welcomeTimer = setTimeout(() => {
      welcomeTimer = null;
      if (loadProgress().welcomed || active) return;
      const blocked = document.getElementById("modal")?.open || document.querySelector(".gd-cine, .px-scene") || isBusy();
      if (blocked) return tries < 120 && offerWelcome(tries + 1);
      api.welcome();
    }, tries ? 1000 : 600);
  }
  const previousRender = window.render;
  if (typeof previousRender === "function") {
    window.render = render = function () {
      previousRender.apply(this, arguments);
      annotateGlossary();
      // First run on this device: offer the first-week tour once a career is open on the overview.
      const p = loadProgress();
      // `state` is the game's script-scope global (game.js), not a window property.
      const career = typeof state !== "undefined" && state?.franchise;
      if (!p.welcomed && !active && career && getSection?.() === "Overview" && !document.getElementById("modal")?.open && !isBusy())
        offerWelcome();
      if (career && !isBusy()) addChip();
      if (active) {
        const step = active.tour.steps[active.index];
        requestAnimationFrame(() => {
          if (!active) return;
          ensureLayer();
          place(step.target ? findTarget(step.target) : null);
        });
      }
    };
  }
  return api;
}
