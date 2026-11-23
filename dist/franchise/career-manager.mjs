import { syncOffice } from "./newsroom.mjs";
import * as S from "./state.mjs";
import { serializeCareer, ensureCareerRatings } from "./ratings.mjs";
import {
  defaultCoach,
  validateCoach,
  applyCoach,
  COACH_ATTRIBUTES,
  COACH_BUDGET,
  BACKGROUNDS,
  DEFAULT_APPEARANCE,
  APPEARANCE_SWATCHES,
  PHILOSOPHY,
  coachArchetype,
  autoSaveName,
} from "./coach-profile.mjs";
import { clubOutlook, NEW_CAREER_YEAR } from "./club-outlook.mjs";
import { saveMetadata, parseCareerSave, careerId } from "./save-store.mjs";
import { CharacterStage } from "./character-stage.mjs";
import { singleFlight } from "../ui/kit.mjs";
import { coachBadge, coachPixelAvatar } from "./coach-avatar.mjs";
import { TEAM_COLORS } from "../presentation/team-colors.mjs";
import { notice } from "../ui/notice.mjs";
const ROLE_NAMES = {
  HC: "Head coach",
  GM: "General manager",
  OC: "Offensive coordinator",
  DC: "Defensive coordinator",
  Owner: "Owner",
};
const clubName = (team) =>
  clubs[team] ? clubs[team][1] + " " + clubs[team][2] : "Franchise";
const seasonText = (m) =>
  m.year +
  " · " +
  (m.phase === "season"
    ? "Week " + (Number(m.week) + 1)
    : nice(m.phase || "preseason"));
const playedText = (t) => {
  const d = new Date(t),
    now = new Date();
  if (!t || !Number.isFinite(d.getTime())) return "—";
  const mins = Math.round((now - d) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return mins + " min ago";
  if (d.toDateString() === now.toDateString())
    return (
      "Today, " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    );
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
};
// Close an open career-card menu when a click lands outside it.
if (typeof document !== "undefined")
  document.addEventListener("click", (e) => {
    for (const menu of document.querySelectorAll(".cl-menu[open]"))
      if (!menu.contains(e.target)) menu.open = false;
  });
const nice = (s) =>
  String(s)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase());
