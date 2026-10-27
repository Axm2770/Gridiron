import * as S from "./state.mjs";
import * as Staff from "./staff.mjs";
import { complianceReport } from "./compliance.mjs";
import { face } from "./career-scenes.mjs";
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
  function tabs(items, selected, method) {
    return `<div class="staff-segments" role="group">${items.map((v) => `<button class="${selected === v ? "selected" : ""}" aria-pressed="${selected === v}" onclick="StaffHub.${method}(${arg(v)})">${esc(v)}</button>`).join("")}</div>`;
  }
  const roles = Object.keys(Staff.STAFF_ROLES);
  function selectRole() {
    return `<div class="staff-role-rail" role="group" aria-label="Staff position">${roles.map((r) => `<button class="${role === r ? "selected" : ""}" aria-pressed="${role === r}" onclick="StaffHub.role('${r}')">${esc(r)}</button>`).join("")}</div>`;
  }
  function staffFace(c) {
    return face({ id: c.id, name: c.name, pos: "HC", generated: true });
  }
  const teamName = (t) => (t === null ? "Available" : clubs[t]?.[2] || "Club");
  function header() {
    const f = Staff.ensureStaff(state),
      c = f.clubs[state.team],
      searches = Object.values(f.staffSearches).filter(
        (x) => x.team === state.team && x.status === "open",
      ),
      report = complianceReport(state);
    return `<section class="staff-hero"><div><span class="eyebrow">FOOTBALL OPERATIONS</span><h2>The people behind the playbook.</h2><p>Build your staff. Run a complete search. Set the standard.</p></div><div class="staff-hero-mark">${logo(state.team)}</div></section><div class="staff-bento-metrics"><article><small>STAFF IN POST</small><b>${c.staff.length}</b><span>${c.staff.filter((q) => q.years === 1).length} contracts in final year</span></article><article><small>ANNUAL PAYROLL</small><b>${cash(c.staff.reduce((n, q) => n + q.salary, 0))}</b><span>Club operations · outside player cap</span></article><article><small>OPEN SEARCHES</small><b>${searches.length}</b><span>Vacancy-specific interview records</span></article><button onclick="StaffHub.tab('Compliance')" class="${report.ok ? "ready" : "attention"}"><small>LEAGUE REGISTRATION</small><b>${report.ok ? "Ready" : "Action needed"}</b><span>${report.ok ? "Cap and roster checks passed" : report.issues.length + " items to resolve"} →</span></button></div>${tabs(["Team", "Recruitment", "Search records", "Compliance"], tab, "tab")}`;
  }
  function teamView() {
    const staff = state.franchise.clubs[state.team].staff.filter(
      (c) =>
        unit === "All" ||
        (unit === "Leadership" &&
          ["HC", "GM", "OC", "DC", "STC", "Scout"].includes(c.role)) ||
        (unit === "Offense" &&
          ["QB", "RB", "WR", "TE", "OL"].includes(c.role)) ||
        (unit === "Defense" && ["DL", "LB", "DB"].includes(c.role)) ||
        (unit === "Medical" && c.role === "Medical"),
    );
    return `${tabs(["All", "Leadership", "Offense", "Defense", "Medical"], unit, "unit")}<div class="staff-card-grid">${staff.map((c) => `<article class="staff-member"><div class="staff-member-top">${staffFace(c)}<div><small>${esc(Staff.STAFF_ROLES[c.role] || c.role)}</small><h3>${esc(c.name)}</h3><span>${esc(c.scheme)} · ${esc(c.personality)}</span></div><b class="staff-grade">${c.rating}<small>ABILITY</small></b></div><div class="staff-member-stats"><span>Contract <b>${c.years} years</b></span><span>Annual <b>${cash(Staff.staffOfferSalary(state, c))}</b></span><span>Club service <b>${c.tenure} years</b></span></div><div class="staff-card-actions"><button class="secondary small" onclick="StaffHub.search('${c.role}')" ${locked() || !Staff.canManageStaff(state, c.role) ? "disabled" : ""}>Review alternatives</button><button class="staff-text-danger" onclick="StaffHub.dismiss(${arg(c.id)})" ${locked() || !Staff.canManageStaff(state, c.role) ? "disabled" : ""}>Dismiss</button></div></article>`).join("") || '<div class="staff-empty">No appointments in this unit.</div>'}</div><section class="staff-vacancies"><h3>Staff positions</h3><div>${
      roles
        .filter(
          (r) =>
            !state.franchise.clubs[state.team].staff.some((c) => c.role === r),
        )
        .map(
          (r) =>
            `<button onclick="StaffHub.search('${r}')" ${locked() || !Staff.canManageStaff(state, r) ? "disabled" : ""}><span>${esc(Staff.STAFF_ROLES[r])}</span><b>Open search →</b></button>`,
        )
        .join("") || "<p>Every position is covered.</p>"
    }</div></section>`;
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
    const valid = x?.status === "open";
    return `${selectRole()}<div class="staff-search-banner"><div><span class="eyebrow">${esc(Staff.STAFF_ROLES[role])}</span><h3>${valid ? "Search in progress" : "Build your candidate list"}</h3><p>${check.required ? `${check.completed} / ${check.required} distinct external diverse interviews${["HC", "GM"].includes(role) ? " · in-person required" : ""}` : "No mandatory diverse-interview count for this position."}</p></div>${chip(valid ? (check.ok ? "Interview requirements met" : "Interviews outstanding") : "Search not opened", valid && check.ok ? "green" : "amber")}<button onclick="StaffHub.begin('${role}')" ${valid || locked() || !Staff.canManageStaff(state, role) ? "disabled" : ""}>${valid ? "Search open" : "Open search"}</button></div><div class="staff-market-toolbar"><input type="search" placeholder="Search candidate, scheme, approach…" aria-label="Search staff" value="${esc(query)}" oninput="StaffHub.query(this.value)">${tabs(["All", "Available", "Employed"], marketMode, "marketMode")}</div><div id="staff-market-results"><div class="staff-candidate-grid">${
      rows
        .map((c) => {
          const w = Staff.interviewWindow(state, c, role),
            virtual = Staff.interviewWindow(state, c, role, "virtual"),
            h = Staff.hiringCheck(state, role, c.id),
            completed = x?.interviews.some(
              (i) => i.candidate === c.id && i.employer === c.employer,
            ),
            draft = x?.drafts[c.id];
          return `<article class="staff-candidate"><div class="staff-candidate-heading">${staffFace(c)}<div><h3>${esc(c.name)}</h3><p>${esc(Staff.STAFF_ROLES[c.role])} · ${esc(teamName(c.employer))}</p></div><b class="staff-grade">${c.rating}</b></div><div class="staff-candidate-tags">${chip(c.scheme)}${chip(c.personality)}${c.minority || c.woman ? chip("Diverse candidate", "blue") : ""}${completed ? chip("Interview complete", "green") : ""}</div><div class="staff-candidate-facts"><span>Annual terms <b>${cash(Staff.staffOfferSalary(state, c))}</b></span><span>Availability <b class="${w.ok ? "positive" : "muted"}">${esc(w.reason)}</b></span></div><div class="staff-card-actions"><button class="secondary small" onclick="StaffHub.interview(${arg(c.id)},'inPerson')" ${locked() || !valid || !w.ok || !Staff.canManageStaff(state, role) ? "disabled" : ""}>${draft ? "Resume interview" : completed ? "Review interview" : "Interview"}</button>${role === "HC" && virtual.ok && !w.ok ? `<button class="secondary small" onclick="StaffHub.interview(${arg(c.id)},'virtual')" ${locked() || !valid ? "disabled" : ""}>Virtual interview</button>` : ""}<button class="small" onclick="StaffHub.appoint(${arg(c.id)})" ${locked() || !h.ok ? "disabled" : ""} title="${esc(h.reasons.join(" "))}">Appoint</button></div>${!h.ok && completed ? `<p class="staff-block-reason">${esc(h.reasons[0])}</p>` : ""}</article>`;
        })
        .join("") ||
      '<div class="staff-empty">No candidates match this search.</div>'
    }</div><div class="staff-pagination"><span>${all.length} candidates · page ${page + 1} / ${Math.max(1, Math.ceil(all.length / 6))}</span><button class="secondary small" onclick="StaffHub.page(-1)" ${!page ? "disabled" : ""}>Previous</button><button class="secondary small" onclick="StaffHub.page(1)" ${(page + 1) * 6 >= all.length ? "disabled" : ""}>Next</button></div></div>`;
  }
  function records() {
    const f = state.franchise,
      searches = [
        ...Object.values(f.staffSearches),
        ...(f.staffSearchArchive || []),
      ].filter((x) => x.team === state.team);
    return `<div class="staff-records-grid">${
      searches
        .map((x) => {
          const c = Staff.searchCompliance(state, x.role, state.team, x);
          return `<article class="staff-record"><div><span class="eyebrow">${esc(Staff.STAFF_ROLES[x.role])} · ${x.year}</span>${chip(x.status, x.status === "appointed" ? "green" : "amber")}</div><h3>${x.interviews.length} completed interviews</h3><p>${c.completed} / ${c.required} qualifying external interviews</p>${x.interviews.map((i) => `<div class="staff-record-line"><b>${esc(i.name)}</b><span>${esc(i.assessment)} · ${i.mode === "inPerson" ? "In person" : "Virtual"} · ${i.external ? "External" : "Internal"}</span></div>`).join("") || "<p>Interviews have not yet been completed.</p>"}<button class="link" onclick="StaffHub.search('${x.role}')">Review search →</button></article>`;
        })
        .join("") ||
      '<div class="staff-empty">Open a search from Team or Recruitment to begin building an interview record.</div>'
    }</div><section class="staff-record"><h3>Staff-development draft compensation</h3>${
      f.staffCompensations
        .filter((e) => e.from === state.team)
        .map(
          (e) =>
            `<div class="staff-record-line"><b>${esc(e.name)} → ${esc(teamName(e.to))}</b><span>${e.role} appointment · draft capital awarded</span></div>`,
        )
        .join("") || "<p>Qualifying departures will appear here.</p>"
    }${(f.futurePicks || [])
      .filter((p) => p.team === state.team && p.special)
      .map((p) => chip(`${p.year} · Round 3`, "gold"))
      .join("")}</section>`;
  }
  function compliance() {
    const r = complianceReport(state),
      f = state.franchise;
    return `<div class="staff-compliance-grid"><section class="staff-record"><span class="eyebrow">LEAGUE OFFICE</span><h3>${r.ok ? "Registered and ready" : "Registration requires attention"}</h3><p>Calendar advancement checks your cap ledger, contracts and roster designations.</p><div class="staff-cap-meter"><i style="width:${Math.max(0, Math.min(100, (r.cap.used / r.cap.limit) * 100))}%"></i></div><div class="staff-member-stats"><span>Cap room <b>${cash(r.cap.room)}</b></span><span>Active <b>${r.counts.active} / ${r.limit}</b></span><span>Practice <b>${r.counts.practice} / 16</b></span></div>${r.issues.map((i) => `<button class="staff-compliance-issue" onclick="W.open(${arg(i.route)})"><span><small>${esc(i.area)}</small><b>${esc(i.message)}</b></span><span>Resolve →</span></button>`).join("") || `<div class="staff-clearance">✓ Salary cap · ✓ Contracts · ✓ Roster designations</div>`}</section><section class="staff-record"><span class="eyebrow">HIRING POLICY</span><h3>Every appointment has a process.</h3><div class="staff-rule-row"><b>HC / GM</b><span>Two external diverse candidates · in person</span></div><div class="staff-rule-row"><b>OC / DC / STC</b><span>Two external diverse candidates · either format</span></div><div class="staff-rule-row"><b>QB coach</b><span>One external diverse candidate</span></div><div class="staff-rule-row"><b>Under contract</b><span>External moves must be genuine promotions. Hiring windows and postseason commitments apply.</span></div><div class="staff-rule-row"><b>JC-2A</b><span>Qualifying HC / primary executive departures earn third-round picks in consecutive drafts after two years of uninterrupted service.</span></div><button class="secondary small" onclick="StaffHub.tab('Recruitment')">Review candidates</button></section></div>`;
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
    return `<div class="staff-workspace">${header()}${state.live ? '<div class="staff-live-notice">Match in progress. Staff appointments resume after the final report.</div>' : ""}<div id="staff-content">${tab === "Team" ? teamView() : tab === "Recruitment" ? recruitment() : tab === "Search records" ? records() : compliance()}</div></div>`;
  };
  const previous = render;
  render = function () {
    Staff.ensureStaff(state);
    return previous();
  };
}
