import {installCalendarUI} from './calendar-ui.mjs';
import {ensureCalendar} from './calendar-core.mjs';
import {ensureDelegation} from './delegation.mjs';
import { recordDecision, capturePreseason } from "./career-systems.mjs";
import { configureCareerHistory } from "./records.mjs";
import { installExpansionUI } from "./expansion-ui.mjs";
import { migrateImmersion } from "./immersion.mjs";
import { installStaffUI } from "./staff-ui.mjs";
import { ensureStaff } from "./staff.mjs";
import { assertCanAdvance, complianceReport } from "./compliance.mjs";
import { installTouchlineUI } from "./touchline-ui.mjs";
import { installNegotiationUI } from "./negotiation-ui.mjs";
import { installSocialNetwork } from "./social-ui.mjs";
import { installHubUI } from "./hub-ui.mjs";
import { installRecruitmentUI } from "./recruitment-ui.mjs";
import { installPlayerUI } from "./player-ui.mjs";
import { installOfficeUI } from "./office-ui.mjs";
import { officeCounts, ensureOffice } from "./newsroom.mjs";
import { installCareerManager } from "./career-manager.mjs";
import { installDevelopmentUI } from "./development-ui.mjs";
import { installCareerScenes } from "./career-scenes.mjs";
import { configureRatings, ensureCareerRatings } from "./ratings.mjs";
import { installMatchdaySim } from "./matchday-sim.mjs";
import * as S from "./state.mjs";
import * as C from "./contracts.mjs";
import * as P from "./personnel.mjs";
import * as W from "./world.mjs";
import * as H from "./history.mjs";
import * as DB from "./database.mjs";
import * as L from "./lifecycle.mjs";
const previous = {
  render,
  go,
  money,
  beginLive,
  nextSeason,
  commitMatch,
  advance,
  startCareer,
  toggleStarter,
  subPlayer,
  matchSetting,
  cname,
  logo,
};
let section = "Overview",
  busy = false,
  stopHoliday = false,
  importCandidate = null;
const sections = [
  "Overview",
  "Calendar",
  "Career dossier",
  "Boardroom",
  "Records",
  "Awards",
  "League desk",
  "Career",
  "Staff",
  "Contracts",
  "Market",
  "Roster",
  "Scouting",
  "Draft",
  "Club",
  "Medical",
  "Locker room",
  "League",
  "Archives",
  "Conversations",
  "Hall of Fame",
  "Next generation",
  "Development",
  "Careers & saves",
  "Database",
  "Inbox",
  "News",
  "Statistics",
  "Analysis",
  "Settings",
  "Debug",
];
const moneyText = (n) => "$" + (n / S.MILLION).toFixed(2) + "M";
const choice = (values, current) =>
  values
    .map((v) => `<option ${v === current ? "selected" : ""}>${esc(v)}</option>`)
    .join("");
const can = (area) => S.allowed(state, area),
  disabled = (area) => (can(area) ? "" : "disabled");
const button = (text, code, area = "", secondary = false) =>
  `<button class="${secondary ? "secondary " : ""}small" onclick="${code}" ${(busy && !code.includes("stopHoliday")) || (area && !can(area)) ? "disabled" : ""}>${text}</button>`;
const panel = (title, body, extra = "") =>
  `<div class="panel f-panel"><div class="panel-head"><h2>${title}</h2>${extra}</div><div class="pad">${body}</div></div>`;
