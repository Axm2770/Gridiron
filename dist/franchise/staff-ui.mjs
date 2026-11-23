import * as S from "./state.mjs";
import * as Staff from "./staff.mjs";
import { complianceReport } from "./compliance.mjs";
import { notice } from "../ui/notice.mjs";
import { issueFixes, liveFixes } from "./blockers.mjs";
import "./fixes.mjs";
import * as fp from "./fo-pixel.mjs";
import { staffBust, ensureFrontDeskStyles } from "./fo-pixel.mjs";
import { coachAppearance } from "./coach-avatar.mjs";
import { trendBadge, whyLine, ageText, staffReviewStrip } from "./staff-progression-ui.mjs";
const cash = (n) => "$" + (n / S.MILLION).toFixed(2) + "M";
const arg = (v) => esc(JSON.stringify(v));
const chip = (v, t = "") => `<span class="staff-chip ${t}">${esc(v)}</span>`;
export function installStaffUI({ views, isBusy }) {
  let tab = "Team",
    unit = "Leadership",
    role = "OC",
    query = "",
    page = 0,
    marketMode = "All";
  const locked = () => isBusy() || !!state.live;
  function update(fn, after) {
    if (isBusy()) return;
    try {
      state = S.transact(state, fn);
      save();
      render();
      after?.();
    } catch (e) {
      toast(e.message);
    }
  }
  function tabs(items, selected, method, counts = {}) {
    return `<div class="staff-segments fp-tabs" role="group">${items.map((v) => `<button class="${selected === v ? "selected" : ""}" aria-pressed="${selected === v}" onclick="StaffHub.${method}(${arg(v)})">${esc(v)}${counts[v] !== undefined ? `<em>${counts[v]}</em>` : ""}</button>`).join("")}</div>`;
  }
  const roles = Object.keys(Staff.STAFF_ROLES);
  function selectRole() {
    const filled = new Set(state.franchise.clubs[state.team].staff.map((c) => c.role));
    return `<div class="staff-role-rail fp-rail" role="group" aria-label="Staff position">${roles.map((r) => `<button class="${role === r ? "selected" : ""} ${filled.has(r) ? "" : "vacant"}" aria-pressed="${role === r}" title="${esc(Staff.STAFF_ROLES[r])}${filled.has(r) ? "" : " · vacant"}" onclick="StaffHub.role('${r}')">${esc(r)}</button>`).join("")}</div>`;
  }
  // Pixel busts: the user's own coach is drawn from the career appearance.
  function staffFace(c, size = 52) {
    return staffBust(c, {
      size,
      team: c.employer === undefined ? state.team : c.employer,
      appearance: c.userControlled ? coachAppearance(state) : null,
    });
  }
  const teamName = (t) => (t === null ? "Available" : clubs[t]?.[2] || "Club");
  const UNITS = {
    Leadership: ["HC", "GM", "OC", "DC", "STC", "Scout", "AHC"],
    Offense: ["QB", "RB", "WR", "TE", "OL"],
    Defense: ["DL", "LB", "DB"],
    Medical: ["Medical"],
  };
  const inUnit = (r, u) => u === "All" || UNITS[u]?.includes(r);
  const grade = (v) => `<span class="fp-grade ${v >= 80 ? "good" : v >= 65 ? "" : "warn"}"><b>${v}</b>${fp.blocks(v, 100, 10, v >= 80 ? "good" : v >= 65 ? "" : "warn")}</span>`;
  function header() {
    const f = Staff.ensureStaff(state),
      c = f.clubs[state.team],
      searches = Object.values(f.staffSearches).filter(
        (x) => x.team === state.team && x.status === "open",
      ),
      report = complianceReport(state),
      payroll = c.staff.reduce((n, q) => n + q.salary, 0),
      budget = c.staffBudget || 0,
      filled = new Set(c.staff.map((q) => q.role)).size,
      avg = c.staff.length ? Math.round(c.staff.reduce((n, q) => n + q.rating, 0) / c.staff.length) : 0;
    return `<section class="fp-panel staff-hero fp-dept"><div class="fp-dept-meters"><div class="fp-meter"><small>Staff in post</small><b>${c.staff.length}</b>${fp.blocks(filled, roles.length, 10, filled >= roles.length - 1 ? "good" : "warn")}<span>${roles.length - filled} vacant · ${c.staff.filter((q) => q.years === 1).length} in final year</span></div><div class="fp-meter"><small>Average ability</small><b>${avg}</b>${fp.blocks(avg, 100, 10, avg >= 75 ? "good" : "")}<span>Across every unit</span></div><div class="fp-meter"><small>Payroll</small><b>${cash(payroll)}</b>${fp.blocks(payroll, Math.max(budget, payroll, 1), 10, budget && payroll > budget ? "bad" : budget && payroll > budget * 0.9 ? "warn" : "good")}<span>${budget ? "Budget " + cash(budget) : "Outside the player cap"}</span></div><div class="fp-meter"><small>Open searches</small><b>${searches.length}</b>${fp.blocks(searches.length, 4, 4, "warn")}<span>Interview records</span></div><button onclick="StaffHub.tab('Compliance')" class="fp-meter fp-reg ${report.ok ? "ready" : "attention"}"><small>League registration</small><b>${report.ok ? "Ready" : "Action needed"}</b><span>${report.ok ? "Cap and roster checks passed" : report.issues.length + " items to resolve"} →</span></button></div></section>${tabs(["Team", "Recruitment", "Search records", "Compliance"], tab, "tab", { Team: c.staff.length, "Search records": [...Object.values(f.staffSearches), ...(f.staffSearchArchive || [])].filter((x) => x.team === state.team).length })}`;
  }
  function memberCard(c) {
    const manage = !locked() && Staff.canManageStaff(state, c.role);
    return `<article class="staff-member fp-card ${c.userControlled ? "you" : ""}"><div class="fp-card-top">${staffFace(c, 56)}<div class="fp-card-id"><small>${esc(Staff.STAFF_ROLES[c.role] || c.role)}${ageText(c) ? ` · ${ageText(c)}` : ""}</small><h3>${esc(c.name)}</h3><span>${fp.chip(c.scheme)}${fp.chip(c.personality)}${c.userControlled ? fp.chip("You", "accent") : ""}</span></div></div><div class="fp-card-rating"><small>Ability</small><span class="sp-rating">${grade(c.rating)}${trendBadge(c)}</span></div>${whyLine(c)}<div class="fp-card-facts"><span><small>Contract</small><b class="${c.years === 1 ? "fp-warn" : ""}">${c.years === 1 ? "Final year" : c.years + " years"}</b>${fp.blocks(c.years, 5, 5, c.years === 1 ? "warn" : "")}</span><span><small>Annual</small><b>${cash(Staff.staffOfferSalary(state, c))}</b></span><span><small>Service</small><b>${c.tenure} yrs</b></span></div><div class="fp-card-actions"><button class="secondary small" onclick="StaffHub.search('${c.role}')" ${manage ? "" : "disabled"}>Review alternatives</button><button class="link fp-danger staff-text-danger" onclick="StaffHub.dismiss(${arg(c.id)})" ${manage ? "" : "disabled"}>Dismiss</button></div></article>`;
  }
  function teamView() {
    const club = state.franchise.clubs[state.team],
      staff = club.staff.filter((c) => inUnit(c.role, unit)),
      vacant = roles.filter((r) => inUnit(r, unit) && !club.staff.some((c) => c.role === r)),
      counts = Object.fromEntries(["All", ...Object.keys(UNITS)].map((u) => [u, club.staff.filter((c) => inUnit(c.role, u)).length]));
    return `<div class="fp-subbar">${tabs(["All", "Leadership", "Offense", "Defense", "Medical"], unit, "unit", counts)}<span class="fp-note">${staff.length} in post${vacant.length ? ` · ${vacant.length} vacant` : ""}</span></div>${staffReviewStrip(state)}<div class="staff-card-grid fp-card-grid">${staff.map(memberCard).join("")}${vacant
      .map(
        (r) =>
          `<article class="fp-card fp-vacant"><div class="fp-card-top"><span class="fp-bust fp-empty-bust" aria-hidden="true">?</span><div class="fp-card-id"><small>${esc(Staff.STAFF_ROLES[r])}</small><h3>Vacant position</h3><span>${fp.chip("No appointment", "warn")}</span></div></div><p class="fp-note">Open a search to build an interview record and appoint a candidate.</p><div class="fp-card-actions"><button class="small" onclick="StaffHub.search('${r}')" ${locked() || !Staff.canManageStaff(state, r) ? "disabled" : ""}>Open search →</button></div></article>`,
      )
      .join("")}${!staff.length && !vacant.length ? '<div class="staff-empty fp-empty">No appointments in this unit.</div>' : ""}</div>`;
  }
  function recruitment() {
    const x = Staff.currentSearch(state, role),
      check = Staff.searchCompliance(state, role),
      all = Staff.staffCandidates(state, role)
        .filter((c) =>
          `${c.name} ${c.scheme} ${c.personality}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .filter(
          (c) =>
            marketMode === "All" ||
            (marketMode === "Available" && c.employer === null) ||
            (marketMode === "Employed" && c.employer !== null),
        );
    page = Math.min(page, Math.max(0, Math.ceil(all.length / 6) - 1));
    const rows = all.slice(page * 6, page * 6 + 6);
    const valid = x?.status === "open",
      incumbent = state.franchise.clubs[state.team].staff.find((c) => c.role === role);
    const steps = [
      ["Open the search", valid],
      [check.required ? `Interview ${check.required} external diverse candidate${check.required === 1 ? "" : "s"}` : "Interview your shortlist", valid && check.ok],
      ["Appoint", false],
    ];
    return `${selectRole()}<section class="fp-panel fp-search"><div class="fp-head"><div><span class="fp-kicker">${esc(Staff.STAFF_ROLES[role])} SEARCH</span><h2>${valid ? "Search in progress" : "Build your candidate list"}</h2></div><div class="fp-head-extra">${fp.chip(valid ? (check.ok ? "Interview requirements met" : "Interviews outstanding") : "Search not opened", valid && check.ok ? "good" : "warn")}<button onclick="StaffHub.begin('${role}')" ${valid || locked() || !Staff.canManageStaff(state, role) ? "disabled" : ""}>${valid ? "Search open" : "Open search"}</button></div></div><div class="fp-body fp-search-body"><ol class="fp-steps">${steps.map(([t, done], i) => `<li class="${done ? "done" : ""}"><b>${done ? "✓" : i + 1}</b><span>${esc(t)}</span></li>`).join("")}</ol><div class="fp-search-progress"><small>Qualifying interviews</small><b>${check.required ? `${check.completed} / ${check.required}` : "—"}</b>${check.required ? fp.blocks(check.completed, check.required, check.required, check.ok ? "good" : "warn") : ""}<span>${check.required ? `${check.completed} / ${check.required} distinct external diverse interviews${["HC", "GM"].includes(role) ? " · in-person required" : ""}` : "No mandatory diverse-interview count for this position."}</span></div><div class="fp-incumbent">${incumbent ? `${staffFace(incumbent, 40)}<span><small>Current ${esc(Staff.STAFF_ROLES[role])}</small><b>${esc(incumbent.name)}</b><em>${incumbent.rating} ability · ${incumbent.years} yrs left</em></span>` : `<span class="fp-bust fp-empty-bust" aria-hidden="true">?</span><span><small>Current ${esc(Staff.STAFF_ROLES[role])}</small><b>Vacant</b><em>Appointment needed</em></span>`}</div></div></section><div class="staff-market-toolbar fp-subbar"><input type="search" placeholder="Search candidate, scheme, approach…" aria-label="Search staff" value="${esc(query)}" oninput="StaffHub.query(this.value)">${tabs(["All", "Available", "Employed"], marketMode, "marketMode")}</div><div id="staff-market-results"><div class="staff-candidate-grid fp-card-grid">${
      rows
        .map((c) => {
          const w = Staff.interviewWindow(state, c, role),
            virtual = Staff.interviewWindow(state, c, role, "virtual"),
            h = Staff.hiringCheck(state, role, c.id),
            completed = x?.interviews.some(
              (i) => i.candidate === c.id && i.employer === c.employer,
            ),
            draft = x?.drafts[c.id];
          return `<article class="staff-candidate fp-card ${completed ? "interviewed" : ""}"><div class="fp-card-top">${staffFace(c, 52)}<div class="fp-card-id"><small>${esc(Staff.STAFF_ROLES[c.role])} · ${esc(teamName(c.employer))}${ageText(c) ? ` · ${ageText(c)}` : ""}</small><h3>${esc(c.name)}</h3><span>${fp.chip(c.scheme)}${fp.chip(c.personality)}${c.minority || c.woman ? fp.chip("Diverse candidate", "accent") : ""}${completed ? fp.chip("Interviewed", "good") : ""}</span></div></div><div class="fp-card-rating"><small>Ability</small><span class="sp-rating">${grade(c.rating)}${trendBadge(c)}</span></div>${whyLine(c)}<div class="fp-card-facts two"><span><small>Annual terms</small><b>${cash(Staff.staffOfferSalary(state, c))}</b></span><span><small>Availability</small><b class="${w.ok ? "fp-good" : "fp-muted"}" title="${esc(w.reason)}">${esc(w.reason)}</b></span></div><div class="fp-card-actions"><button class="secondary small" onclick="StaffHub.interview(${arg(c.id)},'inPerson')" ${locked() || !valid || !w.ok || !Staff.canManageStaff(state, role) ? "disabled" : ""}>${draft ? "Resume interview" : completed ? "Review interview" : "Interview"}</button>${role === "HC" && virtual.ok && !w.ok ? `<button class="secondary small" onclick="StaffHub.interview(${arg(c.id)},'virtual')" ${locked() || !valid ? "disabled" : ""}>Virtual interview</button>` : ""}<button class="small" onclick="StaffHub.appoint(${arg(c.id)})" ${locked() || !h.ok ? "disabled" : ""} title="${esc(h.reasons.join(" "))}">Appoint</button></div>${!h.ok && completed ? `<p class="staff-block-reason fp-block-reason">${esc(h.reasons[0])}</p>` : ""}</article>`;
        })
        .join("") ||
      '<div class="staff-empty fp-empty">No candidates match this search.</div>'
    }</div><div class="staff-pagination fp-pager fp-pager-free"><span>${all.length} candidates · 6 per page</span><div><button class="secondary small" onclick="StaffHub.page(-1)" ${!page ? "disabled" : ""}>◀ Prev</button><b>${page + 1} / ${Math.max(1, Math.ceil(all.length / 6))}</b><button class="secondary small" onclick="StaffHub.page(1)" ${(page + 1) * 6 >= all.length ? "disabled" : ""}>Next ▶</button></div></div></div>`;
  }
  function records() {
    const f = state.franchise,
      searches = [
        ...Object.values(f.staffSearches),
        ...(f.staffSearchArchive || []),
      ].filter((x) => x.team === state.team);
    return `<div class="staff-records-grid fp-card-grid">${
      searches
        .map((x) => {
          const c = Staff.searchCompliance(state, x.role, state.team, x);
          return `<article class="staff-record fp-card"><div class="fp-record-top"><span class="fp-kicker">${esc(Staff.STAFF_ROLES[x.role])} · ${x.year}</span>${fp.chip(x.status, x.status === "appointed" ? "good" : x.status === "open" ? "accent" : "warn")}</div><h3>${x.interviews.length} completed interviews</h3><div class="fp-row"><span>${c.completed} / ${c.required} qualifying external interviews</span>${c.required ? fp.blocks(c.completed, c.required, c.required, c.ok ? "good" : "warn") : ""}</div><ul class="fp-record-lines">${x.interviews.map((i) => `<li><b>${esc(i.name)}</b><span>${esc(i.assessment)} · ${i.mode === "inPerson" ? "In person" : "Virtual"} · ${i.external ? "External" : "Internal"}</span></li>`).join("") || "<li><span>Interviews have not yet been completed.</span></li>"}</ul><button class="link" onclick="StaffHub.search('${x.role}')">Review search →</button></article>`;
        })
        .join("") ||
      '<div class="staff-empty fp-empty">Open a search from Team or Recruitment to begin building an interview record.</div>'
    }</div>${fp.panel({
      title: "Staff-development draft compensation",
      kicker: "JC-2A",
      body: `<ul class="fp-record-lines">${
        f.staffCompensations
          .filter((e) => e.from === state.team)
          .map(
            (e) =>
              `<li><b>${esc(e.name)} → ${esc(teamName(e.to))}</b><span>${e.role} appointment · draft capital awarded</span></li>`,
          )
          .join("") || "<li><span>Qualifying departures will appear here.</span></li>"
      }</ul><div>${(f.futurePicks || [])
        .filter((p) => p.team === state.team && p.special)
        .map((p) => fp.chip(`${p.year} · Round 3`, "warn"))
        .join("")}</div>`,
    })}`;
  }
  function compliance() {
    const r = complianceReport(state),
      share = Math.max(0, Math.min(100, (r.cap.used / r.cap.limit) * 100));
    return `<div class="staff-compliance-grid fp-grid-2">${fp.panel({
      kicker: "LEAGUE OFFICE",
      title: r.ok ? "Registered and ready" : "Registration requires attention",
      extra: fp.chip(r.ok ? "Ready" : r.issues.length + " issues", r.ok ? "good" : "bad"),
      body: `<p class="fp-note">Calendar advancement checks your cap ledger, contracts and roster designations.</p>${fp.stackBar([{ pct: share, tone: "live", label: "Cap used" }, { pct: 100 - share, tone: "room", label: "Cap room" }])}<div class="fp-tiles">${fp.tile("Cap room", cash(r.cap.room), "", { tone: r.cap.room < 0 ? "bad" : "good" })}${fp.tile("Active", `${r.counts.active} / ${r.limit}`, "", { meter: fp.blocks(r.counts.active, r.limit, 10, r.counts.active > r.limit ? "bad" : "") })}${fp.tile("Practice", `${r.counts.practice} / 16`, "", { meter: fp.blocks(r.counts.practice, 16, 8, r.counts.practice > 16 ? "bad" : "") })}</div>${r.issues.map((i) => notice({ tone: "bad", cls: "staff-issue-notice", title: i.message, detail: `${i.area}: calendar advancement stops until this is fixed.`, fixes: issueFixes(state, i) })).join("") || `<div class="fp-clearance"><span>✓ Salary cap</span><span>✓ Contracts</span><span>✓ Roster designations</span></div>`}`,
    })}${fp.panel({
      kicker: "HIRING POLICY",
      title: "Every appointment has a process.",
      body: `<dl class="fp-rules"><div><dt>HC / GM</dt><dd>Two external diverse candidates · in person</dd></div><div><dt>OC / DC / STC</dt><dd>Two external diverse candidates · either format</dd></div><div><dt>QB coach</dt><dd>One external diverse candidate</dd></div><div><dt>Under contract</dt><dd>External moves must be genuine promotions. Hiring windows and postseason commitments apply.</dd></div><div><dt>JC-2A</dt><dd>Qualifying HC / primary executive departures earn third-round picks in consecutive drafts after two years of uninterrupted service.</dd></div></dl><button class="secondary small" onclick="StaffHub.tab('Recruitment')">Review candidates</button>`,
    })}</div>`;
  }
  window.StaffHub = {
    tab(v) {
      tab = v;
      render();
    },
    unit(v) {
      unit = v;
      render();
    },
    role(v) {
      role = v;
      page = 0;
      render();
    },
    page(d) {
      page += d;
      render();
    },
    marketMode(v) {
      marketMode = v;
      page = 0;
      render();
    },
    query(v) {
      query = v;
      page = 0;
      const input = document.querySelector('[aria-label="Search staff"]');
      const at = input.selectionStart;
      const section = document.getElementById("staff-content");
      section.innerHTML = recruitment();
      const next = document.querySelector('[aria-label="Search staff"]');
      next.focus();
      next.setSelectionRange(at, at);
    },
    search(r) {
      role = r;
      tab = "Recruitment";
      page = 0;
      render();
    },
    begin(r) {
      update((s) => Staff.openStaffSearch(s, r));
    },
    interview(id, mode = "inPerson") {
      const x = Staff.currentSearch(state, role),
        prior = x?.interviews.find(
          (i) => i.candidate === id && i.mode === mode,
        );
      if (prior) {
        modal(
          `<div class="staff-meeting"><span class="eyebrow">SEARCH COMMITTEE REPORT</span><h2>${esc(prior.name)}</h2><p>${esc(prior.assessment)}</p>${prior.answers.map((c, i) => `<blockquote><b>${esc(Staff.STAFF_QUESTIONS[i].question)}</b><p>${esc(Staff.STAFF_QUESTIONS[i].choices[c])}</p></blockquote>`).join("")}<div class="modal-actions"><button onclick="closeModal()">Done</button></div></div>`,
        );
        return;
      }
      update(
        (s) => Staff.startStaffInterview(s, role, id, mode),
        () => StaffHub.showInterview(id),
      );
    },
    showInterview(id) {
      const x = Staff.currentSearch(state, role),
        d = x?.drafts[id],
        c = Staff.staffCandidates(state, role).find((q) => q.id === id);
      if (!d || !c) return;
      const q = Staff.STAFF_QUESTIONS[d.step];
      modal(
        `<div class="staff-meeting"><div class="staff-meeting-top"><span class="eyebrow">${d.mode === "inPerson" ? "IN-PERSON MEETING" : "VIDEO MEETING"} · ${esc(Staff.STAFF_ROLES[role])}</span><button class="icon-button" aria-label="Close interview" onclick="closeModal()">×</button></div><div class="staff-meeting-person">${staffFace(c)}<div><h2>${esc(c.name)}</h2><p>${esc(c.scheme)} · ${esc(c.personality)}</p></div></div><div class="staff-interview-progress">${Staff.STAFF_QUESTIONS.map((q, i) => `<i class="${i <= d.step ? "complete" : ""}"></i>`).join("")}</div><h3>${esc(q.question)}</h3><p class="muted">Choose the priority you want to discuss with the candidate.</p><div class="staff-response-choices">${q.choices.map((v, i) => `<button onclick="StaffHub.answer(${arg(id)},${d.step},${i})"><span>${i + 1}</span>${esc(v)}</button>`).join("")}</div><small class="muted">Interview ${d.step + 1} of ${Staff.STAFF_QUESTIONS.length}</small></div>`,
      );
    },
    answer(id, step, choice) {
      update(
        (s) => Staff.answerStaffInterview(s, role, id, step, choice),
        () => {
          if (Staff.currentSearch(state, role)?.drafts[id])
            StaffHub.showInterview(id);
          else {
            closeModal();
            toast("Interview recorded by the search committee.");
          }
        },
      );
    },
    appoint(id) {
      const c = Staff.staffCandidates(state, role).find((c) => c.id === id);
      if (!c) return;
      const check = Staff.hiringCheck(state, role, id);
      if (!check.ok) {
        toast(check.reasons[0]);
        return;
      }
      const old = state.franchise.clubs[state.team].staff.find(
        (c) => c.role === role,
      );
      modal(
        `<div class="staff-meeting"><span class="eyebrow">APPOINTMENT REVIEW</span><h2>${esc(c.name)}</h2><p>${esc(Staff.STAFF_ROLES[role])} · 3-year agreement · ${cash(Staff.staffOfferSalary(state, c))} annually</p><div class="staff-clearance">✓ Candidate interviewed · ✓ Search requirements met · ✓ Hiring window open</div>${old ? `<p>${esc(old.name)} will depart with a ${cash(Math.round(old.salary * Math.max(1, old.years) * 0.5))} severance payment.</p>` : ""}<div class="modal-actions"><button class="secondary" onclick="closeModal()">Keep reviewing</button><button onclick="StaffHub.confirmAppointment(${arg(id)},'${role}')">Confirm appointment</button></div></div>`,
      );
    },
    confirmAppointment(id, r) {
      update(
        (s) => Staff.hireStaff(s, r, id),
        () => {
          closeModal();
          tab = "Team";
          render();
          toast("Appointment confirmed.");
        },
      );
    },
    dismiss(id) {
      const c = state.franchise.clubs[state.team].staff.find(
        (q) => q.id === id,
      );
      if (!c) return;
      modal(
        `<div class="staff-meeting"><span class="eyebrow">STAFF CONTRACT</span><h2>Dismiss ${esc(c.name)}?</h2><p>${esc(Staff.STAFF_ROLES[c.role])} · Severance ${cash(Math.round(c.salary * Math.max(1, c.years) * 0.5))}</p><p>The position will remain vacant until you complete a new appointment.</p><div class="modal-actions"><button class="secondary" onclick="closeModal()">Keep staff member</button><button onclick="StaffHub.confirmDismissal(${arg(id)})">Confirm dismissal</button></div></div>`,
      );
    },
    confirmDismissal(id) {
      update(
        (s) => Staff.fireStaff(s, id),
        () => {
          closeModal();
          toast("Staff contract ended.");
        },
      );
    },
  };
  views.Staff = () => {
    Staff.ensureStaff(state);
    ensureFrontDeskStyles();
    return `<div class="staff-workspace fp-page">${header()}${state.live ? notice({ tone: "info", cls: "staff-live-note", title: "Match in progress.", detail: "Staff appointments resume after the final report.", fixes: liveFixes() }) : ""}<div id="staff-content">${tab === "Team" ? teamView() : tab === "Recruitment" ? recruitment() : tab === "Search records" ? records() : compliance()}</div></div>`;
  };
  const previous = render;
  render = function () {
    Staff.ensureStaff(state);
    return previous();
  };
}
