// Tutorials and in-game help: guided tours that highlight real interface elements, a Help &
// tutorials centre (the ? button) with progress and replay, per-screen help, glossary tooltips
// and a first-run welcome. Progress is stored per device, so saves are never touched.
import { TOURS, SCREEN_HELP, GLOSSARY } from "./tutorial-content.mjs";

const KEY = "gridiron-tutorials";
const escape = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function loadProgress() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { completed: v.completed || {}, step: v.step || {}, welcomed: !!v.welcomed, tips: v.tips !== false };
  } catch {
    return { completed: {}, step: {}, welcomed: false, tips: true };
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

export function installTutorials({ getSection, isBusy = () => false }) {
  let active = null; // { tour, index }
  let layer = null;
  let clickHandler = null;

  // An open <dialog> sits in the browser's top layer and makes the rest of the page inert, so
  // while one is open the tour layer lives inside it to stay visible and clickable.
  function host() {
    return document.querySelector("dialog[open]") || document.body;
  }
  function ensureLayer() {
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "tour-layer";
      layer.innerHTML = `<div class="tour-spotlight" aria-hidden="true"></div><div class="tour-card" role="dialog" aria-modal="false" aria-labelledby="tour-title"></div>`;
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
      card = layer.querySelector(".tour-card");
    const vw = window.innerWidth,
      vh = window.innerHeight;
    if (!el) {
      spot.style.cssText = "display:none";
      layer.classList.add("tour-centered");
      card.style.cssText = "";
      return;
    }
    layer.classList.remove("tour-centered");
    const r = el.getBoundingClientRect(),
      pad = 6,
      top = Math.max(4, r.top - pad),
      left = Math.max(4, r.left - pad),
      width = Math.min(vw - left - 4, r.width + pad * 2),
      height = Math.min(vh - top - 4, r.height + pad * 2);
    spot.style.cssText = `display:block;top:${top}px;left:${left}px;width:${width}px;height:${height}px`;
    // Card beside the target where it fits: right, below, above, else bottom-centre.
    const cw = Math.min(360, vw - 32),
      ch = card.offsetHeight || 220;
    let x, y;
    if (left + width + 16 + cw < vw && height < vh * 0.7) {
      x = left + width + 16;
      y = Math.min(Math.max(16, top), vh - ch - 16);
    } else if (top + height + 16 + ch < vh) {
      x = Math.min(Math.max(16, left), vw - cw - 16);
      y = top + height + 16;
    } else if (top - 16 - ch > 0) {
      x = Math.min(Math.max(16, left), vw - cw - 16);
      y = top - 16 - ch;
    } else {
      x = (vw - cw) / 2;
      y = vh - ch - 24;
    }
    card.style.cssText = `left:${x}px;top:${y}px;width:${cw}px`;
  }

  function detachClick() {
    if (clickHandler) document.removeEventListener("click", clickHandler, true);
    clickHandler = null;
  }

  async function show() {
    if (!active) return;
    const { tour, index } = active,
      step = tour.steps[index];
    detachClick();
    if (step.route) {
      // A profile or dialog opened during an earlier step closes when the tour moves screens.
      if (document.getElementById("modal")?.open) window.closeModal?.();
      if (step.route !== getSection() || step.tab) window.W?.open(step.route, step.tab);
      await new Promise((r) => setTimeout(r, 220));
      if (!active || active.index !== index) return;
    }
    if (step.prepare) {
      try {
        step.prepare();
      } catch {}
      await new Promise((r) => setTimeout(r, 120));
      if (!active || active.index !== index) return;
    }
    ensureLayer();
    const el = step.target ? findTarget(step.target) : null;
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    const last = index === tour.steps.length - 1;
    layer.querySelector(".tour-card").innerHTML = `<div class="tour-meta"><span>${escape(tour.title)}</span><span>${index + 1} / ${tour.steps.length}</span></div><h2 id="tour-title">${escape(step.title)}</h2><p>${escape(step.body)}</p>${el && step.click ? `<p class="tour-hint">Click the highlighted item to try it.</p>` : ""}<div class="tour-progress" aria-hidden="true"><i style="width:${((index + 1) / tour.steps.length) * 100}%"></i></div><div class="tour-actions"><button class="secondary small" onclick="Tutorial.stop()">${last ? "Close" : "Exit tour"}</button><span></span>${index ? `<button class="secondary small" onclick="Tutorial.prev()">Back</button>` : ""}<button class="small" onclick="Tutorial.next()">${last ? "Finish" : "Next"}</button></div>`;
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
      window.toast?.(next ? `Tour complete. Next up: ${next.title} (? → Help & tutorials).` : "All tours complete.");
    }
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

  // Older screens (Matchday, Tactics, Media room) are views of their own rather than sections.
  const currentRoute = () => {
    const v = typeof view !== "undefined" ? view : null;
    return v && v !== "Franchise" ? v : getSection?.() || "Overview";
  };
  function helpCentre(tab = "Tours") {
    const progress = tourProgress(),
      section = currentRoute(),
      label = document.querySelector("#app .title-row h1")?.textContent?.trim() || section,
      help = SCREEN_HELP[section],
      done = progress.filter((t) => t.done).length;
    const tours = TOURS.map((t, i) => {
      const pr = progress[i];
      return `<li class="help-tour ${pr.done ? "done" : ""}"><div><b>${escape(t.title)}</b><small>${escape(t.summary)}</small><span class="help-tour-meta">${pr.done ? "✓ Completed" : pr.reached ? `${pr.reached} of ${pr.total} steps seen` : `${t.steps.length} steps · about ${t.minutes} min`}</span></div><button class="${pr.done ? "secondary " : ""}small" onclick="Tutorial.start('${t.id}')">${pr.done ? "Replay" : pr.reached ? "Resume" : "Start"}</button></li>`;
    }).join("");
    const glossary = Object.entries(GLOSSARY)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`)
      .join("");
    const tabs = ["Tours", "This screen", "Glossary"]
      .map((t) => `<button class="${t === tab ? "active" : ""}" role="tab" aria-selected="${t === tab}" onclick="Tutorial.help('${t}')">${t}</button>`)
      .join("");
    const body =
      tab === "Glossary"
        ? `<dl class="help-glossary">${glossary}</dl><p class="subtitle">Underlined labels around the game show these definitions when you hover or focus them.</p>`
        : tab === "This screen"
          ? `<div class="help-screen"><h3>${escape(label)}</h3><p>${escape(help?.text || "Use the sidebar to move between areas and the Jump to links under each title for related screens.")}</p>${help?.tour ? `<button class="small" onclick="Tutorial.start('${help.tour}')">Walk me through it</button>` : ""}<h3>Getting around</h3><ul><li><b>Sidebar</b>: every area of the club.</li><li><b>Search</b> (Ctrl+K / ⌘K): any player, screen or action.</li><li><b>← Back</b> (Alt+←): the previous screen.</li><li><b>Continue</b>: the next game or decision.</li></ul></div>`
          : `<p class="help-intro">Short guided tours point at the real screens. ${done}/${TOURS.length} completed.</p><ul class="help-tours">${tours}</ul>`;
    window.modal(
      `<div class="help-centre"><div class="help-head"><div><div class="eyebrow">HELP & TUTORIALS</div><h2>Learn the game</h2></div><button class="icon-button" onclick="closeModal()" aria-label="Close help">×</button></div><div class="segmented help-tabs" role="tablist">${tabs}</div>${body}<div class="modal-actions"><label class="help-tips"><input type="checkbox" ${loadProgress().tips ? "checked" : ""} onchange="Tutorial.tips(this.checked)"> Show glossary tooltips</label><button class="secondary small" onclick="Tutorial.reset()">Reset progress</button><button onclick="closeModal()">Close</button></div></div>`,
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
      active = { tour, index: 0 };
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
    active: () => (active ? { id: active.tour.id, index: active.index } : null),
    help: helpCentre,
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
    reset() {
      const p = loadProgress();
      saveProgress({ completed: {}, step: {}, welcomed: false, tips: p.tips });
      helpCentre("Tours");
    },
    welcome() {
      const p = loadProgress();
      p.welcomed = true;
      saveProgress(p);
      window.modal(
        `<div class="help-welcome"><div class="eyebrow">WELCOME, COACH</div><h2>New to running a football club?</h2><p>A two-minute tour shows where everything is: your squad, the money, the transfer market and how the season moves forward. You can replay it, or try the others, any time from the <b>?</b> button.</p><div class="modal-actions"><button class="secondary" onclick="closeModal()">I know my way around</button><button onclick="Tutorial.start('basics')">Show me around</button></div></div>`,
      );
    },
    annotate: annotateGlossary,
  };
  window.Tutorial = api;

  // The ? button on every screen opens the help centre on this screen's help.
  if (window.W) window.W.help = () => helpCentre(SCREEN_HELP[currentRoute()] ? "This screen" : "Tours");

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
      // First run on this device: offer the basics tour once a career is open on the overview.
      const p = loadProgress();
      // `state` is the game's script-scope global (game.js), not a window property.
      const career = typeof state !== "undefined" && state?.franchise;
      if (!p.welcomed && !active && career && getSection?.() === "Overview" && !document.getElementById("modal")?.open && !isBusy())
        offerWelcome();
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