const table = (headers, rows) =>
  `<div class="scroll f-table"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${headers.length}">No records yet.</td></tr>`}</tbody></table></div>`;
const stat = (label, value, small = "") =>
  `<div class="stat"><div class="label">${label}</div><b>${value}</b><small>${small}</small></div>`;
function initialize() {
  S.migrate(state);
  ensureStaff(state);
  ensureCalendar(state);ensureDelegation(state);
  capturePreseason(state);
  migrateImmersion(state);
  for (let p of [...state.roster, ...state.agents]) {
    p.stats ??= {};
    p.wear ??= { knee: 0, ankle: 0, shoulder: 0, back: 0 };
    p.fitness ??= 100;
    p.morale ??= 75;
  }
  if (!state.franchise.history.length)
    state.franchise.history = structuredClone(H.historicChampions);
  if (!state.franchise.staffPool) {
    state.franchise.staffPool = Array.from({ length: 15 }, (_, i) => ({
      id: "candidate-" + i,
      name: [
        "Avery Mitchell",
        "Cameron Foster",
        "Riley Bennett",
        "Drew Marshall",
        "Casey Reed",
      ][i % 5],
      role: ["HC", "OC", "DC", "Scout", "GM"][i % 5],
      rating: 65 + i * 2,
      salary: (1 + (i % 5)) * S.MILLION,
      scheme: ["Balanced", "Vertical offense", "Run-first"][i % 3],
      years: 3,
      compEligible: false,
    }));
  }
  for (let t of state.franchise.clubs) {
    t.identity ??= {
      abbr: clubs[t.id][0],
      city: clubs[t.id][1],
      name: clubs[t.id][2],
      division: clubs[t.id][3],
    };
    if (!t.stadium.city || t.stadium.city === "Home market")
      t.stadium.city = clubs[t.id][1];
    if (t.stadium.name === "Home Field")
      t.stadium.name = clubs[t.id][1] + " Field";
  }
}
function mark(message) {
  state.franchise.audit ??= [];
  state.franchise.audit.unshift({
    year: state.year,
    week: state.week,
    message,
  });
  state.franchise.audit = state.franchise.audit.slice(0, 100);
}
function action(name, ...args) {
  if (busy) return;
  try {
    if (
      state.live &&
      !["meeting", "prepare", "skill", "directive", "debugRating"].includes(
        name,
      )
    )
      throw Error(
        "Complete the live game before making franchise transactions.",
      );
    state = S.transact(state, (s) => {
      switch (name) {
        case "interview":
          W.careerInterview(s);
          break;
        case "offer":
          C.offer(s, ...args);
          break;
        case "cut":
          C.cut(s, ...args);
          break;
        case "restructure":
          C.restructure(s, ...args);
          break;
        case "tag":
          C.tag(s, ...args);
          break;
        case "trade":
          C.trade(s, ...args);
          break;
        case "move":
          P.movePlayer(s, ...args);
          break;
        case "protect":
          P.protect(s, ...args);
          break;
        case "claim":
          P.claim(s, ...args);
          break;
        case "scout":
          P.scout(s, ...args);
          break;
        case "prepare":
          P.prepare(s, ...args);
          break;
        case "draftStart":
          P.beginDraft(s);
          break;
        case "draftPick":
          P.draftPick(s, ...args);
          break;
        case "tradeDown":
          P.tradeDown(s);
          break;
        case "recruit":
          P.recruitDepth(s);
          break;
        case "trim":
          P.trimRoster(s);
          break;
        case "marketDay":
          W.marketDay(s);
          break;
        case "meeting":
          W.meeting(s, ...args);
          break;
        case "project":
          W.stadiumProject(s, ...args);
          break;
        case "relocate":
          W.relocate(s, ...args);
          break;
        case "vote":
          W.vote(s, ...args);
          break;
        case "hire":
          W.hire(
            s,
            s.franchise.staffPool.find((p) => p.id === args[0]),
          );
          break;
        case "skill":
          W.buySkill(s, ...args);
          break;
        case "role":
          if (!S.ROLES[args[0]]) throw Error("Unknown career role.");
          s.franchise.role = args[0];
          s.coach.calling = ["Owner", "HC", "OC", "DC"].includes(args[0])
            ? "Manual"
            : "Head coach";
          break;
        case "profile":
          Object.assign(s.franchise.career, args[0]);
          break;
        case "directive":
          if (!Object.hasOwn(s.franchise.directives, args[0]))
            throw Error("Invalid directive.");
          s.franchise.directives[args[0]] = args[1];
          break;
        case "ticket":
          S.requireRole(s, "stadium");
          {
            let c = s.franchise.clubs[s.team],
              v = Number(args[0]);
            if (!Number.isFinite(v) || v < 25 || v > 400)
              throw Error("Ticket price must be $25–400.");
            c.stadium.ticket = v;
          }
          break;
        case "camp":
          S.requireRole(s, "roster");
          while (s.roster.length < 90) {
            let i = s.roster.length,
              p = S.makePlayer(
                `camp-${s.year}-${(s.franchise.spawnSerial = (s.franchise.spawnSerial || 0) + 1)}`,
                S.POS[i % 22],
                s.year + i,
              );
            p.salary = 0.8;
            s.roster.push(p);
            s.franchise.contracts[p.id] = S.basicContract(p, s.team, s.year);
          }
          if (S.capLedger(s).room < 0)
            throw Error(
              "Inviting a full camp roster would exceed the salary cap.",
            );
          break;
        case "event":
          if (!s.franchise.debug) throw Error("Enable developer mode first.");
          W.forceEvent(s, args[0]);
          break;
        case "debug":
          s.franchise.debug = !s.franchise.debug;
          s.debugSave = true;
          break;
        case "debugRating":
          if (!s.franchise.debug) throw Error("Enable developer mode first.");
          {
            let p = s.roster.find((p) => p.id === args[0]),
              v = Number(args[1]);
            if (!p || !Number.isFinite(v) || v < 1 || v > 99)
              throw Error("Invalid rating edit.");
            p.ovr = v;
            p.pot = Math.max(p.pot, v);
          }
          break;
        case "capOverride":
          if (!s.franchise.debug) throw Error("Enable developer mode first.");
          {
            let n = Number(args[0]);
            if (!Number.isFinite(n) || n < 100 || n > 1000)
              throw Error("Cap override must be $100M–1000M.");
            s.franchise.rules.cap = Math.round(n * S.MILLION);
          }
          break;
        case "import":
          DB.importPack(s, args[0]);
          break;
        default:
          throw Error("Unknown action.");
      }
    });
    mark(name);
    save();
    render();
    toast("Franchise updated");
    return true;
  } catch (error) {
    toast(error.message);
    return false;
  }
}
window.F = {
  action,
  tab(name) {
    if (!sections.includes(name)) return;
    section = name;
    view = "Franchise";
    render();
  },
  offer(id) {
    let p = state.agents.find((p) => p.id === id);
    if (!p) return;
    modal(
      `<h2>Offer ${esc(p.name)} a contract</h2><p>All figures in millions. Signing bonuses prorate over up to five years, including void years. Incentives use a five-touchdown target.</p><form id="contract-form" onsubmit="event.preventDefault();F.submitOffer('${id}')"><div class="f-form-grid">${[
        ["annual", "Annual base", p.salary, "number"],
        ["years", "Years", 3, "number"],
        ["bonus", "Signing bonus", p.salary * 0.5, "number"],
        ["guaranteed", "Guaranteed base", p.salary, "number"],
        ["roster", "Annual roster bonus", 0, "number"],
        ["workout", "Annual workout bonus", 0, "number"],
        ["voidYears", "Void years", 0, "number"],
        ["incentive", "Touchdown incentive", 0, "number"],
      ]
        .map(
          ([name, label, value, type]) =>
            `<label>${label}<input name="${name}" type="${type}" min="0" step="${["years", "voidYears"].includes(name) ? "1" : ".1"}" value="${Number(value).toFixed(["years", "voidYears"].includes(name) ? 0 : 1)}" required></label>`,
        )
        .join(
          "",
        )}<label>Incentive classification<select name="incentiveType"><option>NLTBE</option><option>LTBE</option></select></label><label><input type="checkbox" name="noTrade"> No-trade clause</label></div><div class="modal-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button ${disabled("finance")}>Submit offer</button></div></form>`,
    );
  },
  submitOffer(id) {
    let form = new FormData(document.getElementById("contract-form")),
      terms = Object.fromEntries(form);
    terms.noTrade = form.has("noTrade");
    if (action("offer", id, terms)) closeModal();
  },
  contract(id) {
    let p = state.roster.find((p) => p.id === id),
      c = state.franchise.contracts[id];
    if (!p || !c) return;
    modal(
      `<h2>${esc(p.name)} · Contract</h2><p>${c.noTrade ? "No-trade clause · " : ""}${c.years} years + ${c.voidYears} void years. Signing bonus ${moneyText(c.bonus)}.</p>${table(
        ["Year", "Base", "Bonus / other", "Cap charge"],
        Array.from(
          { length: c.years + c.voidYears },
          (_, i) =>
            `<tr><td>${c.start + i}</td><td>${moneyText(c.base[i] || 0)}</td><td>${moneyText(S.capHit(c, c.start + i) - (c.base[i] || 0))}</td><td>${moneyText(S.capHit(c, c.start + i))}</td></tr>`,
        ),
      )}<label>Convert base to bonus ($M)<input type="number" id="restructure-amount" min="0" step=".1" value="1"></label><div class="modal-actions">${button("Restructure", `if(F.action('restructure','${id}',document.getElementById('restructure-amount').value))closeModal()`, "finance")}${button("Franchise tag", `if(F.action('tag','${id}','Non-exclusive franchise'))closeModal()`, "finance")}${button("Transition tag", `if(F.action('tag','${id}','Transition'))closeModal()`, "finance")}<button class="secondary small" onclick="closeModal()">Close</button></div>`,
    );
  },
  release(id) {
    let p = state.roster.find((p) => p.id === id);
    if (!p) return;
    let before = S.capLedger(state),
      preview;
    try {
      preview = S.transact(state, (s) => C.cut(s, id, false));
    } catch {}
    let after = preview ? S.capLedger(preview) : null;
    modal(
      `<h2>Waive ${esc(p.name)}?</h2><p>${after ? `Current cap charge: ${moneyText(before.used)} → ${moneyText(after.used)}. Dead cap is retained.` : "Immediate release cannot be completed under the current cap or career role."}</p><div class="modal-actions">${button("Release now", `if(F.action('cut','${id}',false))closeModal()`, "roster")}${button("Post-June accounting", `if(F.action('cut','${id}',true))closeModal()`, "roster")}<button class="secondary small" onclick="closeModal()">Keep player</button></div>`,
    );
  },
  trade() {
    let ours = document.getElementById("trade-out").value,
      other = Number(document.getElementById("trade-team").value),
      target = document.getElementById("trade-in").value;
    action("trade", ours, other, target);
  },
  tradeTeam() {
    render();
  },
  meeting(id) {
    modal(
      `<h2>One-on-one conversation</h2><p>Choose a response. The player’s ambition affects how a challenge is received.</p><div class="modal-actions">${["Support", "Challenge", "Clarify role"].map((t) => button(t, `if(F.action('meeting','${id}','${t}'))closeModal()`, "media")).join("")}<button class="small secondary" onclick="closeModal()">Close</button></div>`,
    );
  },
  async importFile(input) {
    try {
      let file = input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) throw Error("Import limited to 5 MB.");
      let text = await file.text();
      importCandidate = file.name.toLowerCase().endsWith(".csv")
        ? DB.parseCSV(text)
        : JSON.parse(text);
      let summary = DB.validatePack(importCandidate);
      modal(
        `<h2>Review database import</h2><p>${summary.players} players, ${summary.teams} team identities, ${summary.history} historical records. Teams included in this pack will have their player databases replaced. A backup export is recommended.</p><div class="modal-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button onclick="F.commitImport()">Apply validated pack</button></div>`,
      );
    } catch (e) {
      toast(e.message);
    }
  },
  commitImport() {
    if (importCandidate && action("import", importCandidate)) {
      importCandidate = null;
      closeModal();
    }
  },
  export() {
    let data = DB.exportPack(state),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `gridiron-database-${state.year}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  downloadSave() {
    let url = URL.createObjectURL(
        new Blob([JSON.stringify(state)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `gridiron-career-${state.year}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
function overviewView() {
  let f = state.franchise,
    c = f.clubs[state.team],
    cap = S.capLedger(state),
    issues = S.gameEligibility(state);
  return `<div class="stats">${stat("CAREER ROLE", f.role, "Responsibilities are enforced")}${stat("CAP ROOM", moneyText(cap.room), "Includes dead money and rollover")}${stat("OWNERSHIP CASH", moneyText(c.cash), c.owner.trait)}${stat("ACTIVE ROSTER", S.active(state).filter((p) => p.status === "active").length + " / 53", situation())}</div>${issues.length ? panel("Before your next game", issues.map((x) => `<p class="negative">${esc(x)}</p>`).join("") + button("Manage roster", "F.tab('Roster')")) : ""}<div class="two">${panel(
    "Assistant delegation",
    `<p class="subtitle">Set your directives before delegating the next game or a period.</p>${Object.entries(
      f.directives,
    )
      .map(
        ([k, v]) =>
          `<label class="f-check"><input type="checkbox" ${v ? "checked" : ""} onchange="F.action('directive','${k}',this.checked)"> ${{ protectQB: "Protect the QB — short passing", feedRB: "Feed RB1 — rushing preference", rookies: "Young players in fourth-quarter blowouts", halftime: "Delegate halftime adjustments" }[k]}</label>`,
      )
      .join(
        "",
      )}<div class="f-actions">${button("Sim next game", "F.holiday(1)")}${button("Sim 4 weeks", "F.holiday(4)", "", true)}${button("Sim to offseason", "F.holiday(25)", "", true)}${busy ? button("Stop after this week", "F.stopHoliday()", "", true) : ""}</div><p id="holiday-progress" class="subtitle">${busy ? "Assistant is simulating…" : "Calendar pauses after the championship."}</p>`,
  )}${panel(
    "Franchise news",
    f.events
      .slice(0, 6)
      .map(
        (e) =>
          `<article class="f-news"><small>${e.year} · Week ${e.week + 1} · ${esc(e.kind)}</small><h3>${esc(e.title)}</h3><p>${esc(e.body)}</p></article>`,
      )
      .join("") ||
      '<p class="subtitle">Franchise updates will appear here.</p>',
  )}</div>`;
}
function situation() {
  return state.franchise.calendar.stage + " · " + phaseName();
}
function careerView() {
  let f = state.franchise,
    c = f.career,
    club = f.clubs[state.team];
  return `<div class="two">${panel(
    "Your career",
    `<div class="coach-card"><div class="coach-portrait" style="background:${esc(c.avatar?.shirt || "#314b60")};color:${esc(c.avatar?.skin || "#e0b18c")}">♟</div><div><h2>${esc(state.coach.name)}</h2><p class="subtitle">${esc(c.origin)} · ${esc(c.archetype)}</p></div></div><label>Career role<select onchange="F.action('role',this.value)">${choice(Object.keys(S.ROLES), f.role)}</select></label><p class="subtitle">${esc((S.ROLES[f.role] || []).join(" · "))}</p><div class="f-form-grid"><label>Background<select id="career-origin">${choice(["Former Player", "Analytics Guru", "College Innovator"], c.origin)}</select></label><label>Archetype<select id="career-archetype">${choice(["Offensive Guru", "Defensive Genius", "Development Wizard", "Cap Strategist"], c.archetype)}</select></label><label>Avatar shirt<input type="color" id="career-shirt" value="${c.avatar?.shirt || "#314b60"}"></label><label>Avatar skin<input type="color" id="career-skin" value="${c.avatar?.skin || "#e0b18c"}"></label></div>${button("Save profile", "F.action('profile',{origin:document.getElementById('career-origin').value,archetype:document.getElementById('career-archetype').value,avatar:{shirt:document.getElementById('career-shirt').value,skin:document.getElementById('career-skin').value}})")}<div class="kv"><span>Reputation / development XP</span><b>${c.reputation} / ${c.xp}</b></div>${["OC", "DC"].includes(f.role) ? button("Interview for a head coach role", "F.action('interview')") : ""}${Object.entries(
      c.skills,
    )
      .map(
        ([k, v]) =>
          `<div class="kv"><span>${esc(k)} · level ${v}</span>${button("Train · 100 XP", `F.action('skill','${k}')`)}</div>`,
      )
      .join("")}`,
  )}${panel("Coaching department", `<p>Review your staff, conduct interviews and manage appointments in the dedicated staff hub.</p><button onclick="W.open('Staff')">Open coaching staff →</button>`)}</div>`;
}

