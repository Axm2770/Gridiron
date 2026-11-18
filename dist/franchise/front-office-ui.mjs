import * as S from "./state.mjs";
import * as B from "./boardroom.mjs";
import * as BM from "./board-meetings.mjs";
import * as G from "./game-plan.mjs";
import * as TX from "./tactics.mjs";
import { lockerReport } from "./locker-room.mjs";
import { icon } from "./presentation.mjs";
import { notice } from "../ui/notice.mjs";
import { activeDilemma, resolveDilemma } from "./depth-systems.mjs";
import { pixelFace } from "../ui/pixel-face.mjs";
import * as fp from "./fo-pixel.mjs";
import { staffBust, ensureFrontDeskStyles } from "./fo-pixel.mjs";
import { coachAppearance } from "./coach-avatar.mjs";

// Boardroom, Organization hub (Club), Tactics (the legacy "Game plan" view) and Locker room.
const arg = (v) => esc(JSON.stringify(v));
const money = (n) => "$" + (n / S.MILLION).toFixed(1) + "M";
const chip = (text, tone = "") => `<span class="fo-chip ${tone}">${esc(text)}</span>`;
const meter = (v, tone = "", max = 100) =>
  `<span class="fo-meter ${tone}"><i style="width:${Math.max(0, Math.min(100, (v / max) * 100))}%"></i></span>`;
const toneFor = (v, good = 70, warn = 50) => (v >= good ? "good" : v >= warn ? "warn" : "bad");
const card = (title, body, extra = "", cls = "") =>
  `<section class="fo-card ${cls}"><div class="fo-card-head"><h3>${title}</h3>${extra}</div>${body}</section>`;
const kpi = (label, value, sub, tone = "", bar = null) =>
  `<div class="fo-kpi ${tone}"><small>${label}</small><b>${value}</b>${bar === null ? "" : meter(bar, tone)}<span>${sub}</span></div>`;
const cause = (c) => `<li class="${c.tone || ""}">${esc(c.text)}</li>`;