export async function installCareerManager({ views, isBusy, initialize }) {
  const store = window.careerStore,
    rawStart = startCareer;
  let currentId = window.__gridironCareerId || null,
    currentMeta = null,
    ready = false,
    switching = false,
    dirty = false,
    timer = null,
    writeChain = Promise.resolve(),
    status = "saved",
    lastPayload = null,
    wizard = null,
    wizardStep = 0,
    avatar = null,
    archiveOpen = false,
    importCandidate = null;
  const disposeAvatar = () => {
    avatar?.dispose();
    avatar = null;
  };
  const safe = () => {
    if (isBusy() || switching) {
      toast("Wait for the current simulation or save operation to finish.");
      return false;
    }
    pauseAuto();
    window.finishMatchPlayback?.();
    window.broadcast?.stop();
    return true;
  };
  const notify = () => {
    const el = document.getElementById("career-save-status");
    if (el) {
      el.textContent =
        status === "saving"
          ? "Saving…"
          : status === "error"
            ? "Save failed"
            : dirty
              ? "Unsaved changes"
              : "Saved";
      el.dataset.status = status;
    }
    const footer = document.querySelector(".footer-status");
    if (footer)
      footer.innerHTML = `<i class="live-dot"></i> <span>${status === "error" ? "Save failed — export a backup" : dirty || status === "saving" ? "Saving career…" : "Career saved on this device"}</span><button class="link" onclick="Career.open()">Manage careers ↗</button>`;
  };
  const flush = () => {
    clearTimeout(timer);
    timer = null;
    if (!dirty || !currentId || !ready || switching) return writeChain;
    if (!store) {
      status = "error";
      notify();
      return Promise.reject(
        Error(window.careerStorageError || "Career storage is unavailable."),
      );
    }
    const id = currentId,
      payload = serializeCareer(state),
      meta = saveMetadata(state, { ...currentMeta, id });
    if (payload === lastPayload) {
      dirty = false;
      status = "saved";
      notify();
      return writeChain;
    }
    dirty = false;
    status = "saving";
    notify();
    const job = writeChain
      .catch(() => {})
      .then(() => store.put(id, payload, meta, { active: true }));
    writeChain = job
      .then(() => {
        if (currentId === id) {
          currentMeta = meta;
          lastPayload = payload;
          status = "saved";
          notify();
        }
      })
      .catch((e) => {
        if (currentId === id) {
          dirty = true;
          status = "error";
          notify();
        }
        throw e;
      });
    return writeChain;
  };
  const autosave = () => {
    if (!ready || !currentId || switching) return;
    dirty = true;
    status = "saving";
    clearTimeout(timer);
    timer = setTimeout(() => flush().catch((e) => toast(e.message)), 450);
    notify();
  };
  const renderHeader = () => {
    const host = document.querySelector("header>div");
    if (host && !host.querySelector(".career-toolbar"))
      host.insertAdjacentHTML(
        "afterbegin",
        `<div class="career-toolbar"><button class="career-library-button" onclick="Career.open()" title="Careers and saved games">▤ <span>Careers</span></button><button class="career-save-button" onclick="Career.save()" aria-label="Save current career" ${!currentId ? "disabled" : ""}>↓ <span id="career-save-status">Saved</span></button></div>`,
      );
    notify();
    const identity = document.querySelector(".sidebar-bottom");
    if (identity)
      identity.innerHTML = `<button class="coach-identity-button" onclick="Career.profile()" aria-label="View your head coach profile"><span class="avatar coach-avatar-slot">${coachBadge(state.coach.name, state.franchise.userCoach?.appearance || (state.franchise.career?.avatar ? { skin: state.franchise.career.avatar.skin, jacket: state.franchise.career.avatar.shirt } : null))}</span><span>${esc(state.coach.name)}<small>${esc(state.franchise.role)}</small></span></button>`;
    const club = document.querySelector(".workspace-club");
    if (club) {
      club.title = "Careers and coach profiles";
      club.setAttribute("onclick", "Career.open()");
    }
  };
  const originalRender = render;
  render = function () {
    originalRender();
    renderHeader();
  };
  // Career library: header, a responsive grid of career cards and a collapsible archive.
  const card = (m, isArchived) => {
    const current = m.id === currentId,
      id = esc(m.id),
      name = esc(m.name),
      role = ROLE_NAMES[m.role] || m.role || "Head coach",
      menuItems = isArchived
        ? `<button type="button" role="menuitem" onclick="Career.exportCareer('${id}')">Export</button><button type="button" role="menuitem" class="cl-danger" onclick="Career.remove('${id}')">Delete…</button>`
        : `<button type="button" role="menuitem" onclick="Career.rename('${id}')">Rename</button><button type="button" role="menuitem" onclick="Career.exportCareer('${id}')">Export</button>${current ? '<button type="button" role="menuitem" onclick="Career.branch()">Save as a copy</button>' : ""}<button type="button" role="menuitem" onclick="Career.archive('${id}',true)" ${current ? 'disabled title="Load another career before archiving this one"' : ""}>Archive</button><button type="button" role="menuitem" class="cl-danger" onclick="Career.remove('${id}')">Delete…</button>`;
    return `<article class="cl-card${current ? " is-active" : ""}${isArchived ? " is-archived" : ""}" style="--club:${esc(TEAM_COLORS[m.team] || "#3b6cc8")}" aria-label="${name}${current ? " (active career)" : ""}"><div class="cl-card-top"><div class="cl-logo">${logo(m.team)}</div><div class="cl-card-id"><h4 title="${name}">${name}</h4><p title="${esc(clubName(m.team))}">${esc(clubName(m.team))}</p></div>${current ? '<span class="cl-badge">Active</span>' : isArchived ? '<span class="cl-badge cl-badge-muted">Archived</span>' : ""}</div><div class="cl-coach"><span class="cl-coach-art">${coachPixelAvatar(m.avatar, { seed: m.id })}</span><div><b title="${esc(m.coach)}">${esc(m.coach)}</b><small>${esc(role)}</small></div></div><dl class="cl-stats"><div><dt>Season</dt><dd>${esc(seasonText(m))}</dd></div><div><dt>Record</dt><dd>${esc(m.record || "0–0")}</dd></div><div><dt>Last played</dt><dd><time datetime="${esc(new Date(m.updatedAt || 0).toISOString())}">${esc(playedText(m.updatedAt))}</time></dd></div></dl><div class="cl-card-actions">${isArchived ? `<button class="small" onclick="Career.archive('${id}',false)">Restore</button>` : `<button class="small" onclick="Career.load('${id}')">${current ? "Resume" : "Load"} <span aria-hidden="true">→</span></button>`}<details class="cl-menu"><summary class="cl-menu-button" aria-label="More actions for ${name}">More <span aria-hidden="true">▾</span></summary><div class="cl-menu-list" role="menu">${menuItems}</div></details></div></article>`;
  };
  const showHome = async () => {
    disposeAvatar();
    const list = store ? await store.list() : [],
      rows = list.filter((m) => !m.archived),
      old = list.filter((m) => m.archived);
    modal(
      `<div class="cl"><div class="cl-head"><div class="cl-title"><i class="cl-mark" aria-hidden="true"></i><h2 id="cl-title">Career library</h2><span class="cl-count" title="Each career keeps its own coach, league and autosave on this device">${list.length} career${list.length === 1 ? "" : "s"}</span></div><div class="cl-head-actions"><label class="cl-import" tabindex="0" role="button" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.querySelector('input').click()}">Import<input type="file" accept=".json,application/json" tabindex="-1" onchange="Career.importFile(this)"></label><button class="cl-new" onclick="Career.new()">＋ New career</button>${currentId ? '<button class="cl-close" aria-label="Close career library" onclick="closeModal()">×</button>' : ""}</div></div>${window.careerLoadError ? notice({ tone: "bad", cls: "cl-notice", title: "The previous active career could not be opened.", detail: `${window.careerLoadError}. Other saved careers are available below.` }) : ""}${!store ? notice({ tone: "bad", cls: "cl-notice", title: window.careerStorageError || "Career storage is unavailable.", detail: "Enable site storage to keep separate careers. You can export the current browser career meanwhile.", actions: [{ label: "Export current career", onclick: "F.downloadSave()", primary: true }] }) : ""}<section class="cl-section" aria-labelledby="cl-active-heading"><div class="cl-section-head"><h3 id="cl-active-heading">Your careers</h3></div>${rows.length ? `<div class="cl-grid">${rows.map((m) => card(m, false)).join("")}</div>` : `<div class="cl-empty"><div class="cl-empty-art" aria-hidden="true">${coachPixelAvatar(null)}</div><h3>The first chapter is yours.</h3><p>Create your coach, choose one of 32 franchises and start building a legacy.</p><button onclick="Career.new()">＋ Create a career</button></div>`}</section>${old.length ? `<details class="cl-archive" ${archiveOpen ? "open" : ""} ontoggle="Career.archived(this.open)"><summary><span>Archived careers</span> <small>${old.length}</small></summary><p class="cl-archive-note">Archived careers stay saved. Restore one to play it again.</p><div class="cl-grid">${old.map((m) => card(m, true)).join("")}</div></details>` : ""}</div>`,
    );
    document.getElementById("modal").classList.add("career-modal", "cl-modal");
  };
  // The wizard coach; keeps its turn when the look changes and the stage is rebuilt.
  const mountAvatar = () => {
    const orbit = avatar?.orbit;
    disposeAvatar();
    const host = document.getElementById("coach-avatar-host");
    if (host) {
      avatar = new CharacterStage(host, { appearance: wizard.appearance });
      if (Number.isFinite(orbit)) avatar.rotate(orbit - avatar.orbit);
      window.CoachPreview = { rotate: (d) => avatar?.rotate(d) };
    }
  };
  const downloadCareer = (name, data) => {
    const file = {
        format: "GridironCareer",
        version: 2,
        name: name || "Gridiron career",
        state: data,
      },
      url = URL.createObjectURL(
        new Blob([JSON.stringify(file)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download =
      (name || "gridiron-career").replace(/[^a-z0-9_-]/gi, "-") + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // ---------- New-career wizard ----------
  // One shell (top bar with steps, main panel, side panel, footer) rendered once; steps repaint
  // the parts that change so the 3D coach stays mounted and typing never loses focus.
  const STEPS = [
    ["Club", "Choose your club"],
    ["Identity", "Who’s on the headset?"],
    ["Look", "Your touchline look"],
    ["Philosophy", "How you coach"],
    ["Review", "Sign the contract"],
  ];
  const ROLE_INFO = {
    HC: ["Head coach", "Run the whole football operation: tactics, training, the roster, contracts, scouting and the draft."],
    Owner: ["Owner", "Everything a head coach runs, plus stadium projects and league votes."],
    GM: ["General manager", "Run personnel and money: roster, contracts, scouting and the draft. No coaching."],
    OC: ["Offensive coordinator", "Coach one unit: the offense."],
    DC: ["Defensive coordinator", "Coach one unit: the defense."],
  };
  const NATIONS = ["United States", "Canada", "Mexico", "United Kingdom", "Ireland", "Germany", "Australia", "Nigeria", "Jamaica", "Japan", "Brazil", "France"];
  const LOOK_OPTIONS = [
    ["outfit", "Outfit", ["Polo", "Tracksuit", "Suit"]],
    ["build", "Build", ["Lean", "Athletic", "Broad"]],
    ["hairStyle", "Hair", ["Short", "Curly", "Bald"]],
    ["beard", "Facial hair", ["None", "Stubble", "Full"]],
  ];
  const REPUTATION = { "First appointment": 35, Coordinator: 55, "Veteran head coach": 75 };
  let outlook = null,
    outlookState = "idle",
    saveNameAuto = true;
  const loadOutlook = () => {
    if (outlookState !== "idle") return;
    outlookState = "loading";
    fetch(new URL("../data/nfl-rosters.json", import.meta.url))
      .then((r) => (r.ok ? r.json() : null))
      // Let the wizard paint first; the 32-club pass takes a moment.
      .then((data) => new Promise((done) => setTimeout(() => done(data), 30)))
      .then((data) => {
        outlook = clubOutlook(data);
        outlookState = outlook ? "ready" : "failed";
      })
      .catch((e) => {
        console.warn("Club outlook unavailable: " + e.message);
        outlookState = "failed";
      })
      .finally(() => {
        if (wizard && document.getElementById("nw")) paint({ main: wizardStep === 0 || wizardStep === 4 });
      });
  };
  const clubFull = (i) => clubs[i][1] + " " + clubs[i][2];
  const roleName = (r) => ROLE_INFO[r]?.[0] || r;
  const pressed = (on) => `aria-pressed="${on ? "true" : "false"}"`;
  const chip = (text, tone) => `<span class="nw-chip" data-tone="${tone || "neutral"}">${esc(text)}</span>`;
  const toneOfTier = (o) =>
    o.expectation === "Contender" ? "good" : o.expectation === "Rebuild" ? "bad" : o.expectation === "Playoff push" ? "accent" : "neutral";
  const identityError = () =>
    !String(wizard.name || "").trim() || !Number.isInteger(Number(wizard.age)) || wizard.age < 25 || wizard.age > 80
      ? "Enter a coach name and an age from 25 to 80."
      : "";
  const budgetLeft = () => COACH_BUDGET - COACH_ATTRIBUTES.reduce((n, k) => n + Number(wizard.attributes[k] || 0), 0);
  const topAttribute = (attrs) => COACH_ATTRIBUTES.reduce((a, k) => (attrs[k] > attrs[a] ? k : a), COACH_ATTRIBUTES[0]);

  const tile = (i) => {
    const c = clubs[i],
      o = outlook?.[i],
      on = wizard.team === i;
    return `<button type="button" class="nw-tile${on ? " is-selected" : ""}" data-team="${i}" data-k="team-${i}" data-tone="${o?.difficulty.tone || ""}" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" onclick="Career.team(${i})" ondblclick="Career.next()" aria-label="${esc(clubFull(i))}${o ? `, overall ${o.rating}, ranked ${o.rank} of 32, ${o.difficulty.label}` : ""}"><span class="nw-tile-logo">${logo(i)}</span><span class="nw-tile-name"><b>${esc(c[0])}</b><small>${esc(c[2])}</small></span>${o ? `<span class="nw-tile-ovr" title="Opening roster overall">${o.rating}</span>` : ""}</button>`;
  };
  const clubStep = () =>
    `<p class="nw-intro">Pick the club you want to lead. Ratings come from the real ${NEW_CAREER_YEAR} rosters you inherit. Use the arrow keys to browse and Enter to continue.</p><div class="nw-clubs" role="radiogroup" aria-label="Clubs">${["AFC", "NFC"]
      .map(
        (conf) =>
          `<div class="nw-conf"><h3 class="nw-conf-name">${conf}</h3><div class="nw-divs">${["East", "North", "South", "West"]
            .map(
              (d) =>
                `<section class="nw-div" aria-label="${conf} ${d}"><h4>${d}</h4>${clubs
                  .map((c, i) => (c[3] === conf + " " + d ? tile(i) : ""))
                  .join("")}</section>`,
            )
            .join("")}</div></div>`,
      )
      .join("")}</div><p class="nw-legend"><span class="nw-key" data-tone="good"></span>Easy <span class="nw-key" data-tone="neutral"></span>Normal <span class="nw-key" data-tone="warn"></span>Hard <span class="nw-key" data-tone="bad"></span>Very hard <i>·</i> Number = opening roster overall</p>`;

  const roleCard = (r) =>
    `<button type="button" class="nw-role${wizard.role === r ? " is-selected" : ""}" data-k="role-${r}" role="radio" aria-checked="${wizard.role === r}" onclick="Career.change('role','${r}')"><b>${esc(ROLE_INFO[r][0])}</b><span>${esc(ROLE_INFO[r][1])}</span></button>`;
  // What each job may decide, read from the role permissions in state.mjs.
  const ROLE_AREAS = [
    ["Coaching", (r) => (r.includes("coach") ? "Full" : r.includes("offense") ? "Offense" : r.includes("defense") ? "Defense" : "")],
    ["Roster", "roster"],
    ["Contracts", "finance"],
    ["Scouting", "scout"],
    ["Media", "media"],
    ["Stadium", "stadium"],
    ["League", "league"],
  ];
  const roleCell = (rights, area) => {
    const v = typeof area === "function" ? area(rights) : rights.includes(area) ? "Yes" : "";
    if (!v) return `<td><span class="nw-no" aria-hidden="true">·</span><span class="nw-sr">No</span></td>`;
    return `<td><span class="nw-yes" aria-hidden="true"></span>${v === "Yes" ? `<span class="nw-sr">Yes</span>` : esc(v)}</td>`;
  };
  const roleMatrix = () =>
    `<h3 class="nw-label nw-matrix-title" id="nw-matrix-title">What each job controls</h3><table class="nw-matrix" aria-labelledby="nw-matrix-title"><thead><tr><th scope="col">Job</th>${ROLE_AREAS.map(([label]) => `<th scope="col">${esc(label)}</th>`).join("")}</tr></thead><tbody>${["HC", "Owner", "GM", "OC", "DC"]
      .map(
        (role) =>
          `<tr class="${wizard.role === role ? "is-selected" : ""}"><th scope="row">${esc(ROLE_INFO[role][0])}</th>${ROLE_AREAS.map(([, area]) => roleCell(S.ROLES[role] || [], area)).join("")}</tr>`,
      )
      .join("")}</tbody></table>`;
  const identityStep = () =>
    `<p class="nw-intro">Name your coach and choose the job. Everything else has a sensible default, so you can skip straight to the contract.</p><div class="nw-form"><label class="nw-field nw-field-name"><span>Coach name</span><input id="nw-name" data-k="name" type="text" maxlength="40" autocomplete="off" spellcheck="false" value="${esc(wizard.name)}" oninput="Career.change('name',this.value)"></label><label class="nw-field nw-field-age"><span>Age</span><input data-k="age" type="number" min="25" max="80" value="${esc(wizard.age)}" oninput="Career.change('age',this.value)"></label><label class="nw-field"><span>Nationality</span><input data-k="nationality" type="text" maxlength="40" list="nw-nations" value="${esc(wizard.nationality)}" oninput="Career.change('nationality',this.value)"><datalist id="nw-nations">${NATIONS.map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist></label></div><h3 class="nw-label">Your job <small>Locked once the career begins</small></h3><div class="nw-roles" role="radiogroup" aria-label="Career role">${["HC", "Owner", "GM", "OC", "DC"].map(roleCard).join("")}</div>${roleMatrix()}`;

  const swatchRow = (key, label) => {
    const value = wizard.appearance[key],
      list = [...(key === "jacket" ? [TEAM_COLORS[wizard.team]] : []), ...APPEARANCE_SWATCHES[key]].filter(
        (v, i, a) => /^#[0-9a-f]{6}$/i.test(v) && a.indexOf(v) === i,
      ),
      custom = !list.some((v) => v.toLowerCase() === String(value).toLowerCase());
    return `<div class="nw-look-row"><span class="nw-look-label">${label}</span><div class="nw-swatches" role="group" aria-label="${label}">${list
      .map(
        (v, i) =>
          `<button type="button" class="nw-swatch${v.toLowerCase() === String(value).toLowerCase() ? " is-selected" : ""}" data-k="ap-${key}-${i}" style="--sw:${v}" ${pressed(v.toLowerCase() === String(value).toLowerCase())} aria-label="${label} ${key === "jacket" && i === 0 ? "club colour" : i + 1}" title="${key === "jacket" && i === 0 ? "Club colour" : v}" onclick="Career.appearance('${key}','${v}')"></button>`,
      )
      .join("")}<label class="nw-swatch nw-swatch-custom${custom ? " is-selected" : ""}" title="Custom colour" style="--sw:${esc(value)}"><input type="color" data-k="ap-${key}-custom" aria-label="Custom ${label.toLowerCase()} colour" value="${esc(value)}" onchange="Career.appearance('${key}',this.value)"><span aria-hidden="true">+</span></label></div></div>`;
  };
  const lookStep = () => {
    const a = wizard.appearance;
    return `<p class="nw-intro">Your coach appears on the touchline, in the office and in conversations. Drag the model to turn it.</p><div class="nw-look"><div class="nw-look-col">${LOOK_OPTIONS.map(
      ([key, label, values]) =>
        `<div class="nw-look-row"><span class="nw-look-label">${label}</span><div class="nw-seg" role="group" aria-label="${label}">${values
          .map((v) => `<button type="button" data-k="ap-${key}-${v}" ${pressed(a[key] === v)} onclick="Career.appearance('${key}','${v}')">${esc(v)}</button>`)
          .join("")}</div></div>`,
    ).join(
      "",
    )}<div class="nw-look-row"><span class="nw-look-label">Height</span><div class="nw-range"><input type="range" data-k="ap-height" min="160" max="205" value="${a.height}" aria-label="Height in centimetres" oninput="this.nextElementSibling.textContent=this.value+' cm'" onchange="Career.appearance('height',Number(this.value))"><output>${a.height} cm</output></div></div></div><div class="nw-look-col">${swatchRow("skin", "Skin")}${swatchRow("hair", "Hair colour")}${swatchRow("jacket", "Jacket")}<div class="nw-look-row"><span class="nw-look-label">Extras</span><div class="nw-seg nw-seg-toggles"><button type="button" data-k="ap-glasses" ${pressed(a.glasses)} onclick="Career.appearance('glasses',${!a.glasses})">Glasses</button><button type="button" data-k="ap-headset" ${pressed(a.headset)} onclick="Career.appearance('headset',${!a.headset})">Headset</button></div></div><button type="button" class="secondary small nw-shuffle" data-k="ap-shuffle" onclick="Career.shuffleLook()">Shuffle look</button></div></div>`;
  };

  const optionGroup = (key, label, note = "") =>
    `<div class="nw-group"><h3 class="nw-label">${label}${note ? ` <small>${note}</small>` : ""}</h3><div class="nw-opts" role="radiogroup" aria-label="${label}">${Object.entries(PHILOSOPHY[key])
      .map(([value, info]) => {
        const on = wizard[key] === value,
          tag = key === "background" ? `${nice(topAttribute(BACKGROUNDS[value]))} ${BACKGROUNDS[value][topAttribute(BACKGROUNDS[value])]}` : info.tag;
        return `<button type="button" class="nw-opt${on ? " is-selected" : ""}" role="radio" aria-checked="${on}" data-k="${key}-${esc(value)}" onclick="Career.change('${key}','${esc(value)}')"><b>${esc(value)}</b><small>${esc(tag)}</small><span>${esc(info.effect)}</span></button>`;
      })
      .join("")}</div></div>`;
  const philosophyStep = () => {
    const left = budgetLeft();
    return `<div class="nw-philosophy"><div class="nw-choices">${optionGroup("background", "Background", "Resets your attributes")}${optionGroup("experience", "Experience")}${optionGroup("style", "Offensive style", "Adjustable later in Game plan")}${optionGroup("personality", "Personality")}</div><section class="nw-attrs" aria-labelledby="nw-attrs-title"><div class="nw-attrs-head"><h3 id="nw-attrs-title" class="nw-label">Coach attributes</h3><span id="coach-points-left" class="nw-budget"></span></div>${COACH_ATTRIBUTES.map((k) => {
      const v = Number(wizard.attributes[k]) || 0;
      return `<div class="nw-attr"><span>${nice(k)}</span><button type="button" class="nw-step-btn" data-k="attr-${k}-down" aria-label="Lower ${k}" onclick="Career.nudge('${k}',-1)" ${v <= 1 ? "disabled" : ""}>−</button><i class="nw-bar" aria-hidden="true"><em style="width:${v * 5}%"></em></i><b aria-label="${k} ${v} of 20">${v}</b><button type="button" class="nw-step-btn" data-k="attr-${k}-up" aria-label="Raise ${k}" onclick="Career.nudge('${k}',1)" ${v >= 20 || left <= 0 ? "disabled" : ""}>+</button></div>`;
    }).join("")}<p class="nw-archetype">Archetype <b>${esc(coachArchetype(wizard.attributes))}</b></p><p class="nw-footnote">Development, motivation, discipline and medical feed weekly training and recovery. Development, offense and defense set your archetype and coaching skills; the average sets your rating as head coach.</p></section></div>`;
  };

  const lede = () => {
    const o = outlook?.[wizard.team],
      last = String(wizard.name).trim().split(/\s+/).pop(),
      exp = { "First appointment": "a first senior appointment", Coordinator: "coordinator experience", "Veteran head coach": "a veteran head coach’s record" }[wizard.experience];
    return `${esc(last)} (${esc(wizard.age)}, ${esc(wizard.nationality)}) arrives as a ${esc(wizard.background.toLowerCase())} with ${exp}, a ${esc(wizard.style.toLowerCase())} approach and a ${esc(wizard.personality.toLowerCase())} touch.${o ? ` The ${esc(clubs[wizard.team][2])} open ${NEW_CAREER_YEAR} with a roster rated ${o.rating} (#${o.rank} of 32); the board expects about ${o.projected} wins.` : ""}`;
  };
  const reviewStep = () => {
    const o = outlook?.[wizard.team],
      facts = [
        ["Role", roleName(wizard.role)],
        ["Archetype", coachArchetype(wizard.attributes)],
        ["Reputation", REPUTATION[wizard.experience] + " · " + wizard.experience],
        ["Opening roster", o ? `${o.rating} OVR · #${o.rank} of 32` : "Real " + NEW_CAREER_YEAR + " rosters"],
        ["Board expects", o ? `${o.expectation} · ~${o.projected} wins` : "Set in your first meeting"],
        ["Difficulty", o ? o.difficulty.label : "—"],
      ];
    return `<article class="nw-release" aria-labelledby="nw-release-title"><div class="nw-release-band"><span class="nw-release-logo">${logo(wizard.team)}</span><span>Official announcement</span><span>${esc(clubs[wizard.team][3])} · ${NEW_CAREER_YEAR}</span></div><div class="nw-release-body"><div class="nw-release-art">${coachPixelAvatar(wizard.appearance, { label: wizard.name + " portrait", seed: "wizard" })}</div><div class="nw-release-copy"><span class="eyebrow">${esc(clubFull(wizard.team))}</span><h2 id="nw-release-title">${esc(String(wizard.name).trim() || "Your coach")} takes charge in ${esc(clubs[wizard.team][1])}</h2><p class="nw-release-sub">Named ${esc(roleName(wizard.role).toLowerCase())} of the ${esc(clubFull(wizard.team))}</p><p class="nw-release-lede">${lede()}</p><dl class="nw-release-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></div></div><div class="nw-release-foot"><label class="nw-field nw-field-save"><span>Career save name</span><input data-k="saveName" type="text" maxlength="60" value="${esc(wizard.saveName)}" oninput="Career.change('saveName',this.value)"></label><div class="nw-sign"><span class="nw-sign-name">${esc(String(wizard.name).trim() || "—")}</span><small>${esc(roleName(wizard.role))} · signature</small></div></div></article>`;
  };

  const report = () => {
    const i = wizard.team,
      o = outlook?.[i];
    const head = `<div class="nw-report-head"><span class="nw-report-logo">${logo(i)}</span><div><span class="eyebrow">${esc(clubs[i][3])}</span><h3>${esc(clubFull(i))}</h3></div></div>`;
    if (!o)
      return `${head}<p class="nw-report-wait">${outlookState === "failed" ? "Scouting data is unavailable. You can still start with this club." : "Scouting the league…"}</p>`;
    const facts = [
      ["Projected wins", `~${o.projected}`],
      ["Cap room", `$${o.capRoom.toFixed(1)}M`],
      ["Best player", o.star ? `${o.star.name} · ${o.star.pos} ${o.star.ovr}` : "—"],
      ["Starting QB", o.qb ? `${o.qb.name} · ${o.qb.ovr}` : "—"],
      ["Starter age", `${o.starterAge} avg`],
      ...(o.coach ? [[wizard.role === "HC" ? "You replace" : "Head coach", o.coach]] : []),
    ];
    return `${head}<div class="nw-report-ovr"><b>${o.rating}</b><span>Opening OVR<small>#${o.rank} of 32 · league ${o.leagueAvg}</small></span></div><div class="nw-report-chips">${chip(o.expectation, toneOfTier(o))}${chip(o.difficulty.label, o.difficulty.tone)}</div><dl class="nw-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd title="${esc(v)}">${esc(v)}</dd></div>`).join("")}</dl>`;
  };
  const summary = () => {
    const rows = [
      ["Background", wizard.background],
      ["Experience", wizard.experience],
      ["Offense", wizard.style],
      ["Personality", wizard.personality],
      ["Archetype", coachArchetype(wizard.attributes)],
    ];
    return `<div class="nw-sum-head"><span class="nw-sum-logo">${logo(wizard.team)}</span><div><b id="coach-preview-name">${esc(String(wizard.name).trim() || "Your coach")}</b><small>${esc(roleName(wizard.role))} · ${esc(clubs[wizard.team][2])}</small></div></div><dl class="nw-facts nw-facts-tight">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
  };
  const stepsBar = () =>
    STEPS.map(
      ([label], i) =>
        `<li><button type="button" class="nw-step${i === wizardStep ? " is-current" : i < wizardStep ? " is-done" : ""}" ${i === wizardStep ? 'aria-current="step"' : ""} onclick="Career.goto(${i})"><i>${i < wizardStep ? "✓" : i + 1}</i><span>${label}</span></button></li>`,
    ).join("");
  const footer = () =>
    `<button class="secondary" onclick="Career.step(-1)">${wizardStep ? "← Back" : "← Career library"}</button><p id="wizard-error" role="alert"></p><span class="nw-hint" aria-hidden="true"><kbd>Enter</kbd> ${wizardStep === 4 ? "sign" : "continue"}</span>${wizardStep < 3 ? `<button class="secondary nw-skip" onclick="Career.goto(4)">Skip to contract</button>` : ""}<button id="wizard-next" class="${wizardStep === 4 ? "nw-begin" : ""}" onclick="Career.next()">${wizardStep === 4 ? "Sign &amp; begin career →" : "Continue →"}</button>`;
  const shellHTML = () =>
    `<div class="nw" id="nw" data-step="${wizardStep}" onkeydown="Career.key(event)"><div class="nw-top"><div class="nw-title"><button class="link nw-library" onclick="Career.open()">← Career library</button><span class="eyebrow">New career · Step <b id="nw-step-no">${wizardStep + 1}</b> of 5</span><h2 id="nw-heading">${STEPS[wizardStep][1]}</h2></div><ol class="nw-steps" id="nw-steps">${stepsBar()}</ol></div><div class="nw-body"><section class="nw-main" id="nw-main" aria-labelledby="nw-heading"></section><div class="nw-side" role="complementary" aria-label="Your career so far"><div class="nw-report" id="nw-report"></div><div class="nw-coach"><div class="nw-stage"><div id="coach-avatar-host"></div><div class="nw-orbit"><button type="button" aria-label="Rotate coach left" onclick="CoachPreview.rotate(-.4)">↶</button><button type="button" aria-label="Rotate coach right" onclick="CoachPreview.rotate(.4)">↷</button></div></div><div class="nw-summary" id="nw-summary"></div></div></div></div><div class="nw-foot" id="nw-foot"></div></div>`;
  const STEP_VIEWS = [clubStep, identityStep, lookStep, philosophyStep, reviewStep];
  const setHTML = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };
  const paint = ({ main = true } = {}) => {
    const root = document.getElementById("nw");
    if (!root || !wizard) return;
    const focusKey = root.contains(document.activeElement) ? document.activeElement?.dataset?.k : null;
    // A close event queued just before the wizard opened can strip the dialog classes.
    document.getElementById("modal").classList.add("career-modal", "wizard-modal");
    root.dataset.step = wizardStep;
    root.style.setProperty("--club", TEAM_COLORS[wizard.team] || "var(--team)");
    document.getElementById("nw-step-no").textContent = wizardStep + 1;
    document.getElementById("nw-heading").textContent = STEPS[wizardStep][1];
    setHTML("nw-steps", stepsBar());
    if (main) {
      setHTML("nw-main", STEP_VIEWS[wizardStep]());
      document.getElementById("nw-main").scrollTop = 0;
    }
    setHTML("nw-report", report());
    setHTML("nw-summary", summary());
    setHTML("nw-foot", footer());
    if (wizardStep >= 1 && wizardStep <= 3 && !avatar) mountAvatar();
    Career.budget();
    if (focusKey) root.querySelector(`[data-k="${CSS.escape(focusKey)}"]`)?.focus();
  };
  // Focus the natural first control of a step after navigating to it.
  const focusStep = () => {
    const root = document.getElementById("nw");
    if (!root) return;
    const target =
      wizardStep === 0
        ? root.querySelector(".nw-tile.is-selected")
        : wizardStep === 1
          ? root.querySelector("#nw-name")
          : document.getElementById("wizard-next");
    target?.focus({ preventScroll: true });
    if (wizardStep === 1) target?.select?.();
  };
  const showWizard = () => {
    disposeAvatar();
    modal(shellHTML());
    document
      .getElementById("modal")
      .classList.add("career-modal", "wizard-modal");
    paint();
    focusStep();
  };
  window.Career = {
    get currentId() {
      return currentId;
    },
    get ready() {
      return ready;
    },
    autosave,
    flush,
    profile() {
      if (!safe()) return;
      disposeAvatar();
      const p = state.franchise.userCoach || {
        ...defaultCoach(state.team),
        name: state.coach.name,
        role: state.franchise.role,
        appearance: {
          ...DEFAULT_APPEARANCE,
          skin: state.franchise.career.avatar?.skin || DEFAULT_APPEARANCE.skin,
          jacket:
            state.franchise.career.avatar?.shirt || DEFAULT_APPEARANCE.jacket,
        },
      };
      modal(
        `<div class="coach-dossier"><div class="coach-dossier-scene"><div id="coach-avatar-host"></div><div class="preview-orbit"><button onclick="CoachPreview.rotate(-.4)" aria-label="Rotate coach left">↶</button><span>Drag to rotate</span><button onclick="CoachPreview.rotate(.4)" aria-label="Rotate coach right">↷</button></div></div><div class="coach-dossier-copy"><span class="eyebrow">YOUR HEAD COACH</span><h2>${esc(p.name)}</h2><p>${esc(clubs[state.team][1] + " " + clubs[state.team][2])} · ${esc(state.franchise.role)}</p><div class="wizard-review-grid"><div><span>Background</span><b>${esc(p.background)}</b></div><div><span>Experience</span><b>${esc(p.experience)}</b></div><div><span>Age / nationality</span><b>${p.age} · ${esc(p.nationality)}</b></div><div><span>Coaching style</span><b>${esc(state.coach.style)}</b></div></div><div class="coach-profile-attributes">${COACH_ATTRIBUTES.map((k) => `<div><span>${nice(k)}</span><b>${p.attributes[k]}</b><i><em style="width:${p.attributes[k] * 5}%"></em></i></div>`).join("")}</div><div class="modal-actions"><button class="secondary" onclick="closeModal();W.open('Career')">Career & staff</button><button onclick="closeModal()">Done</button></div></div></div>`,
      );
      document.getElementById("modal").classList.add("career-modal");
      avatar = new CharacterStage(
        document.getElementById("coach-avatar-host"),
        { appearance: p.appearance },
      );
      window.CoachPreview = { rotate: (d) => avatar?.rotate(d) };
    },
    canDismiss() {
      return !!currentId && !switching;
    },
    async save() {
      if (!currentId) {
        Career.open();
        return;
      }
      try {
        dirty = true;
        await flush();
        toast("Career saved.");
      } catch (e) {
        toast("Save failed: " + e.message);
      }
    },
    async open() {
      if (!safe()) return;
      try {
        await flush();
        await showHome();
      } catch (e) {
        toast(e.message);
      }
    },
    async new(team = 16) {
      if (!safe()) return;
      try {
        await flush();
        wizard = defaultCoach(Number(team));
        saveNameAuto = true;
        wizard.saveName = autoSaveName(wizard.name, clubs[wizard.team][2]);
        wizardStep = 0;
        showWizard();
        loadOutlook();
      } catch (e) {
        toast(e.message);
      }
    },
    change(key, value) {
      if (!wizard) return;
      if (["team", "age"].includes(key)) value = Number(value);
      wizard[key] = value;
      if (key === "saveName") saveNameAuto = false;
      if ((key === "name" || key === "team") && saveNameAuto)
        wizard.saveName = autoSaveName(wizard.name, clubs[wizard.team][2]);
      if (key === "background") wizard.attributes = { ...BACKGROUNDS[value] };
      const err = document.getElementById("wizard-error");
      if (err) err.textContent = "";
      // Choices repaint the step; typed fields only refresh the summary so focus stays put.
      if (["background", "experience", "style", "personality", "role"].includes(key)) paint();
      else setHTML("nw-summary", summary());
    },
    team(id) {
      if (!wizard) return;
      wizard.team = Number(id);
      if (saveNameAuto) wizard.saveName = autoSaveName(wizard.name, clubs[wizard.team][2]);
      for (const t of document.querySelectorAll("#nw .nw-tile")) {
        const on = Number(t.dataset.team) === wizard.team;
        t.classList.toggle("is-selected", on);
        t.setAttribute("aria-checked", on);
        t.tabIndex = on ? 0 : -1;
      }
      paint({ main: wizardStep !== 0 });
    },
    appearance(key, value) {
      if (!wizard) return;
      wizard.appearance[key] = value;
      paint();
      mountAvatar();
    },
    shuffleLook() {
      const pick = (list) => list[Math.floor(Math.random() * list.length)];
      for (const [key, , values] of LOOK_OPTIONS) wizard.appearance[key] = pick(values);
      for (const key of ["skin", "hair", "jacket"]) wizard.appearance[key] = pick(APPEARANCE_SWATCHES[key]);
      wizard.appearance.height = 165 + Math.floor(Math.random() * 31);
      paint();
      mountAvatar();
    },
    attribute(key, value) {
      wizard.attributes[key] = value;
      Career.budget();
    },
    nudge(key, delta) {
      const v = Number(wizard.attributes[key]) || 0,
        next = Math.max(1, Math.min(20, v + delta));
      if (next === v || (delta > 0 && budgetLeft() <= 0)) return;
      wizard.attributes[key] = next;
      paint();
    },
    budget() {
      const el = document.getElementById("coach-points-left"),
        next = document.getElementById("wizard-next");
      const remaining = budgetLeft();
      if (el) {
        el.textContent = remaining < 0 ? `${-remaining} over budget` : remaining === 1 ? "1 point left" : `${remaining} points left`;
        el.classList.toggle("over-budget", remaining < 0);
      }
      if (next) next.disabled = remaining < 0;
    },
    goto(target) {
      if (!wizard) return;
      target = Math.max(0, Math.min(4, Number(target)));
      if (target === wizardStep) return;
      const error = target > 1 ? identityError() : "";
      wizardStep = error ? 1 : target;
      paint();
      focusStep();
      if (error) document.getElementById("wizard-error").textContent = error;
    },
    step(delta) {
      if (wizardStep === 0 && delta < 0) {
        Career.open();
        return;
      }
      Career.goto(wizardStep + delta);
    },
    next() {
      if (wizardStep === 4) Career.begin();
      else if (!document.getElementById("wizard-next")?.disabled) Career.step(1);
    },
    // Enter continues from anywhere in the wizard; arrow keys move across the club board.
    key(e) {
      const t = e.target;
      if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !e.isComposing) {
        if (t.classList?.contains("nw-tile")) {
          e.preventDefault();
          Career.team(Number(t.dataset.team));
          Career.next();
          return;
        }
        if (t.tagName === "BUTTON" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.type === "color") return;
        e.preventDefault();
        Career.next();
        return;
      }
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!dir || !t.classList?.contains("nw-tile")) return;
      e.preventDefault();
      const box = (el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        },
        from = box(t);
      let best = null,
        bestScore = Infinity;
      for (const el of document.querySelectorAll("#nw .nw-tile")) {
        if (el === t) continue;
        const p = box(el),
          along = (p.x - from.x) * dir[0] + (p.y - from.y) * dir[1],
          across = Math.abs((p.x - from.x) * dir[1]) + Math.abs((p.y - from.y) * dir[0]);
        if (along <= 4) continue;
        const score = along + across * 3;
        if (score < bestScore) (best = el), (bestScore = score);
      }
      if (best) {
        Career.team(Number(best.dataset.team));
        best.focus();
      }
    },
    async begin() {
      if (!safe()) return;
      try {
        validateCoach(wizard);
        if (!store)
          throw Error("Enable site storage before creating a career.");
        await flush();
        switching = true;
        const previousState = state,
          previousId = currentId,
          previousMeta = currentMeta;
        try {
          disposeAvatar();
          rawStart(wizard.team);
          applyCoach(state, wizard);
          delete state.franchise.office;
          syncOffice(state);
          initialize();
          ensureCareerRatings(state);
          const id = careerId(),
            meta = saveMetadata(state, { id, name: wizard.saveName });
          await store.put(id, serializeCareer(state), meta, { active: true });
          currentId = id;
          currentMeta = meta;
          lastPayload = serializeCareer(state);
          dirty = false;
          status = "saved";
          closeModal();
        } catch (e) {
          state = previousState;
          currentId = previousId;
          currentMeta = previousMeta;
          league = clubs[state.team][3];
          render();
          showWizard();
          throw e;
        } finally {
          switching = false;
        }
        F.tab("Overview");
        render();
        toast("Welcome, Coach " + state.coach.name + ". Your career is saved.");
      } catch (e) {
        const el = document.getElementById("wizard-error");
        if (el) el.textContent = e.message;
        else toast(e.message);
      }
    },
    async load(id) {
      if (!safe()) return;
      try {
        await flush();
        if (id === currentId) {
          disposeAvatar();
          closeModal();
          render();
          return;
        }
        const record = await store.get(id);
        if (!record) throw Error("Career not found.");
        const candidate = parseCareerSave(record.payload).state;
        S.migrate(candidate);
        S.validate(candidate);
        if (candidate.franchise.userCoach)
          validateCoach(candidate.franchise.userCoach);
        ensureCareerRatings(candidate);
        switching = true;
        await store.setActive(id);
        disposeAvatar();
        window.finishMatchPlayback?.();
        state = candidate;
        currentId = id;
        lastPayload = record.payload;
        currentMeta = await store.read("metadata", id);
        league = clubs[state.team][3];
        dirty = false;
        status = "saved";
        initialize();
        closeModal();
        switching = false;
        F.tab("Overview");
        render();
        toast("Loaded " + currentMeta.name);
      } catch (e) {
        switching = false;
        toast("Could not load career: " + e.message);
      }
    },
    async rename(id) {
      const meta = await store.read("metadata", id);
      modal(
        `<div class="career-small-modal"><span class="eyebrow">CAREER NAME</span><h2>Rename this career.</h2><label>Name<input id="rename-career-name" value="${esc(meta.name)}" maxlength="60"></label><div class="modal-actions"><button class="secondary" onclick="Career.open()">Back</button><button onclick="Career.confirmRename('${id}')">Save name</button></div></div>`,
      );
    },
    async confirmRename(id) {
      const name = document.getElementById("rename-career-name").value.trim();
      if (!name) {
        toast("Enter a career name.");
        return;
      }
      try {
        await flush();
        const row = await store.get(id),
          meta = await store.read("metadata", id);
        await store.put(id, row.payload, {
          ...meta,
          name,
          updatedAt: Date.now(),
        });
        if (id === currentId) currentMeta = { ...meta, name };
        showHome();
      } catch (e) {
        toast(e.message);
      }
    },
    async archive(id, value) {
      if (id === currentId && value) {
        toast("Load another career before archiving this one.");
        return;
      }
      try {
        await store.archive(id, value);
        await showHome();
      } catch (e) {
        toast(e.message);
      }
    },
    archived(open) {
      archiveOpen = typeof open === "boolean" ? open : !archiveOpen;
    },
    async exportCareer(id) {
      if (!id || id === currentId) return Career.export();
      try {
        const record = await store.get(id),
          meta = await store.read("metadata", id);
        if (!record) throw Error("Career not found.");
        downloadCareer(meta?.name, JSON.parse(record.payload));
      } catch (e) {
        toast("Export failed: " + e.message);
      }
    },
    async remove(id) {
      try {
        const m = await store.read("metadata", id);
        if (!m) throw Error("Career not found.");
        const current = id === currentId;
        modal(
          `<div class="career-small-modal cl-confirm" role="alertdialog" aria-labelledby="cl-delete-title" aria-describedby="cl-delete-desc"><span class="eyebrow">Delete career</span><h2 id="cl-delete-title">Delete “${esc(m.name)}”?</h2><div class="cl-confirm-card">${logo(m.team)}<div><b>${esc(m.coach)} · ${esc(clubName(m.team))}</b><small>${esc(seasonText(m))} · ${esc(m.record || "0–0")}</small></div></div><p id="cl-delete-desc">This permanently removes the career and its autosave from this device. <b>It can’t be undone.</b>${current ? " This is the career you are playing now; your most recent other career opens instead." : ""}</p><p>Export a backup first if you might want it back.</p><div class="modal-actions"><button class="secondary" onclick="Career.open()">Cancel</button><button class="secondary" onclick="Career.exportCareer('${esc(id)}')">Export first</button><button class="cl-danger-button" onclick="Career.confirmDelete('${esc(id)}')">Delete permanently</button></div></div>`,
        );
        document.querySelector("#modal .cl-confirm .secondary")?.focus();
      } catch (e) {
        toast(e.message);
      }
    },
    async confirmDelete(id) {
      if (!safe()) return;
      try {
        const deletingCurrent = id === currentId;
        if (deletingCurrent) {
          // Drop pending autosaves of the career being deleted.
          clearTimeout(timer);
          timer = null;
          dirty = false;
          await writeChain.catch(() => {});
        } else await flush();
        const meta = await store.read("metadata", id),
          { active } = await store.delete(id);
        // Never resurrect an old browser save once the player manages careers.
        await store.setting("legacyMigrated", true).catch(() => {});
        const gone = `Deleted “${meta?.name || "career"}”.`;
        if (deletingCurrent) {
          currentId = null;
          currentMeta = null;
          lastPayload = null;
          status = "saved";
          render();
          if (active) {
            await Career.load(active);
            if (currentId === active) {
              toast(gone + " Loaded " + (currentMeta?.name || "your next career") + ".");
              return;
            }
          }
        }
        await showHome();
        toast(gone);
      } catch (e) {
        toast("Could not delete career: " + e.message);
      }
    },
    branch() {
      modal(
        `<div class="career-small-modal"><span class="eyebrow">SAVE AS</span><h2>A new branch of this career.</h2><p>Copy this exact league and coach into a separate save. Both careers remain playable.</p><label>Career name<input id="branch-career-name" maxlength="60" value="${esc((currentMeta?.name || "Career") + " — Alternate")}"></label><div class="modal-actions"><button class="secondary" onclick="Career.open()">Back</button><button onclick="Career.confirmBranch()">Create separate save</button></div></div>`,
      );
    },
    async confirmBranch() {
      try {
        const name = document.getElementById("branch-career-name").value.trim();
        if (!name) throw Error("Enter a name for this career.");
        await flush();
        const id = careerId(),
          meta = saveMetadata(state, { id, name });
        await store.put(id, serializeCareer(state), meta, { active: true });
        currentId = id;
        currentMeta = meta;
        dirty = false;
        await showHome();
        toast("Separate career created.");
      } catch (e) {
        toast(e.message);
      }
    },
    async export() {
      try {
        await flush();
        downloadCareer(
          currentMeta?.name || state.coach.name,
          JSON.parse(serializeCareer(state)),
        );
      } catch (e) {
        toast(e.message);
      }
    },
    async importFile(input) {
      try {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > 40_000_000)
          throw Error("Career files must be smaller than 40 MB.");
        const parsed = parseCareerSave(await file.text());
        S.migrate(parsed.state);
        S.validate(parsed.state);
        if (parsed.state.franchise.userCoach)
          validateCoach(parsed.state.franchise.userCoach);
        importCandidate = parsed;
        modal(
          `<div class="career-small-modal"><span class="eyebrow">IMPORT CAREER</span><h2>${esc(parsed.state.coach?.name || "Imported coach")}</h2><p>${esc(clubs[parsed.state.team][1] + " " + clubs[parsed.state.team][2])} · ${parsed.state.year} · Week ${parsed.state.week + 1}</p><p>This adds a separate career to your library.</p><label>Career name<input id="import-career-name" maxlength="60" value="${esc(parsed.name)}"></label><div class="modal-actions"><button class="secondary" onclick="Career.open()">Back</button><button onclick="Career.confirmImport()">Import as new career</button></div></div>`,
        );
      } catch (e) {
        // A file that parses but has the wrong shape ("null", a bare number) throws a TypeError deep
        // in the parser; show the player the same plain message as any other unsupported file.
        toast(e instanceof TypeError ? "This file is not a supported Gridiron career save." : e.message);
      }
      input.value = "";
    },
    async confirmImport() {
      if (!importCandidate) return;
      try {
        const id = careerId(),
          name = document.getElementById("import-career-name").value.trim();
        if (!name) throw Error("Enter a career name.");
        await flush();
        ensureCareerRatings(importCandidate.state);
        const meta = saveMetadata(importCandidate.state, { id, name });
        await store.put(id, serializeCareer(importCandidate.state), meta);
        importCandidate = null;
        await showHome();
        toast("Career imported. Load it when you are ready.");
      } catch (e) {
        toast(e.message);
      }
    },
  };
  // Double-clicks on the library's confirm buttons must not create, branch or import a career twice.
  for (const action of ["begin", "confirmBranch", "confirmImport", "confirmRename", "confirmDelete"])
    Career[action] = singleFlight(Career[action]);
  views["Careers & saves"] = () =>
    `<section class="gd-actionbar"><div class="f-actions"><button onclick="Career.open()">Open career library</button><button class="secondary" onclick="Career.save()">Save this career</button><button class="secondary" onclick="Career.export()">Export backup</button></div></section>`;
  chooseClub = () => Career.open();
  startCareer = (team) => Career.new(team);
  W.realCareer = () => Career.new();
  window.addEventListener("pagehide", () => flush().catch(() => {}));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flush().catch(() => {});
  });
  document.getElementById("modal").addEventListener("cancel", (e) => {
    if (!currentId) e.preventDefault();
  });
  document.getElementById("modal").addEventListener("close", () => {
    disposeAvatar();
    document
      .getElementById("modal")
      .classList.remove("career-modal", "wizard-modal", "cl-modal");
  });
  try {
    if (store) {
      if (currentId) {
        currentMeta = await store.read("metadata", currentId);
        lastPayload = (await store.get(currentId))?.payload;
      } else if (
        window.__gridironHadLegacy &&
        !(await store.read("settings", "legacyMigrated"))?.value
      ) {
        currentId = careerId();
        currentMeta = saveMetadata(state, {
          id: currentId,
          name: (state.coach?.name || "Coach") + " — Existing career",
        });
        await store.put(currentId, serializeCareer(state), currentMeta, {
          active: true,
        });
        await store.setting("legacyMigrated", true);
      }
    }
  } catch (e) {
    status = "error";
    toast("Existing career could not be migrated: " + e.message);
  }
  ready = true;
  render();
  await showHome();
}
