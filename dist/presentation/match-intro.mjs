// Matchday intro: a short broadcast open before kickoff (venue and weather, the two teams with
// records, then kickoff). Shown once per fixture, skippable, and purely visual: it reads the live
// match and the standings and never writes state.
import { TEAM_COLORS } from "./team-colors.mjs";

const WEATHER = { Clear: ["☀", "Clear skies"], Rain: ["☂", "Rain in the forecast"], Wind: ["≋", "Swirling wind"] };
const seen = new Set();

export function introKey(m, s) {
  return [s.year, s.week, m.a, m.b].join(":");
}
const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Pure: everything the intro shows, from the live match and the career state.
export function introCard(m, s, clubList) {
  const team = (i, home) => {
    const t = s.teams?.[i] || {},
      record = `${t.w ?? 0}–${t.l ?? 0}${t.t ? "–" + t.t : ""}`;
    return { index: i, code: clubList[i][0], city: clubList[i][1], name: clubList[i][2], record, rating: t.rating ?? null, home, color: TEAM_COLORS[i] || "#3b6cc8", yours: i === s.team };
  };
  const venue = s.franchise?.clubs?.[m.a]?.stadium?.name || `${clubList[m.a][1]} Stadium`,
    [icon, weather] = WEATHER[m.weather || "Clear"] || WEATHER.Clear,
    week = s.phase === "playoffs" ? "PLAYOFFS" : `WEEK ${(s.week ?? 0) + 1}`;
  return { home: team(m.a, true), away: team(m.b, false), venue, city: clubList[m.a][1], weather, icon, week, season: s.year };
}

function logoSrc(code) {
  const c = code.toLowerCase();
  return `logos/${c === "was" ? "wsh" : c}.png`;
}
function teamBlock(t) {
  return `<div class="mi-team ${t.home ? "mi-home" : "mi-away"}" style="--tc:${t.color}"><img src="${logoSrc(t.code)}" alt="" onerror="this.remove()"><small>${t.home ? "HOME" : "AWAY"}${t.yours ? " · YOUR TEAM" : ""}</small><h2>${esc(t.city)}<b>${esc(t.name)}</b></h2><p><span>${esc(t.record)}</span>${t.rating ? `<span>${Math.round(t.rating)} OVR</span>` : ""}</p></div>`;
}
export function introHTML(card) {
  return `<div class="mi-stage" style="--home:${card.home.color};--away:${card.away.color}"><div class="mi-sweep"></div>
<section class="mi-scene mi-venue"><small>${card.season} · ${esc(card.week)}</small><h1>${esc(card.venue)}</h1><p>${esc(card.city)}</p><div class="mi-weather"><i aria-hidden="true">${card.icon}</i>${esc(card.weather)}</div></section>
<section class="mi-scene mi-matchup">${teamBlock(card.away)}<div class="mi-vs">AT</div>${teamBlock(card.home)}</section>
<section class="mi-scene mi-kickoff"><small>${esc(card.away.code)} AT ${esc(card.home.code)} · ${esc(card.weather.toUpperCase())}</small><h1>KICKOFF</h1></section>
<button class="mi-skip" type="button" onclick="window.skipMatchIntro()">Skip intro ›</button></div>`;
}