function contractsView() {
  let cap = S.capLedger(state),
    f = state.franchise;
  return `<div class="stats">${stat("CAP LIMIT", moneyText(cap.limit))}${stat("LIVE COMMITMENTS", moneyText(cap.live))}${stat("DEAD MONEY", moneyText(cap.dead), "Incentive adjustment " + moneyText(cap.adjustments || 0))}${stat("AVAILABLE", moneyText(cap.room))}</div>${panel(
    "Contract ledger",
    table(
      ["Player", "Term", "Current cap", "Guarantees remaining", "Actions"],
      state.roster.map((p) => {
        let c = f.contracts[p.id];
        return `<tr><td>${esc(p.name)}<small>${p.pos} · ${p.status}</small></td><td>${c.start}–${c.start + c.years - 1}${c.voidYears ? "<small>" + c.voidYears + " void years</small>" : ""}</td><td>${moneyText(S.capHit(c, S.financeYear(state)))}</td><td>${moneyText(c.guarantees.slice(Math.max(0, S.financeYear(state) - c.start)).reduce((a, b) => a + b, 0))}</td><td>${button("Structure", `F.contract('${p.id}')`, "", true)} ${button("Waive", `F.release('${p.id}')`, "roster", true)}</td></tr>`;
      }),
    ),
  )}<p class="subtitle">Signing/restructure bonuses, roster/workout bonuses, guarantees, incentives, void years, tags and dead cap are tracked.</p>`;
}
function marketView() {
  let f = state.franchise;
  return `${panel("Free agency market", `<div class="f-actions"><span class="tag green">${f.market.phase} · Day ${f.market.day}</span>${button("Advance market day", "F.action('marketDay')")}</div><p class="subtitle">Offers compete on total value, guarantees, contender strength, coaching prestige, scheme preference and simulated tax burden. Agreements settle after their decision deadline; tampering has no binding signings.</p>`)}${panel(
    "Free agents and bidding",
    table(
      ["Player", "Age / rating", "Asking base", "Bidders", "Your action"],
      state.agents
        .slice()
        .sort((a, b) => b.ovr - a.ovr)
        .map(
          (p) =>
            `<tr><td>${esc(p.name)}<small>${p.pos}</small></td><td>${p.age} · ${p.ovr}</td><td>${moneyText(p.salary * S.MILLION)}</td><td>${
              f.market.offers
                .filter((o) => o.playerId === p.id)
                .map(
                  (o) => `${clubs[o.team][0]} ${moneyText(o.contract.base[0])}`,
                )
                .join("<br>") || "No offers yet"
            }</td><td>${button("Negotiate", `F.offer('${p.id}')`, "finance")}</td></tr>`,
        ),
    ),
  )}${tradeView()}`;
}
let tradeTeam = 0;
function tradeView() {
  let other = tradeTeam === state.team ? 1 : tradeTeam;
  return panel(
    "Trade negotiation",
    `<div class="f-form-grid"><label>Your player<select id="trade-out">${state.roster.map((p) => `<option value="${p.id}">${esc(p.name)} · ${p.ovr}</option>`).join("")}</select></label><label>Trade partner<select id="trade-team" onchange="F.selectTradeTeam(this.value)">${clubs.map((c, i) => (i !== state.team ? `<option value="${i}" ${i === other ? "selected" : ""}>${c[1]} ${c[2]}</option>` : "")).join("")}</select></label><label>Their player<select id="trade-in">${S.roster(
      state,
      other,
    )
      .map((p) => `<option value="${p.id}">${esc(p.name)} · ${p.ovr}</option>`)
      .join(
        "",
      )}</select></label></div>${button("Propose player swap", "F.trade()", "roster")}<p class="subtitle">CPU value, no-trade clauses and both teams’ cap consequences are checked before an exchange.</p>`,
  );
}
window.F.selectTradeTeam = (value) => {
  tradeTeam = Number(value);
  render();
};
function rosterView() {
  let f = state.franchise;
  return `${panel("Roster operations", `<div class="f-actions">${button("Assistant depth chart", "F.depth()", "coach")}${button("Trim active roster to 53", "F.action('trim')", "roster")}${button("Delegate reserve recruitment", "F.action('recruit')")} ${button("Invite camp roster to 90", "F.action('camp')", "roster")}</div><p class="subtitle">${S.active(state).filter((p) => p.status === "active").length} active · ${state.roster.filter((p) => p.status === "practice").length}/16 practice squad · ${state.roster.filter((p) => p.status === "ir").length} injured reserve. IR returns require four weeks; practice-squad elevations expire after each game.</p>`)}${panel(
    "Players",
    table(
      ["Player", "Role / condition", "Roster status", "Move / action"],
      state.roster.map(
        (p) =>
          `<tr><td>${esc(p.name)}<small>${p.pos} · ${p.ovr} OVR · age ${p.age}</small></td><td>${p.starter ? "Starter" : "Reserve"}<small>${p.injury ? "Injury: " + p.injury + " weeks" : Math.round(p.fitness || 100) + "% fit"}</small></td><td>${p.status}${p.protected ? "<small>Protected this week</small>" : ""}</td><td><div class="f-actions">${button(p.starter ? "Starting" : "Start", `toggleStarter('${p.id}')`, "coach", true)}${p.status === "practice" ? button("Elevate", `F.action('move','${p.id}','elevated')`, "roster", true) + button(p.protected ? "Unprotect" : "Protect", `F.action('protect','${p.id}')`, "roster", true) : p.status === "ir" ? button("Activate", `F.action('move','${p.id}','active')`, "roster", true) : button("Practice squad", `F.action('move','${p.id}','practice')`, "roster", true)}${p.injury ? button("IR", `F.action('move','${p.id}','ir')`, "roster", true) : ""}${button("Waive", `F.release('${p.id}')`, "roster", true)}</div></td></tr>`,
      ),
    ),
  )}${panel(
    "Waiver wire",
    table(
      ["Player", "Deadline", "Claims", "Action"],
      f.waivers.map(
        (w) =>
          `<tr><td>${esc(w.player.name)} · ${w.player.pos}</td><td>Market day ${w.day}</td><td>${w.claims.map((t) => clubs[t][0]).join(", ") || "None"}</td><td>${button("File claim", `F.action('claim','${w.player.id}')`, "roster")}</td></tr>`,
      ),
    ),
  )}`;
}
function scoutingView() {
  let f = state.franchise;
  return `${panel("Scouting department", `<div class="f-actions"><span class="tag green">${f.scoutPoints} scouting points</span><span class="tag">${f.visits.length}/30 visits</span></div><p class="subtitle">Reports reveal talent ranges rather than true attributes. Combine testing, pro days and medical checks build confidence. Five points replenish after each completed week.</p>`)}${panel(
    "Prospect reports",
    table(
      ["Prospect", "Estimated talent", "Confidence / notes", "Investigate"],
      state.prospects.slice(0, 70).map((p) => {
        let r = f.reports[p.id],
          estimate = r?.estimate ?? p.ovr + (p.id.length % 9) - 4,
          spread = Math.ceil((100 - (r?.confidence || 25)) / 10);
        return `<tr><td>${esc(p.name)}<small>${p.pos} · ${p.age}</small></td><td>${Math.max(40, estimate - spread)}–${Math.min(99, estimate + spread)}</td><td>${r?.confidence || 25}%<small>${esc(r?.notes?.at(-1) || "Regional interest only")}</small></td><td><div class="f-actions">${["Regional report", "Combine", "Pro day", "Medical check", "Private visit"].map((kind) => button(kind, `F.action('scout','${p.id}','${kind}')`, "scout", true)).join("")}</div></td></tr>`;
      }),
    ),
  )}`;
}
function draftView() {
  let f = state.franchise,
    d = f.draft,
    pick = d?.picks[d.cursor];
  return `${panel("Draft room", `<div class="f-actions">${button(d ? "Draft initialized" : "Open seven-round draft", "F.action('draftStart')", "scout")}${d && pick ? button("Trade down", "F.action('tradeDown')", "scout", true) : ""}</div><p class="subtitle">${!d ? "Draft opens in the offseason. Scouts can evaluate the class throughout the year." : pick ? `Round ${pick.round}, pick ${d.cursor + 1} · ${clubs[pick.team][2]} on the clock. CPU selections advance to your next pick.` : "All seven rounds are complete."}</p>`)}${panel(
    "Prospect board",
    table(
      ["Prospect", "Position", "Scouted estimate", "Action"],
      state.prospects
        .slice()
        .sort(
          (a, b) =>
            (f.reports[b.id]?.estimate ?? b.ovr) -
            (f.reports[a.id]?.estimate ?? a.ovr),
        )
        .slice(0, 70)
        .map(
          (p) =>
            `<tr><td>${esc(p.name)}</td><td>${p.pos}</td><td>${f.reports[p.id]?.estimate ?? "Unconfirmed"}</td><td>${button("Draft player", `F.action('draftPick','${p.id}')`, "scout")}</td></tr>`,
        ),
    ),
  )}${
    d
      ? panel(
          "Selection log",
          table(
            ["Round", "Team", "Player", "Position"],
            d.log
              .slice(-40)
              .reverse()
              .map(
                (p) =>
                  `<tr><td>${p.round}</td><td>${clubs[p.team][0]}</td><td>${esc(p.name)}</td><td>${p.pos}</td></tr>`,
              ),
          ),
        )
      : ""
  }`;
}
function clubView() {
  let c = state.franchise.clubs[state.team],
    st = c.stadium;
  return `<div class="stats">${stat("OWNER", esc(c.owner.trait), "Patience " + c.owner.patience + "%")}${stat("STADIUM CONDITION", Math.round(st.condition) + "%")}${stat("FAN APPROVAL", c.fanApproval + "%")}${stat("ATTENDANCE", Math.round(c.attendance * 100) + "%", st.capacity.toLocaleString() + " seats")}</div><div class="two">${panel(esc(st.name), `<p>${esc(st.city)} · Cash ${moneyText(c.cash)}</p><div class="f-form-grid"><label>Ticket price ($)<input id="ticket-price" type="number" value="${st.ticket}" min="25" max="400"></label></div>${button("Update pricing", "F.action('ticket',document.getElementById('ticket-price').value)", "stadium")}<p class="subtitle">Attendance responds to price and fan approval. Concessions and luxury suites contribute to club revenue.</p><div class="f-form-grid"><label>Project<select id="facility-area">${choice(["condition", "capacity", "medical", "training"], "medical")}</select></label><label>Funding<select id="facility-funding"><option>Private</option><option>Public</option></select></label></div>${button("Submit project", "F.action('project',document.getElementById('facility-area').value,document.getElementById('facility-funding').value)", "stadium")}<div class="kv"><span>Medical / training tier</span><b>${st.medical} / ${st.training}</b></div>${st.projects.map((p) => `<p class="subtitle">${esc(p.name)} · ${p.remaining > 0 ? p.remaining + " calendar advances remaining" : "Completed"}</p>`).join("")}`)}${panel("Relocation application", `<p class="subtitle">Applications are reviewed in the offseason when stadium condition or local support justifies a move. Relocation requires $400M in cash.</p><div class="form-row"><label>New city<input id="relocation-city" type="text" maxlength="40"></label></div><div class="form-row"><label>New team name<input id="relocation-name" type="text" maxlength="40"></label></div>${button("Apply to relocate", "F.action('relocate',document.getElementById('relocation-city').value,document.getElementById('relocation-name').value)", "stadium")}`)}</div>`;
}
function medicalView() {
  let f = state.franchise;
  return `${panel("Weekly preparation", `<label>Practice intensity: ${f.preparation.intensity}%<input type="range" min="0" max="100" value="${f.preparation.intensity}" onchange="F.action('prepare',this.value)"></label><p class="subtitle">Intensity builds scheme familiarity and development, while lighter sessions reduce body-part wear. Medical facilities improve recovery. Familiarity ${f.preparation.familiarity}%.</p>`)}${panel(
    "Medical room",
    table(
      ["Player", "Diagnosis / availability", "Body-part wear", "Condition"],
      state.roster.map(
        (p) =>
          `<tr><td>${esc(p.name)}<small>${p.pos} · ${p.status}</small></td><td>${p.injury ? `${esc(p.medical?.diagnosis || "Game injury")} · ${p.injury} weeks` : "Available"}${p.holdout ? "<small>Contract holdout</small>" : ""}</td><td>${Object.entries(
            p.wear,
          )
            .map(([k, v]) => `${k} ${Math.round(v)}%`)
            .join(" · ")}</td><td>${Math.round(p.fitness || 100)}%</td></tr>`,
      ),
    ),
  )}`;
}
function lockerView() {
  return panel(
    "Locker room hierarchy",
    `<p class="subtitle">Leaders are ranked by leadership, seniority and ability. Individual morale influences match execution. Conversations are limited to one per player per week.</p>` +
      table(
        ["Player", "Standing", "Morale", "Concerns", "Conversation"],
        state.roster
          .slice()
          .sort(
            (a, b) =>
              b.persona.leadership +
              b.age / 50 -
              (a.persona.leadership + a.age / 50),
          )
          .map(
            (p, i) =>
              `<tr><td>${esc(p.name)}<small>${p.pos}</small></td><td>${i < 3 ? "Team leader" : i < 10 ? "Influential" : "Squad member"}</td><td>${Math.round(p.morale)}%</td><td>${p.holdout ? "Holdout" : p.tradeDemand ? "Trade demand" : p.morale < 60 ? "Unsettled" : "Content"}</td><td>${button("Meet player", `F.meeting('${p.id}')`, "media")}</td></tr>`,
          ),
      ),
  );
}
function leagueView() {
  let f = state.franchise;
  return `${panel("Annual league meeting", `<p class="subtitle">Owners vote during the offseason. Proposals need 24 votes. Rule changes take effect next season.</p>${["Cap growth", "18-game season", "Overtime format", "Trade deadline"].map((p) => `<div class="kv"><span>${p}</span><div>${button("Yes", `F.action('vote','${p}','Yes')`, "league")}${button("No", `F.action('vote','${p}','No')`, "league", true)}</div></div>`).join("")}<div class="kv"><span>Season games / cap</span><b>${f.rules.regularGames} / ${moneyText(f.rules.cap)}</b></div><div class="kv"><span>Overtime</span><b>${esc(f.rules.overtime)}</b></div>`)}${panel(
    "League decisions",
    table(
      ["Year", "Proposal", "Result"],
      Object.entries(f.votes || {}).map(
        ([k, v]) =>
          `<tr><td>${k.split(":")[0]}</td><td>${esc(v.proposal)}</td><td>${v.yes} votes · ${v.passed ? "Passed" : "Defeated"}</td></tr>`,
      ),
    ),
  )}${panel(
    "Draft capital",
    table(
      ["Year", "Round", "Origin", "Status"],
      (f.futurePicks || []).map(
        (p) =>
          `<tr><td>${p.year}</td><td>${p.round}</td><td>${esc(p.source)}</td><td>${p.forfeited ? "Forfeited" : "Owned"}</td></tr>`,
      ),
    ),
  )}`;
}
function archivesView() {
  let f = state.franchise;
  return `${panel(
    "Championship history",
    `<p class="subtitle">Championships, season records and award winners.</p>` +
      table(
        ["Season", "Champion", "MVP / record"],
        [
          ...state.history
            .map(
              (h) =>
                `<tr><td>${h.year}</td><td>${esc(cname(h.champion))}</td><td>${h.record}</td></tr>`,
            )
            .reverse(),
          ...f.history
            .slice()
            .reverse()
            .map(
              (h) =>
                `<tr><td>${h.year}</td><td>${esc(h.winner)}</td><td>${esc(h.mvp || "—")}</td></tr>`,
            ),
        ],
      ),
  )}${panel(
    "Awards and accolades",
    table(
      ["Season", "Award", "Player", "Team"],
      f.awards
        .slice()
        .reverse()
        .map(
          (a) =>
            `<tr><td>${a.year}</td><td>${esc(a.award)}</td><td>${esc(a.name)}</td><td>${clubs[a.team]?.[0] || "—"}</td></tr>`,
        ),
    ),
  )}${panel(
    "Player biographies and career statistics",
    table(
      ["Player", "Career production", "Accolades", "Legacy"],
      state.roster
        .slice()
        .sort((a, b) => b.ovr - a.ovr)
        .slice(0, 25)
        .map((p) => {
          let years = Object.values(p.stats),
            yards = years.reduce(
              (n, y) =>
                n + (y.passYards || 0) + (y.rushYards || 0) + (y.recYards || 0),
              0,
            ),
            awards = f.awards.filter((a) => a.playerId === p.id).length;
          return `<tr><td>${esc(p.name)}<small>${p.pos} · age ${p.age}</small></td><td>${yards} yards · ${years.length} recorded seasons</td><td>${awards}</td><td>${Math.round(yards / 100 + awards * 10)} legacy points</td></tr>`;
        }),
    ),
  )}${panel(
    "Hall of Fame pipeline",
    table(
      ["Player", "Eligible season", "Career yards"],
      f.hall.map(
        (p) =>
          `<tr><td>${esc(p.name)}</td><td>${p.year}</td><td>${p.careerYards}</td></tr>`,
      ),
    ),
  )}`;
}
function databaseView() {
  return panel(
    "Database and save management",
    `<p>Import or export player, team-branding and historical-record packs. JSON preserves team metadata and embedded logo images. CSV requires id, teamId, name, pos, age, ovr, pot and salary columns.</p><p class="subtitle">Imports are previewed and validated before replacement. Team IDs are 0–31 in the current league order. Logos accept embedded PNG, JPEG or WebP only. </p><div class="f-actions">${button("Export database", "F.export()")}${button("Download full career save", "F.downloadSave()", "", true)}</div><label class="f-upload">Choose JSON or CSV database<input type="file" accept=".json,.csv" onchange="F.importFile(this)"></label><pre class="f-code">${esc(JSON.stringify({ version: 1, source: "Your database source", players: [{ id: "custom-qb-1", teamId: state.team, name: "Custom Quarterback", pos: "QB", age: 23, ovr: 78, pot: 90, salary: 3, starter: true }] }, null, 2))}</pre>`,
  );
}
function debugView() {
  let f = state.franchise;
  return panel(
    "Developer console",
    `<p class="subtitle">Developer overrides mark the save as modified and bypass career-role checks. Normal cap and roster validation remains active unless the explicit debug override applies.</p>${button(f.debug ? "Disable developer mode" : "Enable developer mode", "F.action('debug')")}<div class="f-form-grid"><label>Player<select id="debug-player">${state.roster.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label><label>Rating<input id="debug-rating" type="number" min="1" max="99" value="85"></label></div>${button("Apply stat edit", "F.action('debugRating',document.getElementById('debug-player').value,document.getElementById('debug-rating').value)")}<label>Cap limit ($M)<input id="debug-cap" type="number" min="100" max="1000" value="${f.rules.cap / S.MILLION}"></label>${button("Benchmark one week", "F.benchmark()")}<p class="subtitle" id="benchmark-result">Runs 16 exhibition games without advancing your save.</p>${button("Set cap override", "F.action('capOverride',document.getElementById('debug-cap').value)")}<h3 style="margin:24px 0 12px">Force an event</h3><div class="f-actions">${["Holdout", "Trade demand", "Locker room leak", "League investigation", "Ownership sale"].map((e) => button(e, `F.action('event','${e}')`)).join("")}</div><h3 style="margin:24px 0 12px">Transaction audit</h3>${table(
      ["Year", "Week", "Action"],
      (f.audit || [])
        .slice(0, 20)
        .map(
          (e) =>
            `<tr><td>${e.year}</td><td>${e.week + 1}</td><td>${esc(e.message)}</td></tr>`,
        ),
    )}`,
  );
}
const views = {
  Overview: overviewView,
  Career: careerView,
  Contracts: contractsView,
  Market: marketView,
  Roster: rosterView,
  Scouting: scoutingView,
  Draft: draftView,
  Club: clubView,
  Medical: medicalView,
  "Locker room": lockerView,
  League: leagueView,
  Archives: archivesView,
  Database: databaseView,
  Debug: debugView,
};
if (!navs.some((n) => n[0] === "Franchise")) navs.push(["Franchise", "▣"]);
render = function () {
  initialize();
  let actual = view;
  if (actual === "Franchise") view = "Overview";
  previous.render();
  view = actual;
  if (actual === "Franchise") {
    document.getElementById("breadcrumb").textContent =
      "FRANCHISE / " + section.toUpperCase();
    document.getElementById("app").innerHTML =
      `<div class="title-row"><div><div class="eyebrow">${state.year} · ${esc(state.franchise.role)} · ${esc(situation())}</div><h1>${section === "Overview" ? "Franchise headquarters" : section}</h1><p class="subtitle">${esc(cname(state.team))} · Your decisions carry across seasons.</p></div>${button("Back to matchday", "go('Matchday')", "", true)}</div><div class="f-tabs">${sections.map((n) => `<button class="${section === n ? "active" : ""}" onclick="F.tab('${n}')">${n}</button>`).join("")}</div>${views[section]()}`;
    customNav(actual);
  }
  let role = document.querySelector(".sidebar-bottom small");
  if (role) role.textContent = state.franchise.role;
  save();
};
go = function (v) {
  if (["Roster", "Free agency", "Draft"].includes(v)) {
    section = { Roster: "Roster", "Free agency": "Market", Draft: "Draft" }[v];
    v = "Franchise";
  }
  previous.go(v);
};
money = function () {
  return state.franchise
    ? S.capLedger(state).used / S.MILLION
    : previous.money();
};
cname = function (i) {
  let r = state.franchise?.clubs?.[i]?.rebrand;
  return r ? r.city + " " + r.name : previous.cname(i);
};
logo = function (i, cls = "") {
  let image = state.franchise?.clubs?.[i]?.rebrand?.logo;
  return image
    ? `<img class="team-logo ${cls}" src="${image}" alt="Team logo">`
    : previous.logo(i, cls);
};
window.signPlayer = (id) => F.offer(id);
window.releasePlayer = (id) => F.release(id);
window.confirmRelease = (id) => action("cut", id, false);
window.draftPlayer = (id) => action("draftPick", id);
toggleStarter = function (id) {
  let p = state.roster.find((p) => p.id === id);
  if (!p || !["active", "elevated"].includes(p.status)) {
    toast("Activate the player first.");
    return;
  }
  let offense = ["QB", "RB", "WR", "TE", "OL", "K", "P"].includes(p.pos),
    role = state.franchise.role;
  if (
    !(
      can("coach") ||
      can("roster") ||
      (role === "OC" && offense) ||
      (role === "DC" && !offense)
    )
  ) {
    toast("Your career role delegates this depth-chart decision.");
    return;
  }
  previous.toggleStarter(id);
};
subPlayer = function (a, b) {
  if (!can("coach") && !["OC", "DC"].includes(state.franchise.role)) {
    toast("The head coach manages substitutions.");
    return;
  }
  let out = state.roster.find((p) => p.id === a),
    inside = state.roster.find((p) => p.id === b);
  if (
    !inside ||
    !["active", "elevated"].includes(inside.status) ||
    inside.holdout
  ) {
    toast("Select an available active player.");
    return;
  }
  if (
    (state.franchise.role === "OC" &&
      !["QB", "RB", "WR", "TE", "OL", "K", "P"].includes(out?.pos)) ||
    (state.franchise.role === "DC" &&
      ["QB", "RB", "WR", "TE", "OL", "K", "P"].includes(out?.pos))
  ) {
    toast("That substitution belongs to the other coordinator.");
    return;
  }
  previous.subPlayer(a, b);
};
matchSetting = function (k, v) {
  let role = state.franchise.role,
    offense = ["offense", "call", "tempo", "personnel"].includes(k);
  if (
    role === "GM" ||
    (role === "OC" && !offense) ||
    (role === "DC" && offense)
  ) {
    toast("That adjustment is delegated to your staff.");
    return;
  }
  previous.matchSetting(k, v);
};
F.depth = function () {
  if (!(can("coach") || can("roster"))) {
    toast("Your career role delegates the depth chart.");
    return;
  }
  depthChart();
  render();
  toast("Depth chart optimized");
};
function depthChart() {
  let target = {
    QB: 1,
    RB: 1,
    WR: 3,
    TE: 1,
    OL: 5,
    DL: 4,
    LB: 3,
    CB: 3,
    S: 2,
    K: 1,
    P: 1,
  };
  for (let p of state.roster) p.starter = false;
  for (let [pos, n] of Object.entries(target))
    for (let p of S.active(state)
      .filter((p) => p.pos === pos && !p.injury && !p.holdout)
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, n))
      p.starter = true;
}
function repairDepthChart() {
  const slots = {
    QB: 1,
    RB: 1,
    WR: 3,
    TE: 1,
    OL: 5,
    DL: 4,
    LB: 3,
    CB: 3,
    S: 2,
    K: 1,
    P: 1,
  };
  for (let p of state.roster)
    if (p.injury || p.holdout || !["active", "elevated"].includes(p.status))
      p.starter = false;
  for (let [pos, n] of Object.entries(slots)) {
    let list = S.active(state)
      .filter((p) => p.pos === pos && !p.injury && !p.holdout)
      .sort((a, b) => Number(b.starter) - Number(a.starter) || b.ovr - a.ovr);
    for (let [i, p] of list.entries()) p.starter = i < n;
  }
}
beginLive = function () {
  initialize();
  let issues = complianceReport(state, { game: true }).issues.map(
    (i) => i.message,
  );
  if (issues.length) {
    toast(issues[0]);
    section = "Roster";
    view = "Franchise";
    render();
    return;
  }
  repairDepthChart();
  previous.beginLive();
  if (state.live) {
    state.live.spot = state.franchise.rules.touchback || 25;
    state.live.settings = {
      otMode: state.franchise.rules.overtime,
      touchback: state.franchise.rules.touchback || 25,
    };
  }
};
startCareer = function (i) {
  previous.startCareer(i);
  initialize();
  section = "Career";
  view = "Franchise";
  render();
};
window.franchiseRecordExecution = (e, team) => {
  e.opponent = team === state.live?.a ? state.live.b : state.live?.a;
  H.recordPlayerStats(state, e, team);
  if (e.context?.decision) recordDecision(state, e.context.decision);
};
function workerGames(jobs) {
  return new Promise((resolve, reject) => {
    let worker = new Worker(new URL("./fast-worker.mjs", import.meta.url), {
        type: "module",
      }),
      timer = setTimeout(() => {
        worker.terminate();
        reject(Error("Simulation timed out; your calendar was not advanced."));
      }, 120000);
    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      e.data.error ? reject(Error(e.data.error)) : resolve(e.data.results);
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      reject(Error(e.message || "Simulation worker failed."));
    };
    worker.postMessage({ id: Date.now(), jobs });
  });
}
function addStats(results) {
  for (const result of results)
    for (const d of result.decisions || []) recordDecision(state, d);
  for (let result of results)
    for (let record of result.stats || []) {
      let p = S.roster(state, record.team).find((p) => p.id === record.id);
      if (!p) continue;
      let stats = (p.stats[state.year] ??= {});
      for (let [key, value] of Object.entries(record))
        if (!["team", "id"].includes(key))
          stats[key] = (stats[key] || 0) + value;
    }
}
async function settleRound({ live = null } = {}) {
  assertCanAdvance(state, { game: !!game() });
  let games =
    state.phase === "season"
      ? state.schedule[state.week]
      : state.playoffs?.rounds.at(-1);
  if (!games?.length) throw Error("No scheduled round.");
  let jobs = [],
    results = [];
  for (let g of games) {
    if (g.score) {
      results.push({ ...g });
      continue;
    }
    if (live?.finished && g.a === live.a && g.b === live.b) {
      results.push({
        a: g.a,
        b: g.b,
        score: [...live.score],
        match: live,
        stats: [],
      });
      continue;
    }
    jobs.push({
      a: g.a,
      b: g.b,
      home: structuredClone(S.roster(state, g.a)),
      away: structuredClone(S.roster(state, g.b)),
      seed:
        (state.year * 19009 +
          state.week * 137 +
          g.a * 79 +
          g.b * 31 +
          (state.franchise.postseason?.round || 0) * 991) >>>
        0,
      userTeam: state.team,
      directives: state.franchise.directives,
      settings: {
        otMode: state.franchise.rules.overtime,
        touchback: state.franchise.rules.touchback || 25,
      },
      live:
        live && g.a === live.a && g.b === live.b ? structuredClone(live) : null,
    });
  }
  let simulated = jobs.length ? await workerGames(jobs) : [];
  results.push(...simulated);
  addStats(simulated);
  let ours = results.find((r) => r.a === state.team || r.b === state.team);
  if (ours) {
    let k = ours.a === state.team ? 0 : 1,
      won = ours.score[k] > ours.score[1 - k];
    state.morale = Math.max(35, Math.min(99, state.morale + (won ? 4 : -5)));
    state.lastMatch = ours.match || live;
    S.log(
      state,
      won ? "A win for the franchise" : "A difficult result",
      `${clubs[state.team][2]} ${ours.score[k]}–${ours.score[1 - k]}.`,
    );
  }
  state.live = null;
  L.finishRound(state, results);
  state.franchise.calendar.stage =
    state.phase === "offseason" ? "League meeting" : "Weekly preparation";
  save();
  return ours;
}
F.stopHoliday = () => {
  stopHoliday = true;
  toast("Will stop after the current round.");
};
F.holiday = async function (rounds = 1) {
  if (busy || animating) {
    toast("Finish or pause at the end of the current play first.");
    return;
  }
  initialize();
  if (state.phase === "offseason") {
    F.tab("Draft");
    return;
  }
  let issues;
  try {
    assertCanAdvance(state, { game: !!game() });
    issues = [];
  } catch (e) {
    toast(e.message);
    F.tab("Staff");
    StaffHub.tab("Compliance");
    return;
  }
  if (issues.length) {
    toast(issues[0]);
    F.tab("Roster");
    return;
  }
  pauseAuto();
  busy = true;
  stopHoliday = false;
  view = "Franchise";
  section = "Overview";
  render();
  try {
    for (
      let i = 0;
      i < rounds && !stopHoliday && state.phase !== "offseason";
      i++
    ) {
      let el = document.getElementById("holiday-progress");
      if (el)
        el.textContent = `Simulating ${phaseName()} · round ${i + 1} of ${rounds}…`;
      await settleRound({ live: state.live });
      state.interviewPending = null;
      S.log(
        state,
        "Assistant match report",
        "Coordinators executed your delegation directives and handled halftime/media.",
      );
      render();
      if (
        ensureOffice(state).preferences.pauseOnUrgent &&
        officeCounts(state).urgent
      ) {
        toast(
          "Simulation paused: an urgent inbox decision needs your attention.",
        );
        section = "Inbox";
        break;
      }
      let errors;
      try {
        assertCanAdvance(state, { game: !!game() });
        errors = [];
      } catch (e) {
        errors = [e.message];
      }
      if (errors.length) {
        toast(errors[0]);
        break;
      }
    }
  } catch (e) {
    toast(e.message);
  } finally {
    busy = false;
    render();
  }
};
commitMatch = async function () {
  if (busy || animating || !state.live?.finished) return;
  let live = state.live;
  busy = true;
  pauseAuto();
  try {
    await settleRound({ live });
    state.interviewPending = {
      type: "post",
      year: state.year,
      week: state.week,
    };
    view = "Overview";
    closeModal();
    render();
    postgameReport();
  } catch (e) {
    toast(e.message);
  } finally {
    busy = false;
    render();
  }
};
advance = function () {
  if (busy) return;
  initialize();
  if (state.phase === "offseason") {
    F.tab("Draft");
    return;
  }
  if (!game() && !state.live) {
    F.holiday(1);
    return;
  }
  previous.advance();
};
F.newSeason = function () {
  if (state.phase !== "offseason") {
    toast("Finish the championship first.");
    return;
  }
  modal(
    `<h2>Enter training camp?</h2><p>The assistant will finish any unmade draft selections and may waive the lowest-rated reserve if a roster is at the 90-player limit. Expiring contracts, retirement, rollover, compensatory picks and the coaching carousel are processed. You must trim the active roster to 53 before your next game.</p><div class="modal-actions"><button class="secondary" onclick="closeModal()">Stay in offseason</button><button onclick="F.confirmSeason()">Begin next season</button></div>`,
  );
};
F.confirmSeason = function () {
  try {
    state = S.transact(state, (s) => {
      let role = s.franchise.role;
      s.franchise.role = "Owner";
      if (!s.franchise.draft) P.beginDraft(s);
      while (s.franchise.draft.cursor < s.franchise.draft.picks.length) {
        let p = s.prospects.slice().sort((a, b) => b.ovr - a.ovr)[0];
        if (!p) break;
        P.ensureDraftRoom(s);
        P.draftPick(s, p.id);
      }
      s.franchise.role = role;
      assertCanAdvance(s, { camp: true });
      L.rollSeason(s);
      assertCanAdvance(s, { camp: true });
    });
    closeModal();
    view = "Franchise";
    section = "Roster";
    render();
    toast("Training camp is open. Review your roster and staff.");
  } catch (e) {
    toast(e.message);
  }
};
nextSeason = function () {
  F.newSeason();
};
const oldPhase = phaseName;
phaseName = function () {
  if (state.phase === "season")
    return "Week " + (state.week + 1) + " / " + state.schedule.length;
  if (state.phase === "playoffs" && state.franchise?.postseason)
    return (
      ["Wild Card", "Divisional", "Conference Championship", "Championship"][
        state.franchise.postseason.round
      ] || "Playoffs"
    );
  return oldPhase();
};
actionLabel = function () {
  return state.live
    ? "Return to live game →"
    : state.phase === "offseason"
      ? "Open offseason →"
      : game()
        ? "Enter matchday →"
        : "Advance bye / playoff round →";
};
calendar = function () {
  return (
    panel(
      `${state.year} schedule`,
      table(
        ["Week", "Opponent", "Venue", "Result"],
        state.schedule.map((games, i) => {
          let g = games.find((g) => g.a === state.team || g.b === state.team);
          if (!g)
            return `<tr><td>${i + 1}</td><td colspan="3">Bye week</td></tr>`;
          let home = g.a === state.team,
            o = home ? g.b : g.a,
            k = home ? 0 : 1;
          return `<tr><td>${i + 1}</td><td>${esc(cname(o))}</td><td>${home ? "Home" : "Away"}</td><td>${g.score ? (g.score[k] > g.score[1 - k] ? "W " : "L ") + g.score[k] + "–" + g.score[1 - k] : "Scheduled"}</td></tr>`;
        }),
      ),
    ) +
    (state.playoffs
      ? panel(
          "Postseason",
          state.playoffs.rounds
            .map(
              (games, i) =>
                `<h3 style="margin:15px 0">Round ${i + 1}</h3>${games.map((g) => `<div class="kv"><span>${clubs[g.a][0]} vs ${clubs[g.b][0]}</span><b>${g.score ? g.score.join(" – ") : "Scheduled"}</b></div>`).join("")}`,
            )
            .join(""),
        )
      : "")
  );
};
const originalOverview = overview;
overview = function () {
  let cap = state.franchise ? S.capLedger(state) : null;
  return originalOverview()
    .replace(
      "$" + (255 - money()).toFixed(1),
      cap
        ? "$" + (cap.room / S.MILLION).toFixed(1)
        : "$" + (255 - money()).toFixed(1),
    )
    .replaceAll(
      "$255M salary cap",
      cap ? moneyText(cap.limit) + " cap limit" : "$255M salary cap",
    )
    .replaceAll(
      "Under the cap",
      cap && cap.room < 0 ? "Over the cap" : "Under the cap",
    );
};
const oldDraftView = views.Draft;
views.Draft = () =>
  oldDraftView() +
  panel(
    "Next season",
    `<p class="subtitle">Complete your draft and market decisions, then open training camp.</p>${button("Begin next season", "F.newSeason()")}`,
  );
