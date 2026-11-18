// Ceremony screens (franchise/ceremonies.mjs): Draft room → Combine tab (sortable drill table with
// pixel bars, top performers, risers and fallers, position filter, your watchlist highlighted), the
// combine card on player profiles, "Honors night" trophy cards on Records → Awards and the Class of
// plaques on Records → Hall of Fame. View only; styles in ceremonies.css (loaded on install).
import * as C from "./ceremonies.mjs";
import { ensureCalendar, dayNumber } from "./calendar-core.mjs";
import { pixelFace } from "../ui/pixel-face.mjs";
import { installFeatureVisuals, awardsVisual } from "../presentation/ceremony-scenes.mjs";
import { pixelPortrait, PixelGrid } from "../presentation/pixel-art.mjs";

const PAGE = 10;
const h = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const arg = (v) => h(JSON.stringify(v));
const abbr = (t) => (typeof clubs !== "undefined" && clubs[t] ? clubs[t][0] : "");
const dateLabel = (iso) => (iso ? new Date(dayNumber(iso) * 86400000).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }) : "");
const POSITIONS = ["All", "QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S"];
const blocks = (share, cells = 10, tone = "") => {
  const n = Math.round(Math.max(0, Math.min(1, share)) * cells);
  return `<span class="cer-bar ${tone}" aria-hidden="true">${Array.from({ length: cells }, (_, i) => `<i${i < n ? ' class="on"' : ""}></i>`).join("")}</span>`;
};
const stockChip = (v) => {
  if (!Number.isFinite(v) || Math.abs(v) < 0.5) return `<span class="cer-stock flat" title="Draft stock unchanged">— 0.0</span>`;
  return `<span class="cer-stock ${v > 0 ? "up" : "down"}" title="Draft stock ${v > 0 ? "rose" : "fell"} ${Math.abs(v).toFixed(1)} on the consensus board">${v > 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(1)}</span>`;
};
const STATUS = { full: "Full workout", limited: "Partial workout", injured: "Injured in testing", medical: "Medical exclusion", specialist: "Specialist (no testing)" };

// Combine card for any player with results (player profile → Scouting tab).
export function combineCard(p) {
  const c = p?.combine;
  if (!c) return "";
  const cells = C.DRILLS.map((d) => {
    const v = c.drills[d.id],
      pct = Number.isFinite(v) ? C.drillPercentile(v, d.id, c.pos) : null;
    return `<div class="cer-cc-cell ${pct === null ? "dnp" : ""}"><span>${h(d.short)}</span><b>${Number.isFinite(v) ? h(C.drillValue(v, d.id)) : "DNP"}</b>${pct === null ? "<small>Did not test</small>" : blocks(pct, 8, pct >= 0.8 ? "good" : pct <= 0.25 ? "bad" : "")}</div>`;
  }).join("");
  return `<section class="gp-panel cer-combine-card"><div class="gp-panel-head"><h3>${c.year} Scouting Combine</h3><div class="cer-cc-meta">${c.score !== null ? `<b class="cer-ras" title="Athletic score: 0–10 against the position">${c.score.toFixed(1)}</b><small>Athletic score</small>` : ""}${stockChip(c.stock)}</div></div><div class="gp-panel-body"><div class="cer-cc-grid">${cells}</div><p class="cer-cc-note">${h(STATUS[c.status] || "")}${c.note ? ` · ${h(c.note)}` : ""}. Blocks compare each result with the ${h(c.pos)} average; tested drills narrow your scouts' athletic ranges.</p></div></section>`;
}

