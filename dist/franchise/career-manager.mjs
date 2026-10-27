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
    archived = false,
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
      identity.innerHTML = `<button class="coach-identity-button" onclick="Career.profile()" aria-label="View your head coach profile"><span class="avatar">${esc(
        state.coach.name
          .split(" ")
          .slice(0, 2)
          .map((x) => x[0])
          .join(""),
      )}</span><span>${esc(state.coach.name)}<small>${esc(state.franchise.role)}</small></span></button>`;
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
  const showHome = async () => {
    disposeAvatar();
    const list = store ? await store.list() : [],
      rows = list.filter((m) => !!m.archived === archived);
    modal(
      `<div class="career-home"><div class="career-home-top"><span class="eyebrow">GRIDIRON DIRECTOR · CAREER LIBRARY</span>${currentId ? '<button class="icon-button" aria-label="Close career library" onclick="closeModal()">×</button>' : ""}</div><div class="career-home-hero"><div><h2>Your sideline.<br><em>Your story.</em></h2><p>A different coach. A different franchise. A new way to leave your mark.</p></div><div class="career-home-actions"><button onclick="Career.new()">＋ Create a new career</button><label class="secondary import-career-button">Import a career<input type="file" accept=".json" onchange="Career.importFile(this)"></label></div></div>${window.careerLoadError ? `<p class="career-error">The previous active career could not be opened: ${esc(window.careerLoadError)}. Other saved careers are available below.</p>` : ""}${!store ? `<p class="career-error">${esc(window.careerStorageError || "Career storage is unavailable.")} Enable site storage to keep separate careers. You can export the current browser career below.</p><button onclick="F.downloadSave()">Export current career</button>` : ""}<div class="career-list-heading"><h3>${archived ? "Archived careers" : "Your careers"} <small>${rows.length}</small></h3><button class="link" onclick="Career.archived()">${archived ? "Show active careers" : "Archived careers"}</button></div><div class="career-save-list">${rows.map((m) => `<article class="career-save-card ${m.id === currentId ? "current" : ""}"><div class="career-save-club">${logo(m.team)}</div><div class="career-save-title"><h3>${esc(m.name)}</h3><p>${esc(m.coach)} <span>·</span> ${esc(clubs[m.team]?.[2] || "Franchise")} <span>·</span> ${esc(m.role || "HC")}</p><small>${m.year} · ${m.phase === "season" ? "Week " + (m.week + 1) : nice(m.phase)} · ${esc(m.record)} <i>•</i> ${new Date(m.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></div><div class="career-save-actions">${archived ? `<button class="small" onclick="Career.archive('${m.id}',false)">Restore</button>` : `<button class="small" onclick="Career.load('${m.id}')">${m.id === currentId ? "Resume career" : "Load career"} →</button><button class="secondary small" onclick="Career.rename('${m.id}')" aria-label="Rename ${esc(m.name)}">Rename</button><button class="subtle small" onclick="Career.archive('${m.id}',true)" ${m.id === currentId ? 'disabled title="Load another career before archiving this one"' : ""}>Archive</button>`}</div></article>`).join("") || `<div class="career-empty"><span>◇</span><h3>${archived ? "No archived careers" : "The first chapter is yours."}</h3><p>${archived ? "Archived careers remain recoverable here." : "Create your head coach, choose a franchise, and build your football career."}</p></div>`}</div><div class="career-home-footer"><p>Each career keeps its own coach, league, match progress and autosave.</p>${currentId ? '<button class="secondary small" onclick="Career.branch()">Save as a separate career</button><button class="secondary small" onclick="Career.export()">Export active career</button>' : ""}</div></div>`,
    );
    document.getElementById("modal").classList.add("career-modal");
  };
  const mountAvatar = () => {
    disposeAvatar();
    const host = document.getElementById("coach-avatar-host");
    if (host) {
      avatar = new CharacterStage(host, { appearance: wizard.appearance });
      window.CoachPreview = { rotate: (d) => avatar?.rotate(d) };
    }
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
      body = `<h2>The person behind the headset.</h2><p class="wizard-description">Give your coach an identity and choose the responsibilities you want to own.</p><div class="wizard-fields">${field("Coach name", "name", "text", 'maxlength="40"')}${field("Age", "age", "number", 'min="25" max="80"')}${field("Nationality", "nationality", "text", 'maxlength="40"')}${select("Career role", "role", ["HC", "Owner", "GM", "OC", "DC"])}</div><div class="wizard-note"><b>Your role matters</b><p>Head coaches control training, tactics, personnel and the sideline. Owners and GMs add roster and financial responsibilities; coordinators focus on one unit.</p></div>`;
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
    archived() {
      archived = !archived;
      showHome();
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
        const file = {
            format: "GridironCareer",
            version: 2,
            name: currentMeta?.name || state.coach.name,
            state: JSON.parse(serializeCareer(state)),
          },
          url = URL.createObjectURL(
            new Blob([JSON.stringify(file)], { type: "application/json" }),
          ),
          a = document.createElement("a");
        a.href = url;
        a.download =
          (currentMeta?.name || "gridiron-career").replace(
            /[^a-z0-9_-]/gi,
            "-",
          ) + ".json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
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
      .classList.remove("career-modal", "wizard-modal");
  });
  try {
    if (store) {
      if (currentId) {
        currentMeta = await store.read("metadata", currentId);
        lastPayload = (await store.get(currentId))?.payload;
      } else if (window.__gridironHadLegacy) {
        currentId = careerId();
        currentMeta = saveMetadata(state, {
          id: currentId,
          name: (state.coach?.name || "Coach") + " — Existing career",
        });
        await store.put(currentId, serializeCareer(state), currentMeta, {
          active: true,
        });
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