initialize();
render();

F.benchmark = async function () {
  if (!state.franchise.debug || busy) {
    toast("Enable developer mode first.");
    return;
  }
  let start = performance.now();
  try {
    busy = true;
    let games = Array.from({ length: 16 }, (_, i) => ({
      a: i * 2,
      b: i * 2 + 1,
      home: S.roster(state, i * 2),
      away: S.roster(state, i * 2 + 1),
      seed: i + 42,
      userTeam: state.team,
      directives: {},
    }));
    let results = await workerGames(games),
      text = `16 games · ${results.reduce((n, g) => n + g.plays, 0)} plays · ${(performance.now() - start).toFixed(0)}ms`;
    let el = document.getElementById("benchmark-result");
    if (el) el.textContent = text;
    toast(text);
  } catch (e) {
    toast(e.message);
  } finally {
    busy = false;
  }
};

const franchiseInterview = answerInterview;
answerInterview = function (type, choice) {
  let valid =
    type === "pre"
      ? state.live && !state.live.interviewDone
      : state.interviewPending;
  if (!valid) return;
  if (!can("media")) {
    toast("The head coach handles media duties.");
    return;
  }
  let before = state.morale;
  franchiseInterview(type, choice);
  let delta = state.morale - before,
    club = state.franchise.clubs[state.team];
  for (let p of state.roster)
    p.morale = Math.max(20, Math.min(99, p.morale + delta));
  club.fanApproval = Math.max(
    10,
    Math.min(99, club.fanApproval + (choice === 0 ? 2 : choice === 1 ? -1 : 0)),
  );
  club.owner.patience = Math.max(
    0,
    Math.min(
      99,
      club.owner.patience + (choice === 0 ? 1 : choice === 1 ? -1 : 0),
    ),
  );
  if (type === "pre" && choice === 1) {
    state.franchise.bulletinBoard = {
      year: state.year,
      week: state.week,
      bonus: 1,
    };
    S.log(
      state,
      "Bulletin-board material",
      "Your public promise has motivated the opponent.",
    );
  }
  save();
  render();
};

