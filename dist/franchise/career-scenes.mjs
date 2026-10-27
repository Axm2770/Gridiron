import { progressionView } from "./progression-view.mjs";
import { CharacterStage, appearanceFor } from "./character-stage.mjs";
import * as S from "./state.mjs";
import { faceSVG, newgenIdentity } from "./newgens.mjs";
import {
  configureRatings,
  ensureCareerRatings,
  ensurePlayerRatings,
  baselineStatsFor,
} from "./ratings.mjs";
import {
  createConversation,
  conversationValid,
  sceneChoices,
  chooseResponse,
  reviewPromises,
} from "./conversations.mjs";
export const face = (p, cls = "") =>
  `<span class="career-face ${cls}">${faceSVG(p)}${/^https:\/\//.test(p.headshot || "") ? `<img src="${esc(p.headshot)}" alt="${esc(p.name)}" onerror="this.remove()" loading="lazy">` : ""}</span>`;
const statLabels = {
  passYards: "Passing yards",
  passTD: "Passing TD",
  attempts: "Pass attempts",
  completions: "Completions",
  interceptions: "Interceptions thrown",
  rushYards: "Rushing yards",
  rushAttempts: "Carries",
  rushTD: "Rushing TD",
  receptions: "Receptions",
  recYards: "Receiving yards",
  recTD: "Receiving TD",
  tackles: "Tackles",
  sacks: "Sacks",
  defInterceptions: "Defensive INT",
  games: "Games",
};
const fmt = (n) => Number(n).toLocaleString("en-US");
const statGrid = (stats) =>
  `<div class="legacy-stat-grid">${
    Object.entries(stats)
      .filter(([, v]) => typeof v === "number" && v !== 0)
      .map(
        ([k, v]) =>
          `<div><b>${fmt(v)}</b><span>${esc(statLabels[k] || k)}</span></div>`,
      )
      .join("") || '<p class="subtitle">No recorded statistics yet.</p>'
  }</div>`;