export function installFrontOfficeUI({ views, isBusy }) {
  if (!document.querySelector('link[href="front-office.css"]'))
    document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="front-office.css">');
  let lockerFilter = "All",
    lockerPage = 0,
    clubTab = "Overview";
  function mutate(fn, done) {
    if (isBusy()) {
      toast("Wait for the simulation to finish.");
      return;
    }
    try {
      let result;
      state = S.transact(state, (s) => {
        result = fn(s);
      });
      save();
      render();
      if (done) toast(typeof done === "function" ? done(result) : done);
    } catch (e) {
      toast(e.message);
    }
  }

  /* ------------------------------------------------------------ boardroom */
  function boardView() {
    ensureFrontDeskStyles();
    const o = B.boardOverview(state),
      b = o.budget,
      busy = isBusy() || !!state.live,
      payrollShare = b.staffBudget ? (b.staffPayroll / b.staffBudget) * 100 : 100,
      capShare = b.cap.limit ? (b.cap.used / b.cap.limit) * 100 : 0,
      secTone = toneFor(o.security, 60, 40),
      owner = state.franchise.clubs[state.team].owner;
    const security = `<div class="fo-security fp-security ${secTone}">${fp.gauge(o.security, { label: `Job security ${o.security} of 100` })}<div class="fp-security-score"><b>${o.security}</b><small>/ 100</small></div><div class="fp-security-copy"><span class="fp-kicker">STATUS</span><h3>${esc(o.status)}</h3><ul class="fp-factors">${o.factors.map((f) => `<li class="${f.tone || ""}"><i></i><span>${esc(f.label)}</span><b>${esc(f.value)}</b></li>`).join("")}</ul></div></div>`;
    const ownerCard = `<div class="fp-owner">${staffBust({ id: "owner-" + state.team, name: o.owner.name, role: "Owner" }, { size: 56, team: state.team })}<div><b>${esc(o.owner.name)}</b>${fp.chip(o.owner.trait, "accent")}</div></div><div class="fp-row"><span>Owner patience</span><b>${Math.round(o.owner.patience)}%</b></div>${fp.blocks(o.owner.patience, 100, 20, toneFor(o.owner.patience, 60, 40) === "bad" ? "bad" : toneFor(o.owner.patience, 60, 40), "Owner patience " + Math.round(o.owner.patience) + "%")}<p class="fp-note">${ownerNote(o.owner.trait)}</p>`;
    const x = BM.expectationsReport(state),
      mark = { done: "✓", on: "•", risk: "!", missed: "✗" };
    const expectations = `<p class="fp-note">${esc(x.headline)}. The roster rates ${x.rating} (${x.rank} of 32, league average ${x.leagueAvg}); ownership projects ${x.projected} wins${x.targetShift ? ` and has moved the target ${x.targetShift > 0 ? "+" : ""}${x.targetShift} after a meeting` : ""}.</p><div class="fp-tiles fp-tiles-4">${fp.tile("Projected", x.projected, "Wins from roster strength")}${fp.tile("Win target", o.target, esc(o.mandate) + " mandate", { tone: "accent" })}${fp.tile("Record", `${o.record.w}–${o.record.l}`, "This season")}${fp.tile("On pace for", o.pace === null ? "—" : o.pace.toFixed(1), o.pace === null ? "After the first game" : o.pace >= o.target ? "Ahead of target" : "Behind target", { tone: o.pace === null ? "" : o.pace >= o.target ? "good" : "bad" })}</div><ul class="fo-objectives fp-objectives">${x.items.map((t) => `<li class="${t.state === "done" ? "done" : t.state === "risk" || t.state === "missed" ? "risk" : ""}"><i>${mark[t.state]}</i><span>${esc(t.label)}${t.required ? "" : ' <em class="fo-soft">secondary</em>'}</span><small>${esc(t.progress)}</small></li>`).join("")}</ul><div class="fo-bands fp-bands">${x.bands.map((b) => `<div class="fo-band ${b.key === "Exceeded" ? "good" : b.key === "Met" ? "" : "bad"} ${x.outcome === b.key ? "active" : ""}"><b>${esc(b.label)}</b><small>${esc(b.when)}</small><span>${esc(b.effect)}</span></div>`).join("")}</div>`;
    const p = x.pulse,
      plan = x.plan,
      pending = x.pending.length
        ? `<div class="fp-pending">${x.pending.map((m) => `<div class="fp-row">${fp.chip("Awaiting you", "bad")}<span>${esc(m.title)}</span><button class="small" onclick="W.open('Inbox')">Answer</button></div>`).join("")}</div>`
        : "";
    const planBody = plan
      ? `<div class="fp-plan-now"><small>AGREED PLAN</small><b>${esc(plan.measure)}</b><span>${esc(plan.label)}</span></div><div class="fp-row"><span>Progress</span><b>${plan.value} / ${plan.need}</b></div>${fp.blocks(plan.value, plan.need, Math.min(12, Math.max(4, plan.need)), plan.value >= plan.need ? "good" : "warn", `Plan progress ${plan.value} of ${plan.need}`)}<div class="fp-row"><span>Checkpoint</span><b>${plan.left ? `in ${plan.left} game${plan.left === 1 ? "" : "s"}` : "after this round"}</b></div><p class="fp-note">Meet it: owner patience +${plan.reward}. Miss it: −${plan.penalty} and a sharp fall in job security.</p>`
      : x.lastPlan
        ? `<p class="fp-note">Last plan: <b>${esc(x.lastPlan.measure)}</b> ${fp.chip(x.lastPlan.status === "met" ? "Met" : x.lastPlan.status === "missed" ? "Missed" : "Closed", x.lastPlan.status === "met" ? "good" : "bad")}</p>`
        : `<p class="fp-note">No plan in place. After ${BM.MEETING_RULES.minGames} games, ownership calls a board meeting when you are on pace for ${-BM.MEETING_RULES.paceGap}+ fewer wins than the target, lose ${BM.MEETING_RULES.losingStreak} straight, or job security falls below ${BM.MEETING_RULES.security}.</p>`;
    const watch = [
      ["Point differential", `${p.pointDiff >= 0 ? "+" : ""}${p.pointDiff}`, p.pointDiff >= 0 ? "good" : "bad"],
      ["Losing streak", p.streak, p.streak >= BM.MEETING_RULES.losingStreak ? "bad" : p.streak ? "warn" : "good"],
      ["Team morale", `${p.morale}%`, toneFor(p.morale, 70, 55)],
      ["Drama", p.drama, p.drama >= 55 ? "bad" : p.drama >= 35 ? "warn" : "good"],
    ];
    const pulse = `${pending}${planBody}<span class="fp-label">What the board is watching</span><ul class="fp-watchboard">${watch.map(([k, v, t]) => `<li class="${t}"><i></i><span>${k}</span><b>${v}</b></li>`).join("")}</ul>${x.warning ? notice({ tone: "bad", cls: "fp-notice", title: `${x.warning > 1 ? "Ultimatum" : "Final warning"} on record this season.`, detail: "The board judges the rest of the season against the targets above; missing them again puts your job at risk." }) : ""}`;
    const meetings = x.meetings.length
      ? `<ol class="fp-timeline">${x.meetings.map((m) => `<li class="${/missed|record/i.test(m.outcome) ? "bad" : /met|exceeded|set|agreed|active/i.test(m.outcome) ? "good" : "warn"}"><time>${m.date ? esc(m.date) : m.year} · W${m.week + 1}</time><b>${esc(m.kind)}: ${esc(m.title)}</b>${fp.chip(m.outcome, /missed|record/i.test(m.outcome) ? "bad" : /met|exceeded|set|agreed|active/i.test(m.outcome) ? "good" : "warn")}<small>${esc(m.agreed ? "Agreed: " + m.agreed : m.detail || "")}${m.agreed && m.detail ? " · " + esc(m.detail) : ""}</small></li>`).join("")}</ol>`
      : '<p class="fp-note">Board and team meetings appear here with what was agreed and how it turned out.</p>';
    const mandate = `<p class="fp-note">${o.mandateLocked ? `Agreed for ${state.year}: <b>${esc(o.mandate)}</b>. ${esc(B.MANDATES[o.mandate].text)}` : `Agree one mandate per season. It sets the win target ownership judges you on (projection ${o.projected}).`}</p><div class="fp-mandates">${Object.entries(B.MANDATES).map(([k, m]) => `<button class="fp-mandate ${o.mandate === k ? "active" : ""}" aria-pressed="${o.mandate === k}" ${o.mandateLocked || busy ? "disabled" : ""} onclick="FrontOffice.mandate(${arg(k)})"><strong>${m.shift > 0 ? "+" : ""}${m.shift}</strong><span><b>${k}${o.mandate === k ? " ✓" : ""}</b><small>${esc(m.text)}</small></span></button>`).join("")}</div>`;
    const budget = `<div class="fp-row"><span>Club cash</span><b>${money(b.cash)}</b></div><div class="fp-row"><span>Staff payroll / budget</span><b>${money(b.staffPayroll)} / ${money(b.staffBudget)}</b></div>${fp.blocks(payrollShare, 100, 20, payrollShare > 100 ? "bad" : payrollShare > 90 ? "warn" : "good", "Staff payroll " + Math.round(payrollShare) + "% of budget")}<div class="fp-row"><span>Player cap used</span><b>${money(b.cap.used)} / ${money(b.cap.limit)}</b></div>${fp.blocks(capShare, 100, 20, b.cap.room < 0 ? "bad" : capShare > 95 ? "warn" : "good", "Player cap " + Math.round(capShare) + "% used")}<div class="fp-action"><button ${!o.can.budget || o.budgetCooldown || busy ? "disabled" : ""} onclick="FrontOffice.budget()">Ask for +${money(B.BUDGET_STEP)} staff budget</button><small>${!o.can.budget ? `${esc(state.franchise.role)} cannot request budget.` : o.budgetCooldown ? `Ownership will hear another request in ${o.budgetCooldown} days.` : "Approval depends on job security and cash reserves. The answer is immediate."}</small></div>`;
    const facilities = `${o.project ? `<div class="fp-project">${icon("building")}<span><b>${esc(o.project.name)}</b><small>${o.project.remaining} week${o.project.remaining === 1 ? "" : "s"} remaining</small></span>${fp.chip("Under construction", "warn")}</div>` : ""}<div class="fp-tracks">${Object.entries(B.FACILITIES).map(([area, f]) => {
      const level = o.facilities[area],
        maxed = level >= f.max,
        pct = area === "condition";
      return `<div class="fo-facility fp-track ${maxed ? "maxed" : ""}"><div class="fp-track-head"><b>${f.label}</b><strong>${pct ? level + "%" : "Level " + level + " / " + f.max}</strong></div>${pct ? fp.blocks(level, 100, 20, level >= 70 ? "good" : level >= 45 ? "warn" : "bad", f.label + " " + level + "%") : `<span class="fp-levels">${Array.from({ length: f.max }, (_, i) => `<i class="${i < level ? "on" : ""}">${i + 1}</i>`).join("")}</span>`}<small>${esc(f.effect)}</small><button class="secondary small" ${!o.can.facilities || o.project || maxed || busy || b.cash < f.cost ? "disabled" : ""} onclick="FrontOffice.invest(${arg(area)})">${maxed ? "Maxed" : "Invest " + money(f.cost)}</button></div>`;
    }).join("")}</div>${o.can.facilities ? "" : `<p class="fp-note">${esc(state.franchise.role)} cannot fund facilities.</p>`}`;
    const history = o.decisions.length
      ? `<ol class="fp-timeline">${o.decisions.map((d) => `<li class="${d.outcome === "Rejected" ? "bad" : d.outcome === "Partial" ? "warn" : "good"}"><time>${d.year} · W${d.week + 1}</time><b>${esc(d.title)}</b>${fp.chip(d.outcome, d.outcome === "Rejected" ? "bad" : d.outcome === "Partial" ? "warn" : "good")}<small>${esc(d.detail)}</small></li>`).join("")}</ol>`
      : '<p class="fp-note">Ownership decisions appear here.</p>';
    return `<div class="fo-page fp-page fp-board"><div class="fp-grid-21">${fp.panel({ title: "Job security", kicker: "OWNERSHIP VIEW", body: security, cls: "fp-sec-panel" })}${fp.panel({ title: "Ownership", kicker: "THE OWNER", body: ownerCard })}</div><div class="fp-grid-21">${fp.panel({ title: "Expectations", kicker: state.year + " SEASON", body: expectations, extra: fp.chip(x.tier, x.rank <= 12 ? "good" : x.rank <= 22 ? "" : "warn") })}${fp.panel({ title: "Board plan", kicker: "CHECKPOINT", body: pulse, extra: x.plan ? fp.chip("Checkpoint active", "warn") : "" })}</div><div class="fp-grid-3">${fp.panel({ title: "Season mandate", kicker: "AGREE ONE PER SEASON", body: mandate })}${fp.panel({ title: "Budget", kicker: "FINANCES", body: budget })}${fp.panel({ title: "Meetings", kicker: "HISTORY", body: meetings, cls: "fp-scroll-panel" })}</div><div class="fp-grid-21">${fp.panel({ title: "Facilities", kicker: "UPGRADE TRACKS", body: facilities })}${fp.panel({ title: "Decisions", kicker: "OWNERSHIP LOG", body: history, cls: "fp-scroll-panel" })}</div></div>`;
  }
  /* ------------------------------------------------------ organization hub */
  // Replaces the hub-ui Club view: one pixel desk for ownership, people and infrastructure.
  // The Facilities tab keeps the stadium actions (ticket price, projects, relocation) and
  // calls the same F.action handlers as before.
  const PROJECTS = [
    ["condition", "Stadium restoration", 60, "Repairs lift condition, fan mood and attendance."],
    ["capacity", "Capacity expansion", 250, "More seats for match-day revenue."],
    ["medical", "Medical tier", 35, "Better treatment and faster recovery."],
    ["training", "Training tier", 35, "Faster weekly player development."],
  ];
  const tierTrack = (v, max = 5) =>
    `<span class="fp-levels small">${Array.from({ length: Math.max(max, v) }, (_, i) => `<i class="${i < v ? "on" : ""}">${i + 1}</i>`).join("")}</span>`;
  function clubView() {
    ensureFrontDeskStyles();
    const c = state.franchise.clubs[state.team],
      st = c.stadium,
      staff = (c.staff || []).slice().sort((a, b) => b.rating - a.rating),
      projects = st.projects.filter((p) => p.remaining > 0),
      busy = isBusy() || !!state.live,
      canStadium = S.allowed(state, "stadium"),
      dis = busy || !canStadium ? "disabled" : "",
      payroll = staff.reduce((n, p) => n + (p.salary || 0), 0),
      o = B.boardOverview(state),
      name = clubs[state.team][1] + " " + clubs[state.team][2];
    const banner = `<section class="fp-panel fp-club-banner"><div class="fp-club-id"><span class="fp-club-logo">${logo(state.team)}</span><div><h2>${esc(name)}</h2><p>${esc(st.name)} · ${esc(st.city)} · ${Number(st.capacity).toLocaleString("en-US")} seats</p></div></div><div class="fp-club-actions"><button class="secondary small" onclick="W.open('Career')">Your coach profile</button><button class="secondary small" onclick="W.open('Staff')">Coaching staff →</button><button class="secondary small" onclick="W.open('Boardroom')">Meet ownership →</button></div></section>`;
    const tiles = `<div class="fp-tiles fp-tiles-5">${fp.tile("Club cash", money(c.cash), "Operating resources", { tone: c.cash < 80 * S.MILLION ? "warn" : "" })}${fp.tile("Attendance", Math.round(c.attendance * 100) + "%", "Responds to price and fans", { meter: fp.blocks(c.attendance * 100, 100, 10, toneFor(c.attendance * 100, 85, 65)) })}${fp.tile("Fan approval", Math.round(c.fanApproval) + "%", "Supporter mood", { meter: fp.blocks(c.fanApproval, 100, 10, toneFor(c.fanApproval, 60, 40)) })}${fp.tile("Staff payroll", money(payroll), `${staff.length} on staff`)}${fp.tile("Ticket price", "$" + st.ticket, "Per seat")}</div>`;
    const tabsHTML = `<div class="fp-tabs" role="tablist">${["Overview", "Facilities"].map((t) => `<button role="tab" class="${clubTab === t ? "selected" : ""}" aria-selected="${clubTab === t}" onclick="FrontOffice.clubTab(${arg(t)})">${t}${t === "Facilities" && projects.length ? `<em>${projects.length} live</em>` : ""}</button>`).join("")}</div>`;
    let body;
    if (clubTab === "Facilities") {
      body = `<div class="fp-grid-21">${fp.panel({
        kicker: "STADIUM PROJECTS",
        title: "Build and upgrade",
        extra: projects.length ? fp.chip("One project at a time", "warn") : "",
        body: `${projects.map((p) => `<div class="fp-project">${icon("building")}<span><b>${esc(p.name)}</b><small>${p.remaining} calendar advance${p.remaining === 1 ? "" : "s"} remaining</small></span>${fp.chip("In progress", "warn")}</div>`).join("")}<div class="fp-tracks fp-tracks-2">${PROJECTS.map(([area, label, cost, text]) => `<div class="fp-track"><div class="fp-track-head"><b>${label}</b><strong>${area === "condition" ? Math.round(st.condition) + "%" : area === "capacity" ? Number(st.capacity).toLocaleString("en-US") : "Tier " + st[area]}</strong></div>${area === "condition" ? fp.blocks(st.condition, 100, 20, toneFor(st.condition, 70, 45)) : area === "capacity" ? '<span class="fp-track-gap"></span>' : tierTrack(st[area])}<small>${text}</small><div class="fp-track-actions"><button class="small" ${dis || (projects.length ? "disabled" : "")} onclick="F.action('project',${arg(area)},'Private')">Private · ${money(cost * S.MILLION)}</button><button class="secondary small" ${dis || (projects.length ? "disabled" : "")} onclick="F.action('project',${arg(area)},'Public')" title="Councils fund 45% when fan approval is 55%+ and condition is 85% or less; fan approval −5.">Public · ${money(Math.round(cost * 0.55 * S.MILLION))}</button></div></div>`).join("")}</div><p class="fp-note">Public funding needs fan approval of 55% or more and costs 5 points of fan approval.${canStadium ? "" : ` In your career role (${esc(state.franchise.role)}) the stadium is managed by ownership.`}</p>`,
      })}<div class="fp-stack-col">${fp.panel({
        kicker: "MATCH DAY",
        title: "Ticket pricing",
        body: `<div class="fp-row"><span>Attendance</span><b>${Math.round(c.attendance * 100)}%</b></div>${fp.blocks(c.attendance * 100, 100, 20, toneFor(c.attendance * 100, 85, 65))}<label class="fp-field">Ticket price ($)<input id="ticket-price" type="number" value="${st.ticket}" min="25" max="400"></label><button class="small" ${dis} onclick="F.action('ticket',document.getElementById('ticket-price').value)">Update pricing</button><p class="fp-note">Attendance responds to price and fan approval. Concessions and suites add club revenue.</p>`,
      })}${fp.panel({
        kicker: "OFFSEASON",
        title: "Relocation application",
        body: `<p class="fp-note">Reviewed in the offseason when stadium condition or local support justifies a move. Requires $400M in cash.</p><label class="fp-field">New city<input id="relocation-city" type="text" maxlength="40"></label><label class="fp-field">New team name<input id="relocation-name" type="text" maxlength="40"></label><button class="secondary small" ${dis} onclick="F.action('relocate',document.getElementById('relocation-city').value,document.getElementById('relocation-name').value)">Apply to relocate</button>`,
      })}</div></div>`;
    } else {
      const confidence = `<div class="fp-owner">${staffBust({ id: "owner-" + state.team, name: c.owner.name, role: "Owner" }, { size: 56, team: state.team })}<div><b>${esc(c.owner.name)}</b>${fp.chip(c.owner.trait, "accent")}</div></div><div class="fp-row"><span>Owner patience</span><b>${Math.round(c.owner.patience)}%</b></div>${fp.blocks(c.owner.patience, 100, 20, toneFor(c.owner.patience, 60, 40))}<div class="fp-row"><span>Fan approval</span><b>${Math.round(c.fanApproval)}%</b></div>${fp.blocks(c.fanApproval, 100, 20, toneFor(c.fanApproval, 60, 40))}<div class="fp-row"><span>Your job security</span><b class="fp-${toneFor(o.security, 60, 40)}">${o.security} · ${esc(o.status)}</b></div><button class="link" onclick="W.open('Boardroom')">Open the boardroom →</button>`;
      const people = `<ul class="fp-people">${staff
        .slice(0, 6)
        .map((p) => `<li>${staffBust(p, { size: 36, team: state.team, appearance: p.userControlled ? coachAppearance(state) : null })}<span><small>${esc(p.role)}</small><b>${esc(p.name)}</b></span><span class="fp-ovr">${p.rating}</span></li>`)
        .join("")}</ul><button class="link" onclick="W.open('Staff')">All ${staff.length} staff →</button>`;
      const infra = `<div class="fp-row"><span>Stadium condition</span><b>${Math.round(st.condition)}%</b></div>${fp.blocks(st.condition, 100, 20, toneFor(st.condition, 70, 45))}<div class="fp-row"><span>Medical tier</span>${tierTrack(st.medical)}</div><div class="fp-row"><span>Training tier</span>${tierTrack(st.training)}</div><div class="fp-row"><span>Live projects</span><b>${projects.length ? esc(projects[0].name) + " · " + projects[0].remaining + " left" : "None"}</b></div><button class="secondary small" onclick="FrontOffice.clubTab('Facilities')">Manage facilities</button>`;
      const ops = `<div class="fp-row"><span>Active players</span><b>${S.active(state).filter((p) => p.status === "active").length} / 53</b></div><div class="fp-row"><span>Cap room</span><b>${money(S.capLedger(state).room)}</b></div><div class="fp-row"><span>Staff budget</span><b>${money(payroll)} / ${money(c.staffBudget || payroll)}</b></div><div class="fp-links">${[
        ["Roster", "Squad & depth"],
        ["Contracts", "Cap sheet"],
        ["Development", "Development"],
        ["League", "League office"],
      ]
        .map(([r, l]) => `<button class="secondary small" onclick="W.open('${r}')">${l} →</button>`)
        .join("")}</div>`;
      const tracker = st.projects.length
        ? `<ul class="fp-timeline">${st.projects
            .slice()
            .reverse()
            .slice(0, 5)
            .map((p) => `<li class="${p.remaining > 0 ? "warn" : "good"}"><b>${esc(p.name)}</b>${fp.chip(p.remaining > 0 ? "In progress" : "Complete", p.remaining > 0 ? "warn" : "good")}<small>${p.remaining > 0 ? p.remaining + " calendar advances remaining" : "Completed"}</small></li>`)
            .join("")}</ul>`
        : `<p class="fp-note">Room to grow. Upgrade training, medical care or the stadium from Facilities.</p>`;
      body = `<div class="fp-grid-3">${fp.panel({ kicker: "OWNERSHIP", title: "Board confidence", body: confidence })}${fp.panel({ kicker: "PEOPLE", title: "Coaching staff", body: people })}${fp.panel({ kicker: "INFRASTRUCTURE", title: "Stadium & facilities", body: infra })}</div><div class="fp-grid-2">${fp.panel({ kicker: "FOOTBALL OPERATIONS", title: "Operations", body: ops })}${fp.panel({ kicker: "CONSTRUCTION", title: "Project tracker", body: tracker })}</div>`;
    }
    return `<div class="fp-page fp-club">${banner}${tiles}${tabsHTML}${body}</div>`;
  }
  const ownerNote = (trait) =>
    ({
      "Penny-Pincher": "Values financial discipline. Spending costs goodwill.",
      "Patient Rebuilder": "Accepts a rebuild if young players develop.",
      Meddler: "Wants a say. Missed targets cost patience quickly.",
    })[trait] || "Wants results now. Winning buys patience.";

  /* -------------------------------------------------------------- tactics */
  // Base plan up top; Situational, Advanced and Scheme fit behind tabs. Every option is a button
  // with a plain-English tooltip, and the selected option's explanation sits under its group.
  let tacticsTab = "base";
  const TX_TABS = [
    ["base", "Base plan"],
    ["situational", "Situational"],
    ["advanced", "Advanced"],
    ["fit", "Scheme fit"],
  ];
  const txBlocks = (v, n = 10, tone = "") =>
    `<span class="tx-blocks ${tone}" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${i < Math.round((Math.max(0, Math.min(100, v)) / 100) * n) ? "on" : ""}"></i>`).join("")}</span>`;
  const fitTone = (f) => (f >= 65 ? "good" : f >= 40 ? "warn" : "bad");
  const fitWord = (f) => (f >= 80 ? "Ideal" : f >= 65 ? "Good fit" : f >= 40 ? "Workable" : "Poor fit");
  function tacticsView() {
    if (typeof document !== "undefined" && document.querySelector && !document.querySelector('link[href="tactics.css"]'))
      document.head?.insertAdjacentHTML?.("beforeend", '<link rel="stylesheet" href="tactics.css">');
    const r = G.opponentReport(state),
      locked = !!state.live && !state.live.finished,
      plan = TX.planOf(state),
      fit = TX.schemeFit(state),
      boost = TX.schemeBoost(state, plan),
      dis = (key) => (locked || isBusy() || !G.canEdit(state, key) ? "disabled" : ""),
      value = (key) => G.settingValue(state, key),
      fitOf = (list, f) => list.find((x) => x.family === f);
    // One option group: label with help, buttons, and the selected option explained.
    const group = (key, { compact = false, fits = null, setKey = key, options = TX.OPTIONS[key].options, label = TX.OPTIONS[key].label, help = TX.OPTIONS[key].help } = {}) => {
      const cur = value(setKey),
        sel = options.find((x) => x.value === cur) || options[0];
      return `<div class="tx-group"><div class="tx-group-head"><label class="fo-label">${esc(label)}</label><span class="tx-help" title="${esc(help)}" aria-label="${esc(help)}" tabindex="0">?</span></div><div class="tx-opts ${compact ? "compact" : ""}" role="group" aria-label="${esc(label)}">${options
        .map((x) => {
          const f = fits?.(x.value);
          return `<button type="button" class="${cur === x.value ? "active" : ""}" aria-pressed="${cur === x.value}" title="${esc(x.label + ": " + x.tip)}" ${dis(setKey)} onclick="FrontOffice.plan(${arg(setKey)},${arg(x.value)})"><b>${esc(x.label)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ""}${f ? `<span class="tx-opt-fit">${txBlocks(f.fit, 8, fitTone(f.fit))}<em>${f.fit}</em></span>` : ""}</button>`;
        })
        .join("")}</div><p class="tx-explain"><b>${esc(sel.label)}.</b> ${esc(sel.tip)}</p></div>`;
    };
    const styleOptions = [
      { value: "Balanced", label: "Balanced", sub: "Run 1 in 3", tip: G.STYLES.Balanced },
      { value: "Run-first", label: "Run-first", sub: "Run 1 in 2", tip: G.STYLES["Run-first"] },
      { value: "Vertical offense", label: "Vertical", sub: "Deep shots", tip: G.STYLES["Vertical offense"] },
    ];
    const offFit = (v) => fitOf(fit.offense, v),
      covFit = (v) => (v === "Staff" ? null : fitOf(fit.coverage, ["Cover 0", "Cover 1"].includes(v) ? "Man" : "Zone")),
      frontFit = (v) => fitOf(fit.fronts, v);
    const covLabel = TX.optionOf("coverage", plan.coverage)?.label || plan.coverage;
    const summary = `<section class="fo-card tx-summary"><div class="tx-summary-row"><span class="tx-side">OFF</span><b>${esc(plan.scheme)}</b><i>${esc(plan.personnel)} personnel</i><i>${esc(plan.formation)}</i><i>${esc(styleOptions.find((x) => x.value === state.coach.style)?.label || "Balanced")}</i>${chip(fitWord(offFit(plan.scheme).fit), fitTone(offFit(plan.scheme).fit))}</div><div class="tx-summary-row"><span class="tx-side def">DEF</span><b>${esc(plan.front)}</b><i>${esc(covLabel)}</i><i>${esc(TX.optionOf("blitz", plan.blitz).label)} rush</i><i>4th down: ${esc(plan.fourth)}</i></div></section>`;
    const changed = (keys) => keys.filter((k) => value(k) !== TX.OPTIONS[k].options[0].value).length;
    const tabs = `<div class="tx-tabs" role="tablist" aria-label="Game plan sections">${TX_TABS.map(([id, label]) => {
      const n = id === "situational" ? changed(["third", "redZone", "goalLine", "twoMinute", "dThird", "dRedZone", "prevent"]) : id === "advanced" ? changed(["runConcept", "passConcept", "tempo", "runFit", "fakes", "onside"]) : 0;
      return `<button type="button" role="tab" class="${tacticsTab === id ? "active" : ""}" aria-selected="${tacticsTab === id}" onclick="FrontOffice.tacticsTab(${arg(id)})">${label}${n ? `<small>${n} on</small>` : ""}</button>`;
    }).join("")}</div>`;
    let body = "";
    if (tacticsTab === "base") {
      body = `${card("Offense", `${group("scheme", { fits: offFit })}${group("style", { setKey: "style", options: styleOptions, label: "Run–pass lean", help: "How often your staff run versus pass on early downs. The scheme decides which runs and passes they pick." })}<div class="tx-pair">${group("personnel", { compact: true })}${group("formation", { compact: true })}</div>`, `<span class="tx-head-note">Meters show how your roster fits each scheme</span>`)}${card("Defense", `${group("front", { setKey: "defense", fits: frontFit })}${group("coverage", { compact: true, fits: covFit })}${group("blitz")}`)}`;
    } else if (tacticsTab === "situational") {
      const chart = TX.fourthChart(plan.fourth),
        cell = (c) => `<td class="tx-c-${c === "Go" ? "go" : c === "Field goal" ? "fg" : "punt"}" title="${esc(c)}">${c === "Go" ? "GO" : c === "Field goal" ? "FG" : "PUNT"}</td>`;
      body = `${card("Offensive packages", `<p class="fo-note">Packages replace the base plan only in their situation. Your staff call them in simulated games and whenever they call plays.</p><div class="tx-pair">${group("third", { compact: true })}${group("redZone", { compact: true })}</div><div class="tx-pair">${group("goalLine", { compact: true })}${group("twoMinute", { compact: true })}</div>`)}${card("Fourth down", `${group("fourth")}<div class="tx-chart-wrap"><table class="tx-chart" aria-label="Fourth-down decisions by field position and yards to go"><thead><tr><th>To go</th>${TX.CHART_ZONES.map((z) => `<th>${esc(z.label)}</th>`).join("")}</tr></thead><tbody>${chart.map((row) => `<tr><th>& ${esc(row.label)}</th>${row.cells.map(cell).join("")}</tr>`).join("")}</tbody></table></div><p class="fo-note">Field position runs from your goal line (left) to theirs (right). When trailing late, every setting goes for it.</p>`)}${card("Defensive packages", `${group("dThird", { compact: true })}<div class="tx-pair">${group("dRedZone", { compact: true })}${group("prevent", { compact: true })}</div>`)}${card("Game-day control", `${group("calling", { setKey: "calling", options: Object.entries(G.CALLING).map(([v, sub]) => ({ value: v, label: v, sub, tip: v === "Manual" ? "You pick each play from the sideline in live games. Simulated games and fourth downs follow your game plan." : "Your staff call every snap from this game plan, live and simulated." })), label: "Who calls plays", help: "Live games only: whether you or your staff pick each play." })}<label class="fo-label">Head coach directives</label><div class="fo-toggles">${Object.entries(G.DIRECTIVES).map(([k, label]) => `<label class="fo-toggle"><input type="checkbox" ${value(k) ? "checked" : ""} ${dis(k)} onchange="FrontOffice.plan(${arg(k)},this.checked)"><span>${esc(label)}</span></label>`).join("")}</div><p class="fo-note">In simulated games, feeding the running back or protecting the quarterback overrides the play style on early downs.</p>`)}`;
    } else if (tacticsTab === "advanced") {
      body = `${card("Offense details", `${group("runConcept")}${group("passConcept")}${group("tempo")}`)}${card("Defense details", `${group("manZone")}<div class="tx-pair">${group("press", { compact: true })}${group("runFit", { compact: true })}</div>`)}${card("Special teams", `<div class="tx-pair">${group("fakes", { compact: true })}${group("onside", { compact: true })}</div><p class="fo-note">Both are off by default. Fourth-down fakes never happen in the last five minutes.</p>`)}`;
    } else {
      const row = (f, current) =>
        `<div class="tx-fit-row ${current ? "current" : ""}"><span class="tx-fit-name"><b>${esc(f.family)}</b>${current ? chip("Your plan", "good") : ""}</span>${txBlocks(f.fit, 10, fitTone(f.fit))}<em class="tx-fit-num ${fitTone(f.fit)}">${f.fit}</em><small>${esc(f.note)}</small></div>`;
      const curCov = plan.coverage === "Staff" ? "Zone" : ["Cover 0", "Cover 1"].includes(plan.coverage) ? "Man" : "Zone";
      // Positions sharing a fit change are listed together: "QB/RB/WR/TE/OL +0.5 · CB/S/LB +1".
      const byDelta = {};
      for (const [pos, d] of Object.entries(boost)) (byDelta[d] ??= []).push(pos);
      const effect = Object.entries(byDelta)
        .map(([d, list]) => `${list.join("/")} ${d > 0 ? "+" : ""}${d}`)
        .join(" · ");
      const best = fit.offense.slice().sort((a, b) => b.fit - a.fit)[0];
      body = `${card("How the scheme fits your roster", `<p class="fo-note">Fit compares the starters' ratings to what each system asks of them. A good fit adds up to 1.5 overall points to the players who run it in every game; a poor fit costs the same. Multiple and the staff coverage mix are neutral.</p><div class="tx-effect ${effect ? "" : "neutral"}"><span>In the sim this week</span><b>${effect ? esc(effect) + " overall" : "No fit bonus or penalty"}</b>${best.family !== plan.scheme ? `<small>Best offensive fit: ${esc(best.family)} (${best.fit}).</small>` : `<small>You are already in your best offensive fit.</small>`}</div><label class="fo-label">Offensive schemes</label><div class="tx-fit-list">${fit.offense.map((f) => row(f, f.family === plan.scheme)).join("")}</div><label class="fo-label">Coverage families</label><div class="tx-fit-list">${fit.coverage.map((f) => row(f, f.family === curCov || (f.family === "Press" && plan.press === "Press"))).join("")}</div><label class="fo-label">Fronts</label><div class="tx-fit-list">${fit.fronts.map((f) => row(f, f.family === plan.front)).join("")}</div>`)}`;
    }
    return `<div class="fo-page"><div class="fo-tactics"><div class="fo-plan">${locked ? '<p class="fo-banner">A game is in progress. Change calls from the sideline.</p>' : ""}${summary}${tabs}<div class="tx-panel" role="tabpanel">${body}</div></div><div class="fo-scout">${r ? opponentPanel(r, locked) : card("Opponent analysis", '<p class="fo-note">No upcoming opponent. The analysis returns when the next fixture is scheduled.</p>')}</div></div></div>`;
  }
  function opponentPanel(r, locked) {
    const name = clubs[r.team][2],
      t = r.tendencies,
      notes = TX.matchupNotes(state, r);
    const unitRows = r.units
      .map(
        (u) =>
          `<div class="fo-unit"><span>${esc(u.label)}<small>${u.side === "offense" ? "OFF" : "DEF"}</small></span>${meter(u.rating - 50, u.vsLeague >= 3 ? "bad" : u.vsLeague <= -3 ? "good" : "", 50)}<b>${u.rating}</b><em class="${u.vsLeague > 0 ? "up" : u.vsLeague < 0 ? "down" : ""}">${u.vsLeague > 0 ? "+" : ""}${u.vsLeague}</em></div>`,
      )
      .join("");
    const counters = r.counters
      .map((c) => {
        const label = c.key in G.DIRECTIVES ? (c.value ? "" : "Turn off: ") + G.DIRECTIVES[c.key] : `${{ style: "Play style", formation: "Formation", defense: "Front" }[c.key] || TX.OPTIONS[c.key]?.label || c.key}: ${c.value}`;
        return `<li><span><b>${esc(label)}</b><small>${esc(c.reason)}</small></span>${c.applied ? chip("In plan", "good") : `<button class="small" ${locked || isBusy() || !G.canEdit(state, c.key) ? "disabled" : ""} onclick="FrontOffice.plan(${arg(c.key)},${arg(c.value)})">Apply</button>`}</li>`;
      })
      .join("");
    const pending = r.counters.filter((c) => !c.applied && G.canEdit(state, c.key));
    return `<section class="fo-card fo-opponent"><div class="fo-card-head"><div class="fo-opp-head">${logo(r.team)}<div><span class="eyebrow">OPPONENT ANALYSIS · ${r.home ? "HOME" : "AWAY"}</span><h3>${esc(clubs[r.team][1] + " " + name)}</h3><small>${r.record.w}–${r.record.l} this season</small></div></div></div>