export function installCeremoniesUI({ views }) {
  if (typeof document !== "undefined" && !document.querySelector?.('link[href="ceremonies.css"]')) document.head?.insertAdjacentHTML?.("beforeend", '<link rel="stylesheet" href="ceremonies.css">');
  installFeatureVisuals();
  const ui = { drill: "forty", pos: "All", mine: false, dir: 1, page: 0 };

  /* ----------------------------------------------------------- combine tab */
  function combineView() {
    const year = C.latestCombineYear(state),
      dates = C.ceremonyDates(state),
      next = state.phase === "offseason" ? dates.combine : null,
      sum = year ? state.franchise.ceremonies.combine[year] : null;
    if (!sum || (state.phase === "offseason" && year !== C.classYear(state)))
      return `<div class="cer-room"><section class="cer-empty"><div class="cer-empty-art">${stopwatch(0)}</div><div><span class="cer-kicker">${C.classYear(state)} SCOUTING COMBINE</span><h2>${next ? `The combine opens ${h(dateLabel(next))}` : "The combine follows the season"}</h2><p>Every draft prospect runs the 40, benches 225, jumps and runs the agility drills in late February. Results narrow your scouts' athletic ranges, move the consensus board, and appear here with risers and fallers.${year ? ` Last year's results are archived on the players' profiles.` : ""}</p></div></section></div>`;
    const mine = C.followedIds(state),
      pool = C.combinePool(state, year),
      d = C.DRILL[ui.drill],
      rows = pool
        .filter((x) => (ui.pos === "All" || x.p.pos === ui.pos) && (!ui.mine || mine.has(x.p.id)))
        .sort((a, b) => {
          const va = a.p.combine.drills[ui.drill],
            vb = b.p.combine.drills[ui.drill];
          if (!Number.isFinite(va) || !Number.isFinite(vb)) return (Number.isFinite(vb) ? 1 : 0) - (Number.isFinite(va) ? 1 : 0) || a.p.id.localeCompare(b.p.id);
          return ((d.lower ? va - vb : vb - va) || a.p.id.localeCompare(b.p.id)) * ui.dir;
        }),
      pages = Math.max(1, Math.ceil(rows.length / PAGE));
    ui.page = Math.max(0, Math.min(ui.page, pages - 1));
    const tested = rows.filter((x) => Number.isFinite(x.p.combine.drills[ui.drill])).length,
      drillTabs = `<div class="cer-seg" role="tablist" aria-label="Drill">${C.DRILLS.map((x) => `<button role="tab" aria-selected="${ui.drill === x.id}" class="${ui.drill === x.id ? "on" : ""}" onclick="CombineUI.drill('${x.id}')">${h(x.short)}</button>`).join("")}</div>`,
      posSel = `<label class="cer-select">Position<select aria-label="Position filter" onchange="CombineUI.pos(this.value)">${POSITIONS.map((p) => `<option ${ui.pos === p ? "selected" : ""}>${p}</option>`).join("")}</select></label>`,
      mineBtn = `<button class="secondary small ${ui.mine ? "on" : ""}" aria-pressed="${ui.mine}" onclick="CombineUI.mine()">★ Watchlist only${mine.size ? ` · ${pool.filter((x) => mine.has(x.p.id)).length}` : ""}</button>`;
    const table = `<table class="cer-table"><thead><tr><th>#</th><th>Prospect</th><th>Pos</th><th><button class="link cer-sort" onclick="CombineUI.sort()" title="Reverse the order">${h(d.label)} ${ui.dir > 0 ? "▼" : "▲"}</button></th><th>vs position</th><th>Score</th><th>Stock</th></tr></thead><tbody>${
      rows
        .slice(ui.page * PAGE, ui.page * PAGE + PAGE)
        .map(({ p, team }, i) => {
          const v = p.combine.drills[ui.drill],
            pct = Number.isFinite(v) ? C.drillPercentile(v, ui.drill, p.pos) : null;
          return `<tr class="${mine.has(p.id) ? "mine" : ""}"><td class="numeric">${ui.page * PAGE + i + 1}</td><td><button class="cer-who" onclick="W.player(${arg(p.id)},${team})">${pixelFace(p, { size: 26, team: team >= 0 ? team : null })}<span><b>${h(p.name)}</b><small>${h(p.college || (team >= 0 ? "Drafted · " + abbr(team) : "Prospect"))}</small></span>${mine.has(p.id) ? '<i class="cer-star" title="On your watchlist">★</i>' : ""}</button></td><td>${h(p.pos)}</td><td class="numeric cer-val">${Number.isFinite(v) ? h(C.drillValue(v, ui.drill)) : `<span class="cer-dnp" title="${h(p.combine.note || STATUS[p.combine.status])}">DNP</span>`}</td><td>${pct === null ? "" : blocks(pct, 10, pct >= 0.8 ? "good" : pct <= 0.25 ? "bad" : "")}</td><td class="numeric">${p.combine.score === null ? "—" : p.combine.score.toFixed(1)}</td><td>${stockChip(p.combine.stock)}</td></tr>`;
        })
        .join("") || `<tr><td colspan="7" class="cer-none">No prospects match this filter.</td></tr>`
    }</tbody></table><div class="cer-pager"><span>${rows.length} prospects · ${tested} tested in this drill</span><button class="secondary small" onclick="CombineUI.page(-1)" ${ui.page === 0 ? "disabled" : ""}>◀ Prev</button><b>${ui.page + 1} / ${pages}</b><button class="secondary small" onclick="CombineUI.page(1)" ${ui.page >= pages - 1 ? "disabled" : ""}>Next ▶</button></div>`;
    const tops = C.DRILLS.map((x) => {
      const best = C.drillLeaders(pool, x.id, { pos: ui.pos, limit: 1 })[0];
      return best ? `<button class="cer-top ${mine.has(best.p.id) ? "mine" : ""} ${ui.drill === x.id ? "on" : ""}" onclick="CombineUI.drill('${x.id}')" title="${h(x.label)}: ${h(best.p.name)}">${pixelFace(best.p, { size: 30, team: best.team >= 0 ? best.team : null })}<span><small>${h(x.short)}</small><b>${h(best.p.name)}</b></span><strong>${h(C.drillValue(best.p.combine.drills[x.id], x.id))}</strong></button>` : "";
    }).join("");
    const byId = new Map(pool.map((x) => [x.p.id, x])),
      mover = (id) => {
        const x = byId.get(id);
        return x && (ui.pos === "All" || x.p.pos === ui.pos) ? `<li class="${mine.has(id) ? "mine" : ""}">${pixelFace(x.p, { size: 24, team: x.team >= 0 ? x.team : null })}<button class="link" onclick="W.player(${arg(id)},${x.team})">${h(x.p.name)}</button><small>${h(x.p.pos)}</small>${stockChip(x.p.combine.stock)}</li>` : "";
      },
      risers = sum.risers.map(mover).filter(Boolean).slice(0, 5).join(""),
      fallers = sum.fallers.map(mover).filter(Boolean).slice(0, 5).join("");
    return `<div class="cer-room"><section class="cer-head"><div class="cer-head-art">${stopwatch(1)}</div><div class="cer-head-title"><span class="cer-kicker">${year} SCOUTING COMBINE · ${h(dateLabel(sum.date) || "COMPLETE")}</span><h2>${sum.tested} of ${sum.invited} prospects tested</h2><p>Drill results narrowed your scouts' ranges on speed, acceleration, agility and strength, and moved the consensus board the CPU clubs draft from.</p></div><div class="cer-head-tools">${posSel}${mineBtn}</div></section><div class="cer-cols"><section class="cer-panel cer-main"><div class="cer-panel-head"><h3>Results by drill</h3>${drillTabs}</div>${table}</section><div class="cer-side"><section class="cer-panel"><div class="cer-panel-head"><h3>Top performers${ui.pos !== "All" ? " · " + h(ui.pos) : ""}</h3></div><div class="cer-tops">${tops}</div></section><section class="cer-panel"><div class="cer-panel-head"><h3>Risers & fallers</h3></div><div class="cer-movers"><ul>${risers || '<li class="cer-none">No big risers.</li>'}</ul><ul>${fallers || '<li class="cer-none">No big fallers.</li>'}</ul></div></section></div></div></div>`;
  }
  // 16×16 pixel stopwatch (frame 0 idle, 1 with the hand moved).
  function stopwatch(frame) {
    const g = new PixelGrid(16, 18);
    g.rect(6, 0, 4, 2, "#c9ced6").rect(7, 2, 2, 1, "#9aa5b4");
    g.ellipse(8, 10, 7, 7, (nx, ny) => (nx * nx + ny * ny > 0.62 ? "#c9ced6" : "#f4f1ea"));
    g.rect(8, 5, 1, 5, "#c8323c");
    if (frame) g.rect(9, 10, 3, 1, "#14181f");
    else g.rect(8, 10, 1, 3, "#14181f");
    return g.outline().svg({ cls: "cer-watch", label: "Stopwatch" });
  }
  window.CombineUI = {
    view: combineView,
    drill(id) {
      if (C.DRILL[id]) {
        ui.drill = id;
        ui.dir = 1;
        ui.page = 0;
      }
      render();
    },
    pos(v) {
      ui.pos = POSITIONS.includes(v) ? v : "All";
      ui.page = 0;
      render();
    },
    mine() {
      ui.mine = !ui.mine;
      ui.page = 0;
      render();
    },
    sort() {
      ui.dir = -ui.dir;
      ui.page = 0;
      render();
    },
    page(delta) {
      ui.page = Math.max(0, ui.page + Number(delta || 0));
      render();
    },
  };
  window.GDCombineCard = combineCard;

  /* ------------------------------------------------------ honors / awards */
  function honorsPanel() {
    const f = state.franchise,
      c = f.ceremonies,
      years = Object.keys(c?.honors || {}).map(Number).sort((a, b) => b - a),
      latest = years[0],
      sum = latest ? c.honors[latest] : null,
      dates = C.ceremonyDates(state),
      ballot = f.awardBallots?.[state.year];
    if (!sum || latest < state.year - (state.phase === "season" ? 1 : 0)) {
      const when = state.phase === "season" ? "after the regular season" : ballot?.announced ? "" : dateLabel(dates.honors);
      if (!when && !ballot) return "";
      return `<section class="cer-honors-banner"><span class="cer-trophy-mini">${trophySmall()}</span><div><span class="cer-kicker">NFL HONORS ${state.year}</span><b>${ballot ? `The ballot is sealed. Winners are revealed on ${h(dateLabel(dates.honors))}, the Thursday before the championship.` : `Awards night follows the regular season; the ballot seals ${h(when)}.`}</b></div></section>`;
    }
    const winners = sum.awards.filter((a) => a.winner).map((a) => ({ award: a.award, label: a.label, winner: a.winner }));
    const yours = winners.filter((a) => a.winner.yours).length + sum.allPro.filter((x) => x.yours).length;
    return `<section class="cer-honors"><div class="cer-panel-head"><h3>NFL Honors ${sum.year}</h3><small>${h(dateLabel(sum.date) || "Awards night")} · ${yours ? `${yours} honour${yours === 1 ? "" : "s"} for your club` : "Winners by media ballot"}</small></div>${awardsVisual({ kind: "night", year: sum.year, winners })}${
      sum.allPro.length
        ? `<details class="cer-allpro-wrap"><summary>First-team All-Pro · ${sum.allPro.length} players${sum.allPro.some((x) => x.yours) ? ` · ${sum.allPro.filter((x) => x.yours).length} from your club` : ""}</summary>${awardsVisual({ kind: "allpro", year: sum.year, rows: sum.allPro })}</details>`
        : ""
    }</section>`;
  }
  function trophySmall() {
    const g = new PixelGrid(12, 14);
    g.ellipse(6, 3, 4, 3, "#ffd34d").rect(1, 1, 1, 3, "#ffd34d").rect(10, 1, 1, 3, "#b8860b").rect(5, 6, 2, 4, "#ffd34d").rect(3, 10, 6, 1, "#ffd34d").rect(2, 11, 8, 3, "#3a2c18");
    return g.outline().svg({ cls: "cer-trophy" });
  }
  const awardsView = views.Awards;
  if (awardsView) views.Awards = () => honorsPanel() + awardsView();

  /* --------------------------------------------------------- Hall of Fame */
  function hallPanel() {
    const c = state.franchise.ceremonies,
      year = C.classYear(state),
      entries = Object.values(c?.hof || {}).sort((a, b) => b.classYear - a.classYear),
      entry = entries.find((e) => e.classYear === year && (e.finalists.length || e.inductees.length)) || entries.find((e) => e.inductees.length),
      dates = C.ceremonyDates(state);
    if (!entry)
      return `<section class="cer-honors-banner gold"><span class="cer-trophy-mini">${trophySmall()}</span><div><span class="cer-kicker">HALL OF FAME · CLASS OF ${year}</span><b>Finalists are named in January, the class is elected the week of the championship and enshrined in late July.</b></div></section>`;
    const status = entry.enshrined ? `Enshrined ${dateLabel(entry.enshrined)}` : entry.inductees.length ? `Elected ${dateLabel(entry.electedDate)} · enshrinement ${dateLabel(state.phase === "offseason" ? dates.enshrinement : "")}`.replace(/ · enshrinement $/, "") : `Finalists named ${dateLabel(entry.finalistsDate)} · class elected ${dateLabel(dates.honors)}`;
    const rows = entry.inductees.length ? entry.inductees : entry.finalists.slice(0, 8);
    const plaque = (x) =>
      `<button class="cer-plaque ${x.connected ? "mine" : ""} ${entry.enshrined ? "enshrined" : ""}" onclick="Expansion.legend?.(${arg(x.id)})" title="${h(x.name)}"><span class="cer-plaque-top">${entry.inductees.length ? `CLASS OF ${entry.classYear}` : "FINALIST"}</span><span class="cer-plaque-bust">${pixelPortrait(x.face, { seed: x.id, outfit: "suit", colors: { primary: "#d4a22c", secondary: "#fff1b8", dark: "#8a6414" }, label: x.name })}</span><b>${h(x.name)}</b><small>${h(x.pos)} · ${x.teams.map(abbr).filter(Boolean).slice(0, 3).join(" · ") || "—"}</small><span class="cer-plaque-vote">${blocks((x.vote || 0) / 100, 10, x.vote >= 80 ? "gold" : "")}<em>${x.vote ?? "—"}%</em></span>${x.firstBallot ? '<i class="cer-chip">First ballot</i>' : x.connected ? '<i class="cer-chip team">Your club</i>' : ""}</button>`;
    const others = entry.inductees.length ? entry.finalists.filter((f) => !entry.inductees.some((i) => i.id === f.id)) : [];
    return `<section class="cer-hall"><div class="cer-panel-head"><h3>Class of ${entry.classYear}</h3><small>${h(status)}</small></div><div class="cer-plaques">${rows.map(plaque).join("")}</div>${others.length ? `<p class="cer-also"><b>Also finalists:</b> ${others.map((x) => `${h(x.name)} <small>${x.vote}%</small>`).join(" · ")}</p>` : ""}</section>`;
  }
  const hallView = views["Hall of Fame"];
  if (hallView) views["Hall of Fame"] = () => hallPanel() + hallView();
}
