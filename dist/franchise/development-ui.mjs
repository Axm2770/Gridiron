import * as S from "./state.mjs";
import {
  ensureDevelopment,
  setDevelopmentPlan,
  FOCUSES,
  LOADS,
} from "./development.mjs";
import { progressionView, attributeLabel } from "./progression-view.mjs";
import { face } from "./career-scenes.mjs";
const label = (s) => s.replace(/([A-Z])/g, " $1");
export function directionChips(p, limit = 5) {
  const v = progressionView(p);
  return (
    v.attributes
      .slice(0, limit)
      .map(
        (a) =>
          `<span class="development-direction ${a.direction}" aria-label="${esc(a.label)} ${a.direction === "up" ? "improving" : "declining"}">${esc(a.label)} ${a.arrow}</span>`,
      )
      .join("") || '<span class="muted">No attribute movement reported</span>'
  );
}
function developmentChart(p) {
  const h = p.progression.history || [];
  if (h.length < 2)
    return '<div class="development-chart"><h3>Ability trajectory</h3><p>A trend appears after two weekly reports.</p></div>';
  const values = h.map((r) => r.ability),
    min = Math.min(...values) - 0.25,
    max = Math.max(...values) + 0.25;
  const points = h.map(
    (r, i) =>
      `${15 + (i / (h.length - 1)) * 570},${100 - ((r.ability - min) / (max - min)) * 80}`,
  );
  return `<div class="development-chart"><h3>Recent ability trend</h3><svg viewBox="0 0 600 120" role="img" aria-label="Ability trend across recent weeks"><path d="M15 20H585M15 60H585M15 100H585" stroke="#446276" opacity=".4"/><path d="M${points.join(" L")}" fill="none" stroke="#bddf99" stroke-width="2.5"/>${h.map((r, i) => `<circle cx="${15 + (i / (h.length - 1)) * 570}" cy="${100 - ((r.ability - min) / (max - min)) * 80}" r="${r.injured ? 4 : 2}" fill="${r.injured ? "#ed9a83" : "#bddf99"}"/>`).join("")}</svg><p>Green: ability trend · Coral: injury-affected week</p></div>`;
}
export function installDevelopmentUI({ views, isBusy }) {
  let query = "",
    filter = "All",
    page = 0,
    selected = null,
    profileTab = "Plan",
    draft = null;
  const items = () =>
    state.roster
      .filter((p) =>
        `${p.name} ${p.pos}`.toLowerCase().includes(query.toLowerCase()),
      )
      .filter(
        (p) =>
          filter === "All" ||
          (filter === "Rehabilitation" && (p.injury || p.progression?.rehab)) ||
          progressionView(p).status === filter,
      );
  function rows() {
    const all = items();
    page = Math.min(page, Math.max(0, Math.ceil(all.length / 8) - 1));
    return (
      all
        .slice(page * 8, page * 8 + 8)
        .map((p) => {
          const d = ensureDevelopment(p, state.year),
            v = progressionView(p);
          return `<tr><td><button class="dev-player-link" onclick="Dev.player('${p.id}')">${face(p)}<span><b>${esc(p.name)}</b><small>${p.pos} · ${p.age} years</small></span></button></td><td><b>${p.ovr}</b><span class="development-status ${v.direction}">${v.status}</span></td><td><div class="development-directions">${directionChips(p, 3)}</div></td><td>${d.form?.toFixed(1) || "—"}<small>Training ${d.training?.toFixed(1) || "—"}</small></td><td>${esc(label(d.focus))}<small>${d.load} load</small></td><td><span class="dev-status ${p.injury ? "injured" : ""}">${p.injury ? "Injured · " + p.injury + "w" : d.rehab ? "Return to play" : "Available"}</span></td><td><button class="secondary small" onclick="Dev.player('${p.id}')">Open plan ↗</button></td></tr>`;
        })
        .join("") || '<tr><td colspan="7">No players match this view.</td></tr>'
    );
  }
  const segments = (values, current, method) =>
    `<div class="staff-segments">${values.map((v) => `<button class="${current === v ? "selected" : ""}" aria-pressed="${v === current}" onclick="Dev.${method}('${v}')">${esc(label(v))}</button>`).join("")}</div>`;
  function profile() {
    const p = state.roster.find((p) => p.id === selected);
    if (!p) return;
    const d = ensureDevelopment(p, state.year),
      v = progressionView(p),
      mentors = state.roster.filter(
        (q) => q.id !== p.id && q.pos === p.pos && q.age >= p.age + 3,
      ),
      report = d.lastReport;
    const content =
      profileTab === "Plan"
        ? `<h3>Training focus</h3>${segments(Object.keys(FOCUSES), draft.focus, "focus")}<h3>Workload</h3>${segments(Object.keys(LOADS), draft.load, "load")}<h3>Position mentor</h3><div class="development-mentor-grid"><button class="${!draft.mentorId ? "selected" : ""}" onclick="Dev.mentor('')">No mentor</button>${mentors.map((q) => `<button class="${draft.mentorId === q.id ? "selected" : ""}" onclick="Dev.mentor('${q.id}')">${face(q)}<span>${esc(q.name)}<small>${q.age} years · ${q.pos}</small></span></button>`).join("")}</div><div class="staff-clearance">${p.injury ? "Medical clearance takes priority. Recovery limits training." : d.load === "Intensive" && p.fitness < 70 ? "Fatigue limits the benefit of intensive training." : "Balance meaningful snaps, individual work and recovery."}</div><button onclick="Dev.save('${p.id}')" ${isBusy() ? "disabled" : ""}>Save individual plan</button>`
        : profileTab === "Report"
          ? `${developmentChart(p)}<h3>Attributes in motion</h3><div class="development-directions">${directionChips(p, 23)}</div><h3>Coach’s latest report</h3><div class="dev-reasons">${(report?.reasons || ["Awaiting the next weekly assessment"]).map((x) => `<span>${esc(x)}</span>`).join("")}</div><p>${report?.used ? "Competitive playing opportunity recorded." : "Competitive snaps and focused practice create opportunities for progress."}</p>`
          : `<div class="injury-ledger"><h3>Medical history</h3>${
              d.injuries
                .slice(0, 6)
                .map(
                  (i) =>
                    `<div><b>${esc(label(i.bodyPart))} · ${esc(i.diagnosis)}</b><small>${i.year} · Week ${i.week + 1} · ${i.weeksMissed} weeks interrupted · ${i.returned ? "Returned week " + (i.returned.week + 1) : "Recovery in progress"}</small></div>`,
                )
                .join("") || "<p>No injuries recorded.</p>"
            }</div><p>Major injuries can affect physical attributes. A managed return protects recovery and long-term development.</p>`;
    modal(
      `<div class="development-profile development-compact"><div class="staff-meeting-top"><span class="eyebrow">INDIVIDUAL DEVELOPMENT</span><button class="icon-button" aria-label="Close development" onclick="closeModal()">×</button></div><div class="development-profile-top">${face(p)}<div><h2>${esc(p.name)}</h2><p>${p.pos} · ${p.age} years · ${esc(p.development || "Normal")} development</p><span class="development-status ${v.direction}">${v.status}</span></div><b>${p.ovr}<small>CURRENT OVR</small></b></div><div class="development-report-metrics"><div><b>${d.training?.toFixed(1) || "—"}</b><span>Training</span></div><div><b>${d.form?.toFixed(1) || "—"}</b><span>Match form</span></div><div><b>${p.pot}</b><span>Potential</span></div></div>${segments(["Plan", "Report", "Medical"], profileTab, "tab")}<div class="development-tab-body">${content}</div><div class="modal-actions"><button class="secondary" onclick="CI.rating('${p.id}')">Full attributes</button><button onclick="closeModal()">Done</button></div></div>`,
    );
  }
  window.Dev = {
    query(v) {
      query = v;
      page = 0;
      document.getElementById("development-rows").innerHTML = rows();
      document.getElementById("development-count").textContent =
        items().length + " players";
      document.getElementById("development-page").textContent = "Page 1";
      document.getElementById("development-prev").disabled = true;
      document.getElementById("development-next").disabled =
        items().length <= 8;
    },
    filter(v) {
      filter = v;
      page = 0;
      render();
    },
    page(d) {
      page += d;
      render();
    },
    player(id) {
      selected = id;
      const p = state.roster.find((p) => p.id === id);
      if (!p) return;
      const d = ensureDevelopment(p, state.year);
      draft = { focus: d.focus, load: d.load, mentorId: d.mentorId };
      profileTab = "Plan";
      profile();
    },
    tab(v) {
      profileTab = v;
      profile();
    },
    focus(v) {
      draft.focus = v;
      profile();
    },
    load(v) {
      draft.load = v;
      profile();
    },
    mentor(v) {
      draft.mentorId = v || null;
      profile();
    },
    save(id) {
      if (isBusy()) return;
      try {
        state = S.transact(state, (s) => setDevelopmentPlan(s, id, draft));
        save();
        render();
        profile();
        toast("Development plan saved.");
      } catch (e) {
        toast(e.message);
      }
    },
  };
  views.Development = () => {
    for (const p of state.roster) ensureDevelopment(p, state.year);
    const up = state.roster.filter(
        (p) => progressionView(p).status === "Improving",
      ).length,
      down = state.roster.filter(
        (p) => progressionView(p).status === "Declining",
      ).length;
    const body = rows();
    return `<section class="development-hero"><div><span class="eyebrow">PLAYER PATHWAYS</span><h2>Develop talent. Protect the future.</h2><p>${up} improving · ${down} declining · ${state.roster.filter((p) => p.injury || p.progression.rehab).length} in recovery</p></div><div><span>Training <b>Level ${state.franchise.clubs[state.team].stadium.training}</b></span><span>Medical <b>Level ${state.franchise.clubs[state.team].stadium.medical}</b></span><button class="secondary small" onclick="W.open('Medical')">Team preparation ↗</button></div></section><section class="panel"><div class="development-toolbar"><input type="search" aria-label="Search development players" placeholder="Search player or position…" value="${esc(query)}" oninput="Dev.query(this.value)">${segments(["All", "Improving", "Stable", "Declining", "Rehabilitation"], filter, "filter")}</div><div class="scroll"><table class="development-table"><thead><tr>${["Player", "Overall / status", "Attribute direction", "Form / training", "Focus", "Availability", ""].map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody id="development-rows">${body}</tbody></table></div><div class="staff-pagination"><span id="development-count">${items().length} players</span><span id="development-page">Page ${page + 1}</span><button class="secondary small" id="development-prev" onclick="Dev.page(-1)" ${!page ? "disabled" : ""}>Previous</button><button class="secondary small" id="development-next" onclick="Dev.page(1)" ${(page + 1) * 8 >= items().length ? "disabled" : ""}>Next</button></div></section>`;
  };
}