<div class="fo-split"><div><label class="fo-label">Strengths</label>${r.strengths.map((u) => chip(`${u.label} ${u.rating}`, "bad")).join("") || chip("None above league average")}</div><div><label class="fo-label">Weaknesses</label>${r.weaknesses.map((u) => chip(`${u.label} ${u.rating}`, "good")).join("") || chip("No clear weakness")}</div></div>
<label class="fo-label">Units vs league average</label><div class="fo-units">${unitRows}</div>
<label class="fo-label">Tendencies</label><div class="fo-tend"><div class="fo-runpass"><i style="width:${t.run}%">Run ${t.run}%</i><i style="width:${t.pass}%">Pass ${t.pass}%</i></div><div class="fo-row"><span>Offense</span><b>${esc(t.lean)} · coordinator: ${esc(t.oc)}</b></div><div class="fo-row"><span>Coverage</span><b>${esc(t.coverage)} · coordinator: ${esc(t.dc)}</b></div><small class="fo-note">Source: ${esc(t.source)}.</small></div>
${notes.length ? `<label class="fo-label">Their tendencies vs your plan</label><ul class="tx-notes">${notes.map((n) => `<li class="${n.tone}"><i aria-hidden="true">${n.tone === "good" ? "+" : n.tone === "bad" ? "!" : n.tone === "warn" ? "~" : "·"}</i><span>${esc(n.text)}</span></li>`).join("")}</ul>` : ""}
<label class="fo-label">Key players</label><div class="fo-keys">${r.keyPlayers.map((p) => `<button class="fo-key" onclick="W.player(${arg(p.id)},${r.team})"><b>${p.ovr}</b><span>${esc(p.name)}<small>${p.pos} · ${p.age}</small></span></button>`).join("")}</div>
<label class="fo-label">Suggested counters</label><ul class="fo-counters">${counters}</ul>${pending.length > 1 ? `<button ${locked || isBusy() ? "disabled" : ""} onclick="FrontOffice.applyCounters()">Apply all ${pending.length} counters</button>` : ""}</section>`;
  }

  /* ---------------------------------------------------------- locker room */
  // Morale-first pixel room: meters, the leadership group, open situations and promises, then a
  // paged grid of every player's mood with a way to talk to him. Styles live in people.css.
  const LR_PAGE = 12;
  const lrBlocks = (v, n = 20, tone = "", max = 100) =>
    `<span class="pp-blocks big ${tone}" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${i < Math.round((Math.max(0, Math.min(max, v)) / max) * n) ? "on" : ""}"></i>`).join("")}</span>`;
  function lockerView() {
    if (typeof document !== "undefined" && document.querySelector && !document.querySelector('link[href="people.css"]'))
      document.head?.insertAdjacentHTML?.("beforeend", '<link rel="stylesheet" href="people.css">');
    const r = lockerReport(state),
      dilemma = activeDilemma(state),
      lastCall = state.franchise.depth?.dilemmas?.find((d) => d.status === "resolved"),
      promises = state.franchise.cinema?.promises || [],
      open = promises.filter((p) => !p.done),
      closed = promises.filter((p) => p.done).slice(-3).reverse(),
      filters = [
        ["All", "Everyone", r.players.length],
        ["Unhappy", "Needs attention", r.unhappy.length],
        ["Starters", "Starters", r.players.filter((p) => p.starter).length],
      ],
      list = r.players.filter((p) => (lockerFilter === "Unhappy" ? p.concern : lockerFilter === "Starters" ? p.starter : true)),
      pages = Math.max(1, Math.ceil(list.length / LR_PAGE));
    lockerPage = Math.max(0, Math.min(lockerPage, pages - 1));
    const shown = list.slice(lockerPage * LR_PAGE, lockerPage * LR_PAGE + LR_PAGE),
      dramaTone = r.drama >= 55 ? "bad" : r.drama >= 35 ? "warn" : "good",
      face = (p, size) => pixelFace(state.roster.find((x) => x.id === p.id) || p, { size, team: state.team }),
      tone = (v, g, w) => toneFor(v, g, w);
    const gauge = (label, value, sub, t, v) =>
      `<div class="lr-meter ${t}"><span class="lr-meter-top"><small>${label}</small><b>${value}</b></span>${lrBlocks(v, 20, t)}<em>${sub}</em></div>`;
    const meters = `<section class="pp-panel lr-meters">${gauge("TEAM MORALE", r.teamMorale + "%", `${esc(r.pulseLabel)} · players average ${r.avgMorale}%`, tone(r.teamMorale, 70, 55), r.teamMorale)}${gauge("CHEMISTRY", Math.round(r.chemistry), `Adds ${r.moraleModifier > 0 ? "+" : ""}${r.moraleModifier} morale a week`, tone(r.chemistry, 65, 50), r.chemistry)}${gauge("DRAMA", Math.round(r.drama), r.drama >= 55 ? "Eroding chemistry · lower is better" : "Under control · lower is better", dramaTone, r.drama)}${gauge("LEADERSHIP", r.leadership, "Top three leaders' average", tone(r.leadership, 65, 45), r.leadership)}<div class="lr-spread-wrap"><span class="lr-spread-label"><small>MOOD OF ${r.players.length} PLAYERS</small><b class="${r.unhappy.length > 4 ? "bad" : r.unhappy.length ? "warn" : "good"}">${r.unhappy.length ? r.unhappy.length + " need attention" : "Nobody unsettled"}</b></span><div class="lr-spread">${Object.entries(r.counts)
      .map(([k, n]) => (n ? `<i class="${B_TONE[k] || "ok"}" style="flex:${n}" title="${k}: ${n}">${n}</i>` : ""))
      .join("")}</div><div class="lr-legend">${Object.entries(r.counts)
      .map(([k, n]) => `<span class="${B_TONE[k] || "ok"}"><i></i>${k} <b>${n}</b></span>`)
      .join("")}</div></div></section>`;
    const leaders = `<section class="pp-panel lr-leaders"><div class="pp-panel-head"><h3>Leadership group</h3><small>Captains set the tone</small></div>${r.leaders
      .map(
        (p, i) =>
          `<div class="lr-leader ${p.tone || "ok"}">${face(p, 40)}<span class="lr-id"><button class="link lr-name" onclick="W.player(${arg(p.id)},${state.team})">${esc(p.name)}</button><small><em class="pp-pos">${p.pos}</em>${i < 3 ? "Captain" : "Leader"} · leadership ${p.leadership}</small></span><span class="lr-leader-mood"><b>${p.morale}%</b><small>${p.mood}</small></span><button class="secondary small" onclick="CI.open('player',${arg(p.id)})">Talk</button></div>`,
      )
      .join("")}</section>`;
    const situation = dilemma
      ? `<div class="lr-dilemma"><span class="pp-chip bad">Decision needed</span><b>${esc(dilemma.title)}</b><p>${esc(dilemma.body)}</p><div class="lr-choices">${dilemma.choices.map((ch) => `<button class="secondary small" onclick="FrontOffice.dilemma(${arg(dilemma.id)},${arg(ch.id)})">${esc(ch.label)}</button>`).join("")}</div></div>`
      : `<div class="lr-dilemma calm"><span class="pp-chip good">No open situation</span>${lastCall ? `<p>Last call: <b>${esc(lastCall.title)}</b> · ${esc(lastCall.outcome)}</p>` : "<p>Dressing-room situations appear here after games. Your call moves morale, drama and chemistry.</p>"}</div>`;
    const room = `<section class="pp-panel lr-room"><div class="pp-panel-head"><h3>What is moving the room</h3><button class="link lr-more" onclick="CI.open('team')">Team meeting →</button></div><ul class="lr-causes lr-drivers">${r.teamCauses.map(roomDriver).join("")}</ul>${situation}</section>`;
    const promiseRow = (p) =>
      `<li class="${p.done ? "done" : p.dueNow ? "due" : ""}"><span><b>${esc(p.name)}</b><small>${esc(p.type)} · promised week ${(p.week ?? 0) + 1}</small></span>${
        p.done
          ? `<em class="pp-chip ${/review|kept/i.test(p.outcome || "") ? "good" : "bad"}">${esc(p.outcome || "Closed")}</em>`
          : `${p.dueNow ? '<em class="pp-chip warn">Review now</em>' : `<em class="pp-chip">Due wk ${p.due + 1}</em>`}<button class="secondary small" onclick="CI.open('player',${arg(p.playerId)})">Meet</button>`
      }</li>`;
    const shownPromises = [...open.slice(0, 4), ...closed].slice(0, 5);
    const promiseCard = `<section class="pp-panel lr-promises"><div class="pp-panel-head"><h3>Promises</h3><small>${open.length} open</small></div>${
      shownPromises.length
        ? `<ul class="lr-promise-list">${shownPromises.map(promiseRow).join("")}</ul>`
        : '<p class="pp-none">No promises on record. Promising a role review in a conversation adds one here; meet the player by the due week to keep it.</p>'
    }<button class="link lr-more" onclick="W.open('Conversations')">All conversations →</button></section>`;
    const card = (p) =>
      `<article class="lr-card ${p.tone || "ok"}"><div class="lr-card-top">${face(p, 44)}<span class="lr-id"><button class="link lr-name" onclick="W.player(${arg(p.id)},${state.team})">${esc(p.name)}</button><small><em class="pp-pos">${p.pos}</em>${p.ovr} OVR${p.starter ? " · starter" : ""}</small></span><span class="lr-mood">${p.mood}</span></div><div class="lr-card-meter"><span>Morale</span>${lrBlocks(p.morale, 10, p.tone || "")}<b>${p.morale}</b></div><div class="lr-card-meter"><span>Trust</span>${lrBlocks(p.trust, 10, "", 99)}<b>${p.trust}</b></div><p class="lr-why ${p.causes[0]?.tone || ""}" title="${esc(p.causes.map((c) => c.text).join(" · "))}">${esc(p.causes[0]?.text || "—")}</p><div class="lr-card-actions"><button class="small" onclick="CI.open('player',${arg(p.id)})">Talk</button><button class="secondary small" title="A quick one-on-one: support, challenge or clarify his role" onclick="F.meeting(${arg(p.id)})">Quick word</button></div></article>`;
    const range = list.length ? `${lockerPage * LR_PAGE + 1}–${Math.min(list.length, (lockerPage + 1) * LR_PAGE)} of ${list.length} players` : "0 players";
    const grid = `<section class="pp-panel lr-squad"><div class="pp-panel-head"><h3>Player moods</h3><small>Lowest morale first · one conversation per player each week</small></div><div class="pp-bar"><div class="pp-seg" role="group" aria-label="Filter players">${filters
      .map(([k, label, n]) => `<button class="${lockerFilter === k ? "on" : ""}" aria-pressed="${lockerFilter === k}" onclick="FrontOffice.locker(${arg(k)})">${label} <small>${n}</small></button>`)
      .join("")}</div></div><div class="lr-grid">${shown.map(card).join("") || '<p class="pp-none">Every player is at least content. Keep it that way.</p>'}</div><div class="pp-pager"><span>${range}</span><span>Page ${lockerPage + 1} / ${pages}</span><button class="secondary small" ${lockerPage ? "" : "disabled"} onclick="FrontOffice.lockerPage(-1)">Previous</button><button class="secondary small" ${lockerPage + 1 < pages ? "" : "disabled"} onclick="FrontOffice.lockerPage(1)">Next</button></div></section>`;
    return `<div class="pp-page lr-page">${meters}<div class="lr-row">${leaders}${room}${promiseCard}</div>${grid}</div>`;
  }
  const B_TONE = { Happy: "good", Content: "", Unsettled: "warn", Unhappy: "bad" };

  window.FrontOffice = {
    mandate: (key) => mutate((s) => B.setMandate(s, key), `${key} mandate agreed with ownership.`),
    budget: () =>
      mutate(
        (s) => B.requestStaffBudget(s),
        (r) => (r.amount ? `Ownership ${r.outcome === "Partial" ? "partly " : ""}approved +${money(r.amount)} for staff.` : "Ownership declined the budget request."),
      ),
    invest: (area) => mutate((s) => B.investFacility(s, area), `${B.FACILITIES[area].label} upgrade started.`),
    plan: (key, value) => mutate((s) => G.setGamePlan(s, key, value), "Game plan updated."),
    tacticsTab: (tab) => {
      tacticsTab = tab;
      render();
    },
    applyCounters: () =>
      mutate((s) => {
        const r = G.opponentReport(s);
        for (const c of r?.counters || []) if (!c.applied && G.canEdit(s, c.key)) G.setGamePlan(s, c.key, c.value);
      }, "Counters added to the game plan."),
    clubTab: (t) => {
      clubTab = t;
      render();
    },
    locker: (f) => {
      lockerFilter = f;
      lockerPage = 0;
      render();
    },
    lockerPage: (d) => {
      lockerPage = Math.max(0, lockerPage + d);
      render();
    },
    dilemma: (id, choice) => mutate((s) => resolveDilemma(s, id, choice), (r) => `Decision made: ${r.outcome}`),
  };
  views.Boardroom = boardView;
  views.Club = clubView;
  views["Locker room"] = lockerView;
  // The legacy Tactics route renders game.js's plan(); replace it with the franchise game plan.
  window.plan = tacticsView;
}