// Load the presentation after the franchise actions are installed. Failure preserves the existing playable UI.
import("./presentation.mjs")
  .then(async ({ installPresentation }) => {
    const loadData = async (file) => {
      try {
        const response = await fetch(
          new URL("../data/" + file, import.meta.url),
        );
        if (!response.ok) throw Error("Unavailable " + file);
        return await response.json();
      } catch (e) {
        console.warn(e.message);
        return null;
      }
    };
    const [ratings, production, legends, honors, heritage, careerHistory] =
      await Promise.all([
        loadData("madden-ratings.json"),
        loadData("player-production.json"),
        loadData("legends.json"),
        loadData("player-honors.json"),
        loadData("franchise-heritage.json"),
        loadData("player-careers.json"),
      ]);
    configureRatings(ratings, production);
    configureCareerHistory(careerHistory);
    let snapshot = null;
    try {
      let response = await fetch(
        new URL("../data/nfl-rosters.json", import.meta.url),
      );
      if (!response.ok) throw Error("Roster snapshot unavailable");
      snapshot = await response.json();
    } catch (error) {
      console.warn(error.message);
    }
    installPresentation({
      views,
      getSection: () => section,
      setSection: (value) => (section = value),
      isBusy: () => busy,
      snapshot,
    });
    installCareerScenes({
      views,
      isBusy: () => busy,
      ratings,
      stats: production,
      legends,
    });
    installDevelopmentUI({ views, isBusy: () => busy });
    installOfficeUI({ views, isBusy: () => busy, getSection: () => section });
    installRecruitmentUI({
      views,
      isBusy: () => busy,
      snapshot,
      reference: honors,
    });
    installPlayerUI({ isBusy: () => busy });
    installHubUI({ views, isBusy: () => busy, tradeView });
    installSocialNetwork({ isBusy: () => busy });
    installTouchlineUI({ isBusy: () => busy });
    installNegotiationUI({ isBusy: () => busy });
    installStaffUI({ views, isBusy: () => busy });
    installExpansionUI({ views, isBusy: () => busy, heritage });
    installCalendarUI({views,initialize,isBusy:()=>busy,setBusy:value=>busy=value,settleRound});
    await installCareerManager({ views, isBusy: () => busy, initialize });
    // Hub dashboard and Unreal bridge load last; a failure leaves the classic workspace intact.
    try {
      const [{ installDashboard }, { installUnrealBridge }, { installThemeMotion }, { installBroadcastHUD }, { installCinematics }] = await Promise.all([
        import("./dashboard-ui.mjs"),
        import("../bridge/ue-hooks.mjs"),
        import("../presentation/theme-motion.mjs"),
        import("../presentation/broadcast-hud.mjs"),
        import("../presentation/cinematics.mjs"),
      ]);
      installDashboard({ views, isBusy: () => busy });
      installUnrealBridge();
      installBroadcastHUD();
      installCinematics({ isBusy: () => busy });
      installThemeMotion({ getSection: () => section });
      render();
    } catch (error) {
      console.error("Hub dashboard:", error);
    }
    document.getElementById("startup-status")?.remove();
  })
  .catch((error) => {
    document.getElementById("startup-status")?.remove();
    console.error("Workspace presentation:", error);
    toast("The classic workspace is available while the updated layout loads.");
  });

installMatchdaySim({
  initialize,
  workerGames,
  isBusy: () => busy,
  setBusy: (value) => (busy = value),
});
