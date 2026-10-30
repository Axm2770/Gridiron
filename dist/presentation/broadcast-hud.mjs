// Broadcast HUD for the 3D match: TV scorebug, down-and-distance, big-play banners, replay
// wipe, and theater/fullscreen viewing. Pure presentation over state.live.
import { TEAM_COLORS } from "./team-colors.mjs";

const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ORD = ["", "1ST", "2ND", "3RD", "4TH"];

export function fieldPosition(m) {
  const spot = m.spot;
  if (spot === 50) return "MIDFIELD";
  const team = m.poss === 0 ? m.a : m.b,
    other = m.poss === 0 ? m.b : m.a;
  return spot < 50 ? `${clubs[team][0]} ${spot}` : `${clubs[other][0]} ${100 - spot}`;
}

export const clockText = (m) => `${Math.floor(m.clock / 60)}:${String(m.clock % 60).padStart(2, "0")}`;

// Which banner (if any) the latest play earns. Driven by the rules engine's result text.
export function bannerFor(m) {
  const text = m.last?.text || "";
  if (/TOUCHDOWN/.test(text)) return { label: "TOUCHDOWN", kind: "td" };
  if (/INTERCEPTED/.test(text)) return { label: "INTERCEPTION", kind: "turnover" };
  if (/SAFETY/.test(text)) return { label: "SAFETY", kind: "turnover" };
  if (/make a .*field goal/.test(text)) return { label: "FIELD GOAL", kind: "score" };
  if (/sacked/.test(text)) return { label: "SACK", kind: "defense" };
  if (/Turnover on downs/.test(text)) return { label: "TURNOVER ON DOWNS", kind: "turnover" };
  if (/First down/.test(text) && /\b([2-9]\d) yards/.test(text)) return { label: "BIG PLAY", kind: "score" };
  return null;
}

export function scorebug(m, { replay = false } = {}) {
  const team = (i) => {
    const id = i ? m.b : m.a;
    return `<div class="bh-team ${m.poss === i ? "bh-has-ball" : ""}" style="--tc:${TEAM_COLORS[id]}"><span class="bh-abbr">${e(clubs[id][0])}</span><b class="bh-score">${m.score[i]}</b><i class="bh-ball" aria-hidden="true"></i></div>`;
  };
  const period = m.finished ? "FINAL" : m.halftime ? "HALF" : m.quarter > 4 ? "OT" : `${ORD[m.quarter] || m.quarter}`;
  return `<div class="bh-bug" role="status" aria-label="${e(clubs[m.a][0])} ${m.score[0]}, ${e(clubs[m.b][0])} ${m.score[1]}, ${period} ${clockText(m)}">${team(0)}${team(1)}<div class="bh-clock"><span>${period}</span><b>${m.finished || m.halftime ? "" : clockText(m)}</b></div><div class="bh-dd">${m.finished || m.halftime ? "" : `${ORD[m.down] || ""} &amp; ${m.spot + m.toGo >= 100 ? "GOAL" : m.toGo}<small>${e(fieldPosition(m))}</small>`}</div></div><div class="bh-network"><b>GDN</b>${replay ? '<span class="bh-replay">REPLAY</span>' : '<span class="bh-live">LIVE</span>'}</div>`;
}

let lastBannerKey = null;

export function installBroadcastHUD() {
  if (typeof liveField !== "function") return false;
  const base = liveField;
  liveField = function (m) {
    let html = base(m);
    if (!html.includes('class="stadium-wrap"')) return html;
    const replay = !!window.GridironStadium?.replaying(),
      banner = bannerFor(m),
      key = `${state.year}:${state.week}:${m.plays}`,
      // state.live already holds the result while the play animates; wait so the banner never spoils it.
      fresh = banner && key !== lastBannerKey && !replay && !(typeof animating !== "undefined" && animating);
    if (fresh) lastBannerKey = key;
    const inPlay = typeof animating !== "undefined" && animating,
      shown = inPlay ? window.GridironStadium?.instance()?.action?.before ?? m : m,
      team = m.last?.poss === 1 ? m.b : m.a,
      overlay = `<div class="bh-overlay">${scorebug(shown, { replay })}${fresh ? `<div class="bh-banner bh-${banner.kind}" style="--tc:${TEAM_COLORS[team]}"><span>${e(banner.label)}</span><small>${e(clubs[team][2])}</small></div>` : ""}${replay ? `<div class="bh-wipe" style="--tc:${TEAM_COLORS[m.a]}"></div>` : ""}</div>`;
    const tools = `<button class="small secondary" onclick="BroadcastHUD.theater()" aria-pressed="${document.body.classList.contains("gd-theater")}">${document.body.classList.contains("gd-theater") ? "Exit theater" : "Theater"}</button><button class="small secondary" onclick="BroadcastHUD.fullscreen()">Fullscreen</button>`;
    return html.replace('<div id="stadium-host" class="stadium-host"></div>', `<div id="stadium-host" class="stadium-host"></div>${overlay}`).replace('<button class="link" onclick="toggleStadiumView()">', `${tools}<button class="link" onclick="toggleStadiumView()">`);
  };
  window.BroadcastHUD = {
    theater() {
      document.body.classList.toggle("gd-theater");
      try {
        localStorage.setItem("gridiron-theater", document.body.classList.contains("gd-theater") ? "1" : "0");
      } catch {}
      render();
    },
    fullscreen() {
      const wrap = document.querySelector(".stadium-wrap");
      if (!wrap) return;
      document.fullscreenElement ? document.exitFullscreen() : wrap.requestFullscreen?.().catch(() => toast("Fullscreen is not available here."));
    },
  };
  try {
    if (localStorage.getItem("gridiron-theater") === "1") document.body.classList.add("gd-theater");
  } catch {}
  return true;
}