export function installCareerScenes({
  views,
  isBusy,
  ratings,
  stats,
  legends,
}) {
  let sceneStage = null;
  configureRatings(ratings, stats);
  ensureCareerRatings(state);
  state.franchise.cinema ??= { history: [], promises: [], active: null };
  const ensure = () => {
    state.franchise.cinema ??= { history: [], promises: [], active: null };
    if (!state.franchise.draft)
      while (state.prospects.length < 260) {
        const i = state.prospects.length;
        state.prospects.push(
          S.makePlayer(
            `future-${state.year}-${i}`,
            S.POS[i % S.POS.length],
            state.year * 967 + i,
            true,
          ),
        );
      }
    for (const p of [...state.roster, ...state.prospects, ...state.agents])
      if (!p.realPlayer && !p.face) {
        const n = newgenIdentity(p.id, 0, p.age < 24, p.pos);
        Object.assign(p, {
          face: n.face,
          generated: true,
          development: p.development || n.development,
          archetype: p.archetype || n.archetype,
          college: p.college || n.college,
        });
      }
    for (const p of state.prospects) ensurePlayerRatings(p);
    reviewPromises(state);
  };
  const actor = () =>
    state.roster.find(
      (p) => p.id === state.franchise.cinema?.active?.speakerId,
    ) || {
      id: "staff-coach",
      name: state.coach.name,
      face: newgenIdentity("coach-" + state.team, 0).face,
    };
  const coach = () => ({
    id: "coach-" + state.team,
    name: state.coach.name,
    face: {
      ...newgenIdentity("coach-" + state.team, 0).face,
      skin: state.franchise.career.avatar?.skin || "#b77b51",
    },
  });
  let hallFilter = "All",
    hallQuery = "";
  const records = () => [
    ...(legends || []),
    ...state.franchise.hall.map((p) => ({
      ...p,
      category: "Career",
      role: p.pos || "Player",
      classYear: p.year,
      team: p.team >= 0 ? clubs[p.team]?.[2] : "Career archive",
      headline: p.inducted ? "Enshrined in your career" : "Eligible " + p.year,
      bio: "A career built through seasons of dedication, leadership and performance.",
      stats: p.totals || { careerYards: p.careerYards },
      achievements: (p.awards || []).map((a) => `${a.year} ${a.award}`),
      headshot: p.headshot,
      source: null,
    })),
  ];
  const cards = () =>
    records()
      .filter(
        (p) =>
          (hallFilter === "All" || p.category === hallFilter) &&
          `${p.name} ${p.role} ${p.team}`
            .toLowerCase()
            .includes(hallQuery.toLowerCase()),
      )
      .map(
        (p) =>
          `<button class="legend-card" onclick="CI.legend('${p.id}')"><div class="legend-picture">${p.image ? `<img src="${p.image}" alt="${esc(p.name)}" loading="lazy">` : face(p)}<span>${p.category === "Career" ? (p.inducted ? "CAREER INDUCTEE" : "CAREER CANDIDATE") : "CLASS OF " + p.classYear}</span></div><div class="legend-card-body"><small>${esc(p.role)} · ${esc(p.team)}</small><h3>${esc(p.name)}</h3><p>${esc(p.headline)}</p><span>Explore legacy ↗</span></div></button>`,
      )
      .join("") ||
    '<div class="panel pad"><h3>No matching legends</h3><p>Try another name or filter. Career candidates appear after retirement and are inducted after five seasons.</p></div>';
  window.CI = {
    open(type = "player", id) {
      if (isBusy()) return;
      ensure();
      if (
        type === "staff" &&
        !["coach", "offense", "defense"].some((a) => S.allowed(state, a))
      ) {
        toast("Your role delegates tactical briefings to the coaching staff.");
        return;
      }
      if (!S.allowed(state, "media")) {
        toast("Your head coach handles these conversations.");
        return;
      }
      try {
        pauseAuto();
        window.broadcast?.stop();
        const active = state.franchise.cinema.active;
        if (
          !active ||
          !conversationValid(state, active) ||
          active.type !== type ||
          active.playerId !== (id || null)
        )
          state.franchise.cinema.active = createConversation(state, type, id);
        save();
        CI.scene();
      } catch (e) {
        toast(e.message);
      }
    },
    scene() {
      const c = state.franchise.cinema.active;
      if (!c || !conversationValid(state, c)) {
        toast("This conversation has expired.");
        return;
      }
      const p = actor(),
        press = c.setting === "press",
        group = ["locker", "film"].includes(c.setting);
      modal(
        `<div class="career-cutscene ${c.setting} shot-${c.step}" aria-label="${esc(c.title)}"><div class="scene-topline"><span>GRIDIRON STORIES <i>●</i> ${esc(c.type === "pre" ? "PREGAME" : c.type === "post" ? "POSTGAME" : c.type === "half" ? "HALFTIME" : "WEEK " + (state.week + 1))}</span><button class="icon-button" aria-label="Leave conversation" onclick="closeModal()">×</button></div><div class="cinema-stage scene-volume"><div class="scene-render-host" id="conversation-scene"></div><div class="scene-filmgrain"></div><div class="scene-location"><i>●</i> ${press ? "MEDIA THEATRE" : c.setting === "locker" ? "LOCKER ROOM" : c.setting === "film" ? "FILM ROOM" : "HEAD COACH’S OFFICE"}<small>${clubs[state.team][2]}</small></div></div><div class="scene-dialogue"><div class="scene-meta"><span>${c.step ? "02" : "01"} / 02</span><h2>${esc(c.title)}</h2></div>${c.step ? `<p class="scene-reaction">${esc(c.reaction)}</p><div class="your-line"><small>YOU</small>${esc(c.choicesMade[0].text)}</div>` : ""}<div class="scene-speaker-card">${face(press ? { id: "reporter-jordan", name: c.speaker } : p)}<div><span class="speaker-label">${esc(c.speaker)}</span><small class="speaker-caption">${press ? "Gridiron Network" : "Your " + (p.pos || "staff") + " · Private meeting"}</small></div></div><div class="spoken-line"><p>“${esc(c.lines[c.step])}”</p></div><div class="dialogue-choices" aria-label="Your response">${sceneChoices(
          c,
        )
          .map(
            (choice, i) =>
              `<button onclick="CI.choose(${i})"><kbd>${i + 1}</kbd><span>${esc(choice.text)}<small>${esc(choice.tone)}</small></span><i>↗</i></button>`,
          )
          .join("")}</div></div></div>`,
      );
      document.getElementById("modal").classList.add("cinema-modal");
      sceneStage?.dispose();
      sceneStage = new CharacterStage(
        document.getElementById("conversation-scene"),
        {
          scene: c.setting,
          shot: c.step,
          coach:
            state.franchise.userCoach?.appearance || appearanceFor(coach()),
          player: appearanceFor(p),
          extras: group
            ? state.roster
                .filter((q) => q.id !== p.id)
                .slice(0, 2)
                .map((q) => appearanceFor(q))
            : [],
        },
      );
    },
    choose(index) {
      if (isBusy()) return;
      try {
        let result;
        state = S.transact(state, (s) => {
          result = chooseResponse(s, index);
        });
        if (!result.complete) {
          save();
          CI.scene();
          return;
        }
        const c = result.scene;
        if (c.type === "pre" || c.type === "post")
          answerInterview(c.type, result.first);
        if (c.type === "half")
          resumeHalf(
            ["Encourage", "Demand more", "Stay composed"][result.first],
          );
        S.log(
          state,
          "Conversation: " + c.title,
          `${c.speaker}. ${c.choicesMade.map((x) => x.text).join(" ")}`,
          ["pre", "post"].includes(c.type) ? "media" : "private",
        );
        save();
        render();
        modal(
          `<div class="scene-result"><span class="eyebrow">CONVERSATION COMPLETE</span>${face(result.player || actor(), "result-face")}<h2>${esc(c.type === "staff" ? "The plan is set." : "Your words carry weight.")}</h2><p>${esc(c.type === "player" ? (result.delta > 0 ? "The player leaves feeling heard. Your next decisions will show whether the words hold up." : "The challenge did not land as intended. This player may respond better to reassurance.") : c.type === "staff" ? "Your coordinator has enabled the chosen tactical directive. You can review it in assistant delegation." : "Your message is recorded in the career conversation log.")}</p><div class="scene-outcomes"><span>${c.type === "pre" || c.type === "post" ? "Media response recorded" : c.type === "half" ? "Second half ready" : c.type === "staff" ? "Gameplan updated" : "Morale " + (result.delta >= 0 ? "+" : "") + result.delta}</span>${c.type === "player" && index === 2 ? "<span>Role review promised next week</span>" : ""}</div><div class="modal-actions"><button onclick="closeModal()">${c.type === "half" ? "Back to the touchline" : "Return to career"} →</button></div></div>`,
        );
      } catch (e) {
        toast(e.message);
      }
    },
    hallFilter(value) {
      hallFilter = value;
      render();
    },
    hallSearch(value) {
      hallQuery = value;
      document.getElementById("legends-grid").innerHTML = cards();
    },
    legend(id) {
      const p = records().find((p) => p.id === id);
      if (!p) return;
      modal(
        `<div class="legacy-profile"><button class="icon-button legacy-close" aria-label="Close legend profile" onclick="closeModal()">×</button><div class="legacy-profile-hero">${p.image ? `<img src="${p.image}" alt="${esc(p.name)}">` : face(p)}<div><span class="eyebrow">${p.category === "Career" ? "YOUR CAREER ARCHIVE" : "PRO FOOTBALL HALL OF FAME · CLASS OF " + p.classYear}</span><h2>${esc(p.name)}</h2><p>${esc(p.role)} · ${esc(p.team)}</p></div></div><div class="pad"><p class="legacy-biography">${esc(p.bio)}</p>${statGrid(p.stats)}<h3>Achievements & distinctions</h3><div class="achievement-list">${p.achievements.map((a) => `<span>✦ ${esc(a)}</span>`).join("") || "<p>Statistics retained in the career archive.</p>"}</div></div></div>`,
      );
    },
    rating(id, team = state.team) {
      const p =
        S.roster(state, team).find((p) => p.id === id) ||
        state.prospects.find((p) => p.id === id);
      if (!p) return;
      const r = ensurePlayerRatings(p),
        baselineStats = baselineStatsFor(p);
      modal(
        `<div class="rating-profile"><span class="eyebrow">PLAYER RATINGS</span><div class="rating-hero">${face(p)}<div><h2>${esc(p.name)}</h2><p>${esc(p.pos)} · ${p.generated ? "Draft graduate" : esc(p.sourceTeam || "NFL")}</p></div><b>${p.ovr}<small>CURRENT OVR</small></b></div><div class="development-status ${progressionView(p).direction}">${progressionView(p).status}</div><div class="development-directions">${progressionView(
          p,
        )
          .attributes.map(
            (a) =>
              `<span class="development-direction ${a.direction}">${esc(a.label)} ${a.arrow}</span>`,
          )
          .join("")}</div><div class="attribute-grid">${Object.entries(
          r.attributes,
        )
          .filter(([k]) => k !== "overall")
          .map(
            ([key, v]) =>
              `<div><span>${esc(key.replace(/([A-Z])/g, " $1"))}</span><b>${Math.max(1, Math.min(99, Math.round(v + (r.attributeChanges?.[key] || 0))))}</b><i><em style="width:${Math.max(1, Math.min(99, Math.round(v + (r.attributeChanges?.[key] || 0))))}%"></em></i></div>`,
          )
          .join(
            "",
          )}</div>${baselineStats ? `<h3>${r.baselineSeason} regular-season production</h3>${statGrid(baselineStats)}` : ""}<h3>${state.year} season</h3>${statGrid(p.stats?.[state.year] || {})}<div class="modal-actions"><button onclick="closeModal()">Done</button></div></div>`,
      );
    },
    prospect(id) {
      const p = state.prospects.find((p) => p.id === id);
      if (!p) return;
      modal(
        `<div class="rating-profile"><span class="eyebrow">DRAFT PROSPECT</span><div class="rating-hero">${face(p)}<div><h2>${esc(p.name)}</h2><p>${p.pos} · ${p.age} years · ${esc(p.college)}</p></div><b>${p.ovr}<small>OVR</small></b></div><div class="achievement-list"><span>${esc(p.archetype || "Development prospect")}</span><span>${esc(p.development || "Normal")} development</span><span>${p.pot} potential</span></div><p>Every prospect has a persistent identity and face. Development, production, coaching and age shape the player after he enters the league.</p><div class="modal-actions"><button class="secondary" onclick="CI.rating('${id}')">View attributes</button><button onclick="closeModal();W.open('Scouting')">Scout this class →</button></div></div>`,
      );
    },
  };
  views["Conversations"] = () => {
    ensure();
    const f = state.franchise,
      c = f.cinema,
      active = c.active && conversationValid(state, c.active);
    return `<section class="stories-hero"><span class="eyebrow">GRIDIRON STORIES</span><h2>The game behind the game.</h2><p>Trust is built in the room. Choose your words, set expectations, and live with the response.</p><div class="f-actions"><button onclick="CI.open('team')">Team meeting</button><button class="secondary" onclick="CI.open('staff')">Coordinator briefing</button>${active ? `<button class="secondary" onclick="CI.scene()">Resume conversation</button>` : ""}${state.interviewPending ? `<button class="secondary" onclick="postInterview()">Postgame interview</button>` : ""}</div></section><section class="panel pad"><h2>One-on-one conversations</h2><p class="subtitle">One meeting per player each week. Personalities change how a challenge is received.</p><div class="conversation-roster">${state.roster
      .slice()
      .sort((a, b) => a.morale - b.morale)
      .map(
        (p) =>
          `<button onclick="CI.open('player','${p.id}')">${face(p)}<span><b>${esc(p.name)}</b><small>${p.pos} · ${p.holdout ? "Holdout" : p.injury ? "Injury recovery" : p.starter ? "Starter" : "Reserve"}</small></span><em>${Math.round(p.morale)}%<small>MORALE</small></em></button>`,
      )
      .join(
        "",
      )}</div></section><section class="panel pad section-gap"><h2>Promises & recent conversations</h2>${c.promises.map((p) => `<div class="kv"><span>${esc(p.name)} · ${esc(p.type)}</span><b>${p.done ? esc(p.outcome) : p.dueNow ? "Review due now" : "Due week " + (p.due + 1)}</b></div>`).join("")}${
      c.history
        .slice(0, 12)
        .map(
          (h) =>
            `<details class="conversation-history"><summary>${esc(h.title)} <small>${h.year} · Week ${h.week + 1} · ${esc(h.speaker)}</small></summary>${h.choices.map((x) => `<p>“${esc(x.text)}”</p>`).join("")}</details>`,
        )
        .join("") ||
      '<p class="subtitle">Your first conversation will appear here.</p>'
    }</section>`;
  };
  views["Hall of Fame"] = () =>
    `<section class="hall-hero"><div><span class="eyebrow">THE LEGACY COLLECTION</span><h2>Greatness never leaves the game.</h2><p>Meet the players, coaches and founders who shaped football. Follow the careers that will join them in your world.</p><span class="hall-count">${(legends || []).length} HISTORICAL ICONS <i>·</i> ${state.franchise.hall.length} CAREER CANDIDATES</span></div><div class="hall-monument" aria-hidden="true">✦<small>HALL<br>OF FAME</small></div></section><div class="hall-toolbar"><div class="hall-filters">${["All", "Players", "Coaches", "Founders", "Career"].map((k) => `<button class="${hallFilter === k ? "selected" : ""}" onclick="CI.hallFilter('${k}')">${k}</button>`).join("")}</div><input type="search" aria-label="Search Hall of Fame" placeholder="Search a legend, team or role…" value="${esc(hallQuery)}" oninput="CI.hallSearch(this.value)"></div><div class="legends-grid" id="legends-grid">${cards()}</div><p class="data-note">A curated historical collection. Historical figures use documented Hall of Fame records. Career candidates use simulated statistics and a five-season eligibility wait.</p>`;
  views["Next generation"] = () => {
    ensure();
    const p = state.prospects,
      retired = state.franchise.retired || [];
    return `<section class="stories-hero newgen-hero"><span class="eyebrow">THE FUTURE IS ALREADY HERE</span><h2>Every legend starts somewhere.</h2><p>Fresh draft classes arrive every season. New identities, new faces, different ceilings. Build a franchise that lasts beyond today’s stars.</p><div class="f-actions"><button onclick="W.open('Scouting')">Open scouting</button><button class="secondary" onclick="W.open('Draft')">Draft room</button></div></section><div class="newgen-metrics"><div><b>${p.length}</b><span>Prospects this class</span></div><div><b>${state.roster.filter((p) => p.generated).length}</b><span>Newgens at your club</span></div><div><b>${retired.length}</b><span>League retirements archived</span></div></div><section class="panel pad"><h2>Faces of the next class</h2><p class="subtitle">Scout the class to build confidence, compare combine results and assess role fit.</p><div class="newgen-grid">${p
      .slice()
      .sort((a, b) => b.pot - a.pot)
      .slice(0, 24)
      .map(
        (p) =>
          `<button class="newgen-card" onclick="CI.prospect('${p.id}')">${face(p)}<span class="ovr-pill">${p.ovr}</span><h3>${esc(p.name)}</h3><p>${p.pos} · ${p.age} · ${esc(p.college || "College prospect")}</p><small>${esc(p.development || "Normal")} development · ${p.pot} POT</small></button>`,
      )
      .join(
        "",
      )}</div></section><section class="panel pad section-gap"><h2>Retirement ledger</h2>${
      retired
        .slice(-30)
        .reverse()
        .map(
          (p) =>
            `<div class="kv"><span>${esc(p.name)} · ${esc(p.pos)}</span><b>${p.retired} · ${p.legacy} legacy points</b></div>`,
        )
        .join("") ||
      '<p class="subtitle">Retired real and generated players remain in this archive with their career statistics.</p>'
    }</section>`;
  };
  F.meeting = (id) => CI.open("player", id);
  pregameInterview = () => CI.open("pre");
  postInterview = () => {
    if (state.interviewPending) CI.open("post");
  };
  halftimeTalk = () => {
    if (state.live?.halftime) CI.open("half");
  };
  const oldPlayer = W.player;
  W.player = function (id, team = state.team) {
    oldPlayer(id, team);
    const p = S.roster(state, team).find((p) => p.id === id);
    if (!p) return;
    const body = document.querySelector("#modal .profile-body");
    body?.insertAdjacentHTML(
      "afterbegin",
      `<button class="secondary rating-details-button" onclick="CI.rating('${id}',${team})">Ratings, attributes & production ↗</button>`,
    );
  };
  const oldLocker = views["Locker room"];
  views["Locker room"] = () =>
    `<section class="panel pad conversation-entry"><div><span class="eyebrow">GRIDIRON STORIES</span><h2>Start a conversation.</h2><p>Meet your players face to face. Your words shape trust and morale.</p></div><button onclick="W.open('Conversations')">Open conversations →</button></section>` +
    oldLocker();
  const oldMedia = mediaScreen;
  mediaScreen = () =>
    `<section class="panel pad conversation-entry"><div><span class="eyebrow">BEHIND THE HEADLINES</span><h2>The room is listening.</h2><p>Interviews now unfold as cinematic conversations with response choices.</p></div><button onclick="W.open('Conversations')">Conversations →</button></section>` +
    oldMedia();
  const oldClose = closeModal;
  closeModal = function () {
    sceneStage?.dispose();
    sceneStage = null;
    document.getElementById("modal").classList.remove("cinema-modal");
    oldClose();
  };
  document
    .getElementById("modal")
    .addEventListener("close", () =>
      document.getElementById("modal").classList.remove("cinema-modal"),
    );
  document.addEventListener("keydown", (e) => {
    if (
      !e.repeat &&
      ["1", "2", "3"].includes(e.key) &&
      document.getElementById("modal").open &&
      document.querySelector("#modal .dialogue-choices") &&
      !["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)
    ) {
      e.preventDefault();
      CI.choose(Number(e.key) - 1);
    }
  });
  ensure();
  save();
  render();
}