// One "What is moving the room" row: pixel glyph, bold title, detail/quote, and value chips or meters.
const DRIVER_GLYPH = { form: "▮▯▮", pulse: "◆", leaders: "★", talk: "✎", press: "◉" };
function roomDriver(c) {
  if (!c.kind) return `<li class="${c.tone || ""}">${esc(c.text)}</li>`;
  const verdict = c.tone === "good" ? "Lifting" : c.tone === "bad" ? "Dragging" : "Neutral";
  const blocks = (v, invert) => { const n = Math.max(0, Math.min(10, Math.round((Number(v) || 0) / 10))); return `<span class="lr-blocks ${invert ? "inv" : ""}">${Array.from({ length: 10 }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>`; };
  const stat = (x) => `<span class="lr-stat ${x.tone || ""}"><small>${esc(x.label)}</small>${x.meter != null ? blocks(x.meter, x.invert) : ""}<b>${esc(String(x.value))}</b></span>`;
  const form = c.results?.length ? `<span class="lr-form">${c.results.map((r) => `<b class="${r === "W" ? "w" : r === "L" ? "l" : "t"}">${esc(r)}</b>`).join("")}</span>` : "";
  const who = c.player ? `<span class="lr-who">${c.player.id ? `<button class="link" onclick="W.player('${c.player.id}',state.team)">${esc(c.player.name)}</button>` : esc(c.player.name)}<em>${esc(c.player.stance)}</em><span class="lr-stat ${c.player.trust > 0 ? "good" : c.player.trust < 0 ? "bad" : ""}"><small>Trust</small><b>${c.player.trust > 0 ? "+" : ""}${c.player.trust}</b></span></span>` : "";
  return `<li class="lr-driver ${c.tone || ""}"><span class="lr-glyph" aria-hidden="true">${DRIVER_GLYPH[c.kind] || "■"}</span><div class="lr-body"><div class="lr-top"><b class="lr-title">${esc(c.title)}</b><em class="lr-verdict">${verdict}</em></div>${c.quote ? `<q class="lr-quote">${esc(c.quote)}</q>` : ""}${c.detail ? `<p class="lr-detail">${esc(c.detail)}</p>` : ""}${form || (c.stats?.length || who) ? `<div class="lr-stats">${form}${(c.stats || []).map(stat).join("")}${who}</div>` : ""}</div></li>`;
}
