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
} from "./coach-profile.mjs";
import { saveMetadata, parseCareerSave, careerId } from "./save-store.mjs";
import { CharacterStage } from "./character-stage.mjs";
import { coachBadge, coachPixelAvatar } from "./coach-avatar.mjs";
import { TEAM_COLORS } from "../presentation/team-colors.mjs";
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
const option = (values, current) =>
  values
    .map(
      (v) =>
        `<option value="${esc(v)}" ${v === current ? "selected" : ""}>${esc({ HC: "Head coach", GM: "General manager", OC: "Offensive coordinator", DC: "Defensive coordinator" }[v] || nice(v))}</option>`,
    )
    .join("");
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
      footer.innerHTML = `<i class="live-dot"></i> <span>${status === "error" ? "Save failed — export a backup" : dirty || status === "saving" ? "Saving career…" : "Career saved on this device"}</span><button onclick="Career.open()">Manage careers ↗</button>`;
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
      `<div class="cl"><header class="cl-head"><div class="cl-title"><span class="eyebrow">Gridiron Director</span><h2 id="cl-title">Career library</h2><p>Every career keeps its own coach, league and autosave on this device.</p></div><div class="cl-head-actions"><label class="cl-import" tabindex="0" role="button" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.querySelector('input').click()}">Import<input type="file" accept=".json,application/json" tabindex="-1" onchange="Career.importFile(this)"></label><button onclick="Career.new()">＋ New career</button>${currentId ? '<button class="cl-close" aria-label="Close career library" onclick="closeModal()">×</button>' : ""}</div></header>${window.careerLoadError ? `<p class="cl-alert">The previous active career could not be opened: ${esc(window.careerLoadError)}. Other saved careers are available below.</p>` : ""}${!store ? `<div class="cl-alert"><p>${esc(window.careerStorageError || "Career storage is unavailable.")} Enable site storage to keep separate careers. You can export the current browser career.</p><button class="small" onclick="F.downloadSave()">Export current career</button></div>` : ""}<section class="cl-section" aria-labelledby="cl-active-heading"><div class="cl-section-head"><h3 id="cl-active-heading">Your careers <small>${rows.length}</small></h3></div>${rows.length ? `<div class="cl-grid">${rows.map((m) => card(m, false)).join("")}</div>` : `<div class="cl-empty"><div class="cl-empty-art" aria-hidden="true">${coachPixelAvatar(null)}</div><h3>The first chapter is yours.</h3><p>Create your coach, choose one of 32 franchises and start building a legacy.</p><button onclick="Career.new()">＋ Create a career</button></div>`}</section>${old.length ? `<details class="cl-archive" ${archiveOpen ? "open" : ""} ontoggle="Career.archived(this.open)"><summary><span>Archived careers</span> <small>${old.length}</small></summary><p class="cl-archive-note">Archived careers stay saved. Restore one to play it again.</p><div class="cl-grid">${old.map((m) => card(m, true)).join("")}</div></details>` : ""}</div>`,
    );
    document.getElementById("modal").classList.add("career-modal", "cl-modal");
  };
  const mountAvatar = () => {
    disposeAvatar();
    const host = document.getElementById("coach-avatar-host");
    if (host) {
      avatar = new CharacterStage(host, { appearance: wizard.appearance });
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
  const field = (label, key, type = "text", extra = "") =>
    `<label>${label}<input type="${type}" value="${esc(wizard[key])}" ${extra} oninput="Career.change('${key}',this.value)"></label>`;
  const select = (label, key, values) =>
    `<label>${label}<select onchange="Career.change('${key}',this.value)">${option(values, wizard[key])}</select></label>`;
  const appearanceField = (label, key, values) =>
    `<label>${label}<select onchange="Career.appearance('${key}',this.value)">${option(values, wizard.appearance[key])}</select></label>`;
  const steps = [
    "Choose franchise",
    "Your identity",
    "Your appearance",
    "Coaching philosophy",
    "Review & begin",
  ];
  const wizardHTML = () => {
    let body = "";
    if (wizardStep === 0)
      body = `<h2>Where does your story begin?</h2><p class="wizard-description">Choose from all 32 franchises. Your 2026 world starts with the real-player database.</p><div class="wizard-club-grid">${clubs.map((c, i) => `<button class="${wizard.team === i ? "selected" : ""}" onclick="Career.team(${i})" aria-label="Choose ${esc(c[1] + " " + c[2])}" aria-pressed="${wizard.team === i}">${logo(i)}<span>${c[2]}</span><small>${c[3]}</small></button>`).join("")}</div>`;
    if (wizardStep === 1)
      body = `<h2>The person behind the headset.</h2><p class="wizard-description">Give your coach an identity and choose the responsibilities you want to own.</p><div class="wizard-fields">${field("Coach name", "name", "text", 'maxlength="40"')}${field("Age", "age", "number", 'min="25" max="80"')}${field("Nationality", "nationality", "text", 'maxlength="40"')}${select("Career role", "role", ["HC", "Owner", "GM", "OC", "DC"])}</div><div class="wizard-note"><b>Your role matters</b><p>Head coaches run the whole football operation: tactics, training, the roster, contracts, scouting and the draft. Owners also control stadium projects and league votes. GMs run personnel and money without coaching; coordinators coach one unit.</p></div>`;
    if (wizardStep === 2)
      body = `<h2>A presence on the touchline.</h2><p class="wizard-description">Build a unified 3D coach. Drag the model to turn it and inspect your look.</p><div class="wizard-fields">${appearanceField("Outfit", "outfit", ["Polo", "Tracksuit", "Suit"])}${appearanceField("Build", "build", ["Lean", "Athletic", "Broad"])}${appearanceField("Hair style", "hairStyle", ["Short", "Curly", "Bald"])}${appearanceField("Facial hair", "beard", ["None", "Stubble", "Full"])}${["skin", "hair", "jacket"].map((k) => `<label>${nice(k)} color<input type="color" value="${wizard.appearance[k]}" onchange="Career.appearance('${k}',this.value)"></label>`).join("")}<label>Height · cm<input type="number" min="160" max="205" value="${wizard.appearance.height}" onchange="Career.appearance('height',Number(this.value))"></label><label class="wizard-check"><input type="checkbox" ${wizard.appearance.glasses ? "checked" : ""} onchange="Career.appearance('glasses',this.checked)"> Glasses</label><label class="wizard-check"><input type="checkbox" ${wizard.appearance.headset ? "checked" : ""} onchange="Career.appearance('headset',this.checked)"> Sideline headset</label></div>`;
    if (wizardStep === 3)
      body = `<h2>Your experience. Your approach.</h2><p class="wizard-description">Background sets a starting profile. Adjust your strengths within the shared attribute budget.</p><div class="wizard-fields">${select("Background", "background", Object.keys(BACKGROUNDS))}${select("Coaching experience", "experience", ["First appointment", "Coordinator", "Veteran head coach"])}${select("Offensive style", "style", ["Balanced", "Run-first", "Vertical offense"])}${select("Personality", "personality", ["Players coach", "Disciplinarian", "Tactician"])}</div><div class="attribute-budget"><b>Coach attributes</b><span id="coach-points-left"></span></div><div class="coach-attribute-fields">${COACH_ATTRIBUTES.map((k) => `<label>${nice(k)}<input aria-label="Coach ${k} attribute" type="number" min="1" max="20" value="${wizard.attributes[k]}" oninput="Career.attribute('${k}',Number(this.value))"></label>`).join("")}</div><p class="wizard-footnote">Development and medical coaching influence player growth and recovery. Motivation and discipline feed training quality. Tactical strengths shape your starting coaching skills.</p>`;
    if (wizardStep === 4)
      body = `<h2>Make it your career.</h2><p class="wizard-description">Your current careers remain in the library. This creates an independent football world.</p>${field("Career save name", "saveName", "text", 'maxlength="60"')}<div class="wizard-review">${logo(wizard.team)}<div><h3>${esc(wizard.name)}</h3><p>${esc(clubs[wizard.team][1] + " " + clubs[wizard.team][2])} · ${esc(wizard.role)}</p></div></div><div class="wizard-review-grid">${[
        ["Age / nationality", wizard.age + " · " + wizard.nationality],
        ["Background", wizard.background],
        ["Experience", wizard.experience],
        ["Playing style", wizard.style],
        ["Personality", wizard.personality],
        ["Starting world", "2026 · NFL roster snapshot"],
      ]
        .map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`)
        .join(
          "",
        )}</div><div class="wizard-note"><b>Your first day awaits</b><p>Meet the players, shape your development plans and prepare for opening day. Your head coach appearance carries into conversations.</p></div>`;
    return `<div class="coach-wizard"><aside class="wizard-rail"><span class="eyebrow">A NEW CAREER</span><h3>Build your<br>legacy.</h3><ol>${steps.map((s, i) => `<li class="${i === wizardStep ? "current" : i < wizardStep ? "done" : ""}"><span>${i < wizardStep ? "✓" : i + 1}</span>${s}</li>`).join("")}</ol><button class="link" onclick="Career.open()">← Career library</button></aside><div class="wizard-main"><header class="wizard-header"><span>COACH CREATION <i>·</i> STEP ${wizardStep + 1} OF 5</span></header><div class="wizard-content">${body}<p id="wizard-error" role="alert"></p></div><div class="wizard-navigation"><button class="secondary" onclick="Career.step(-1)">${wizardStep ? "← Back" : "Career library"}</button><button id="wizard-next" onclick="${wizardStep === 4 ? "Career.begin()" : "Career.step(1)"}">${wizardStep === 4 ? "Begin career →" : "Continue →"}</button></div></div><aside class="wizard-preview"><div class="preview-topline"><span>YOUR HEAD COACH</span><i>3D</i></div><div id="coach-avatar-host"></div><div class="preview-orbit"><button aria-label="Rotate coach left" onclick="CoachPreview.rotate(-.4)">↶</button><span>Drag to rotate</span><button aria-label="Rotate coach right" onclick="CoachPreview.rotate(.4)">↷</button></div><div class="preview-caption"><h3 id="coach-preview-name">${esc(wizard.name)}</h3><p>${esc(clubs[wizard.team][2])} · ${esc(wizard.role)}</p><span>${esc(wizard.background)}</span></div></aside></div>`;
  };
  const showWizard = () => {
    disposeAvatar();
    modal(wizardHTML());
    document
      .getElementById("modal")
      .classList.add("career-modal", "wizard-modal");
    mountAvatar();
    Career.budget();
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
        wizardStep = 0;
        showWizard();
      } catch (e) {
        toast(e.message);
      }
    },
    change(key, value) {
      if (!wizard) return;
      if (["team", "age"].includes(key)) value = Number(value);
      wizard[key] = value;
      if (key === "background") {
        wizard.attributes = { ...BACKGROUNDS[value] };
        showWizard();
      }
      const name = document.getElementById("coach-preview-name");
      if (name) name.textContent = wizard.name;
    },
    team(id) {
      wizard.team = id;
      showWizard();
    },
    appearance(key, value) {
      wizard.appearance[key] = value;
      mountAvatar();
    },
    attribute(key, value) {
      wizard.attributes[key] = value;
      Career.budget();
    },
    budget() {
      const el = document.getElementById("coach-points-left");
      if (!el) return;
      const remaining =
        COACH_BUDGET -
        COACH_ATTRIBUTES.reduce(
          (n, k) => n + Number(wizard.attributes[k] || 0),
          0,
        );
      el.textContent = remaining + " points remaining";
      el.classList.toggle("over-budget", remaining < 0);
      document.getElementById("wizard-next").disabled = remaining < 0;
    },
    step(delta) {
      if (wizardStep === 0 && delta < 0) {
        Career.open();
        return;
      }
      if (
        delta > 0 &&
        wizardStep === 1 &&
        (!wizard.name.trim() || wizard.age < 25 || wizard.age > 80)
      ) {
        document.getElementById("wizard-error").textContent =
          "Enter a coach name and an age from 25 to 80.";
        return;
      }
      wizardStep = Math.max(0, Math.min(4, wizardStep + delta));
      showWizard();
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
        toast(e.message);
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
  views["Careers & saves"] = () =>
    `<section class="stories-hero"><span class="eyebrow">YOUR COACHING LIBRARY</span><h2>One coach. One world. Every career is yours.</h2><p>Create separate coach profiles, load an existing career, or branch a season before a big decision.</p><div class="f-actions"><button onclick="Career.open()">Open career library</button><button class="secondary" onclick="Career.save()">Save this career</button><button class="secondary" onclick="Career.export()">Export backup</button></div></section>`;
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