const CSS = `
.gd-match-intro{border:0;padding:0;margin:0;width:100vw;height:100vh;max-width:none;max-height:none;background:#05070d;color:#fff;overflow:hidden}
.gd-match-intro::backdrop{background:#05070d}
.gd-match-intro .mi-stage{position:relative;width:100%;height:100%;display:grid;place-items:center;background:radial-gradient(120% 90% at 50% 120%,color-mix(in srgb,var(--home) 55%,#05070d) 0%,#05070d 70%);font-family:'Barlow Condensed',Arial,sans-serif}
.gd-match-intro .mi-sweep{position:absolute;inset:-20%;background:linear-gradient(105deg,transparent 40%,color-mix(in srgb,var(--away) 60%,transparent) 50%,transparent 60%);animation:mi-sweep 7s linear both}
.gd-match-intro .mi-scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;opacity:0;text-align:center;padding:16px}
.gd-match-intro .mi-scene h1{margin:0;font-size:clamp(34px,7vw,92px);font-weight:900;letter-spacing:.02em;line-height:1;text-transform:uppercase}
.gd-match-intro .mi-scene small{letter-spacing:.3em;font-weight:700;color:#9fb3c8;font-size:clamp(11px,1.4vw,16px)}
.gd-match-intro .mi-venue{animation:mi-scene 2.4s .1s both}
.gd-match-intro .mi-venue p{margin:0;font-size:clamp(16px,2.4vw,26px);color:#cfd9e6}
.gd-match-intro .mi-weather{margin-top:10px;display:flex;gap:10px;align-items:center;padding:8px 16px;border:1px solid #ffffff33;border-radius:999px;font-size:clamp(14px,1.8vw,20px)}
.gd-match-intro .mi-weather i{font-style:normal;font-size:1.3em}
.gd-match-intro .mi-matchup{flex-direction:row;flex-wrap:wrap;gap:clamp(12px,4vw,60px);animation:mi-scene 2.8s 2.4s both}
.gd-match-intro .mi-team{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:min(42vw,280px);padding:clamp(12px,2vw,24px);border-top:6px solid var(--tc);background:linear-gradient(#ffffff10,#ffffff03)}
.gd-match-intro .mi-away{animation:mi-in-left .7s 2.5s both}.gd-match-intro .mi-home{animation:mi-in-right .7s 2.7s both}
.gd-match-intro .mi-team img{width:clamp(64px,10vw,120px);height:auto;filter:none!important;image-rendering:auto!important}
.gd-match-intro .mi-team h2{margin:0;display:flex;flex-direction:column;font-size:clamp(14px,1.8vw,20px);font-weight:600;color:#cfd9e6;text-transform:uppercase}
.gd-match-intro .mi-team h2 b{font-size:clamp(28px,4.4vw,56px);font-weight:900;color:#fff;line-height:1}
.gd-match-intro .mi-team p{margin:0;display:flex;gap:12px;font-size:clamp(14px,1.8vw,20px);font-weight:700}
.gd-match-intro .mi-team p span:first-child{color:#ffd34d}
.gd-match-intro .mi-vs{font-size:clamp(22px,3vw,36px);font-weight:900;color:#9fb3c8}
.gd-match-intro .mi-kickoff{animation:mi-scene 1.9s 5.2s both}
.gd-match-intro .mi-kickoff h1{font-size:clamp(48px,11vw,150px);background:linear-gradient(90deg,var(--away),#fff,var(--home));-webkit-background-clip:text;background-clip:text;color:transparent}
.gd-match-intro .mi-skip{position:absolute;right:16px;bottom:16px;z-index:2}
.gd-match-intro *{animation-timing-function:cubic-bezier(.2,.7,.2,1)!important;border-radius:0}
@keyframes mi-scene{0%{opacity:0;transform:scale(1.04)}12%{opacity:1;transform:none}85%{opacity:1}100%{opacity:0;transform:scale(.98)}}
@keyframes mi-in-left{from{opacity:0;transform:translateX(-60px)}}@keyframes mi-in-right{from{opacity:0;transform:translateX(60px)}}
@keyframes mi-sweep{from{transform:translateX(-60%)}to{transform:translateX(60%)}}
body.reduce-motion .gd-match-intro *{animation:none!important}
body.reduce-motion .gd-match-intro .mi-matchup{opacity:1}
@media (prefers-reduced-motion: reduce){.gd-match-intro *{animation:none!important}.gd-match-intro .mi-matchup{opacity:1}}
`;

let timer = null;
function close(dialog) {
  clearTimeout(timer);
  timer = null;
  if (dialog?.open) dialog.close();
  dialog?.remove();
}
// `state` and `clubs` are script-scoped globals of the classic game scripts, so callers pass them.
export function showMatchIntro(m, { s, clubList, duration = 7400 } = {}) {
  if (!s || !clubList) return false;
  const key = introKey(m, s);
  if (seen.has(key) || !globalThis.document) return false;
  seen.add(key);
  if (!document.getElementById("gd-match-intro-css")) {
    const style = document.createElement("style");
    style.id = "gd-match-intro-css";
    style.textContent = CSS;
    document.head.append(style);
  }
  const dialog = document.createElement("dialog");
  dialog.className = "gd-match-intro";
  dialog.setAttribute("aria-label", "Matchday intro");
  dialog.innerHTML = introHTML(introCard(m, s, clubList));
  document.body.append(dialog);
  // Open after the current render (and any pregame modal) so the intro sits on top of it.
  setTimeout(() => {
    try {
      dialog.showModal();
    } catch {
      dialog.setAttribute("open", "");
    }
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      close(dialog);
    });
    dialog.addEventListener("click", (e) => {
      if (!e.target.closest(".mi-skip")) close(dialog);
    });
    const still = document.body.classList.contains("reduce-motion") || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    timer = setTimeout(() => close(dialog), still ? 3500 : duration);
  }, 0);
  globalThis.window && (window.skipMatchIntro = () => close(dialog));
  return true;
}
