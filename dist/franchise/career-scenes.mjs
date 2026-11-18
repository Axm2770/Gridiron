import { progressionView } from "./progression-view.mjs";
import { CharacterStage, appearanceFor } from "./character-stage.mjs";
import * as S from "./state.mjs";
import { faceSVG, newgenIdentity } from "./newgens.mjs";
import { pixelFace } from "../ui/pixel-face.mjs";
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
import { pressChangeRows } from "./press-consequences.mjs";
import { conversationStageSVG, teamColors, teamLabel, coachLook, spriteLook } from "../presentation/pixel-art.mjs";
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
        toast("Tactical briefings are the coaching staff’s call in your role. Your career role was set when the career began; start a new career or accept a job offer to lead them.");
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
      const moment = c.type === "pre" ? "Pregame" : c.type === "post" ? "Postgame" : c.type === "half" ? "Halftime" : "Week " + (state.week + 1),
        place = press ? "Media theatre" : c.setting === "locker" ? "Locker room" : c.setting === "film" ? "Film room" : "Head coach’s office",
        speaker = press ? { id: "reporter-jordan", name: c.speaker } : p;
      // Press conferences: who the question is about and the context that changes the stakes.
      const topicPlayer = press && c.step === 1 && c.press?.topic?.playerId ? state.roster.find((q) => q.id === c.press.topic.playerId) : null,
        about = topicPlayer
          ? `<div class="scn-about">${pixelFace(topicPlayer, { size: 32, team: state.team })}<span><b>${esc(topicPlayer.name)}</b><small>${esc(topicPlayer.pos)} · morale ${Math.round(topicPlayer.morale ?? 75)}% · trust ${Math.round(topicPlayer.coachTrust ?? 60)}%</small></span></div>`
          : "",
        ctx = press ? c.press?.context : null,
        credibility = state.franchise.pressRoom?.credibility,
        contextChips = ctx
          ? `<span class="scn-context">${[
              ctx.result === "win" ? ["After a win", "good"] : ctx.result === "loss" ? ["After a loss", "bad"] : ctx.result === "tie" ? ["After a tie", ""] : ["Pregame", ""],
              ctx.losingStreak >= 2 ? [`${ctx.losingStreak}-game losing streak`, "bad"] : null,
              ctx.winningStreak >= 2 ? [`${ctx.winningStreak}-game winning streak`, "good"] : null,
              ctx.rivalry ? ["Rivalry", "warn"] : null,
              Number.isFinite(credibility) && credibility !== 60 ? [`Credibility ${Math.round(credibility)}`, credibility >= 60 ? "good" : credibility < 45 ? "bad" : "warn"] : null,
            ]
              .filter(Boolean)
              .map(([t, tone]) => `<span class="gd-chip${tone ? " gd-" + tone : ""}">${esc(t)}</span>`)
              .join("")}</span>`
          : "";
      modal(
        `<div class="career-cutscene scn-dialog ${c.setting} shot-${c.step}" aria-label="${esc(c.title)}"><div class="scn-head"><div class="scn-head-copy"><span class="scn-label">Gridiron stories · ${esc(moment)}</span><h2>${esc(c.title)}</h2></div><span class="scn-step" aria-label="Part ${c.step + 1} of 2"><i class="${c.step >= 0 ? "on" : ""}"></i><i class="${c.step >= 1 ? "on" : ""}"></i></span><button class="icon-button scn-close" aria-label="Leave conversation" onclick="closeModal()">×</button></div><div class="cinema-stage scene-volume scn-stage"><div class="scene-render-host" id="conversation-scene"></div><div class="scn-location"><b>${esc(place)}</b><small>${esc(clubs[state.team][2])}</small></div></div><div class="scene-dialogue scn-talk">${c.step ? `<div class="scn-recap"><span class="scn-cap">You said</span><p>“${esc(c.choicesMade[0].text)}”</p><em>${esc(c.reaction)}</em></div>` : ""}<div class="scn-speech">${pixelFace(speaker, { size: 56, team: press ? null : state.team, cls: "scn-face" })}<div class="scn-bubble"><div class="scn-speaker"><b>${esc(c.speaker)}</b><small>${press ? "Gridiron Network" : "Your " + esc(p.pos || "staff") + " · Private meeting"}</small></div><p class="scn-line">“${esc(c.lines[c.step])}”</p>${about}</div></div><div class="scn-opts-head"><span class="scn-cap">Your response</span>${contextChips}<small>Press 1–${sceneChoices(c).length} or pick a card</small></div><div class="dialogue-choices scn-opts" aria-label="Your response">${sceneChoices(c)
          .map((choice, i) => `<button class="scn-opt" onclick="CI.choose(${i})"><span class="scn-opt-head"><kbd>${i + 1}</kbd><i>${esc(choice.tone)}</i></span><span class="scn-opt-text">${esc(choice.text)}</span></button>`)
          .join("")}</div></div></div>`,
      );
      document.getElementById("modal").classList.add("cinema-modal");
      sceneStage?.dispose();
      sceneStage = null;
      // Pixel theme: the stage is pixel art (same sprites as the story cutscenes), not 3D.
      if (document.body.classList.contains("gd-pixel")) {
        const host = document.getElementById("conversation-scene"),
          others = group ? state.roster.filter((q) => q.id !== p.id).slice(0, 2) : [];
        host.classList.add("px-conv-host");
        host.innerHTML = conversationStageSVG({
          setting: c.setting,
          shot: c.step,
          team: state.team,
          colors: teamColors(state.team),
          abbr: teamLabel(state.team).abbr,
          coachLook: coachLook(state, state.team),
          look: c.type === "staff" ? spriteLook(null, c.speaker) : spriteLook(p.face, p.id),
          number: p.jersey ?? "",
          playerId: p.id,
          staff: c.type === "staff",
          extras: others.map((q) => ({ look: spriteLook(q.face, q.id), number: q.jersey ?? "" })),
        });
        return;
      }
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
        const pending = state.franchise.cinema.active,
          met = pending?.playerId ? state.roster.find((p) => p.id === pending.playerId) : null,
          before = { morale: state.morale, pm: met?.morale, pt: met?.coachTrust ?? 60 };
        state = S.transact(state, (s) => {
          result = chooseResponse(s, index);
        });
        if (!result.complete) {
          save();
          CI.scene();
          return;
        }
        const c = result.scene,
          press = result.press;
        // Press conferences close the interview slot inside chooseResponse (closeInterview).
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
        sceneStage?.dispose();
        sceneStage = null;
        CI.outcome(c, result, before);
      } catch (e) {
        toast(e.message);
      }
    },
    // Outcome card: what the answers changed, as signed chips with block meters.
    outcome(c, result, before = {}) {
      const press = result.press,
        named = press?.playerId ? state.roster.find((p) => p.id === press.playerId) : null,
        who = named || result.player || actor();
      let rows = [];
      if (press) rows = pressChangeRows(press);
      else if (c.type === "player" && result.player) {
        const p = state.roster.find((x) => x.id === result.player.id) || result.player;
        rows = [
          [`${p.name}: morale`, Math.round((p.morale ?? 0) - (before.pm ?? p.morale)), true],
          [`${p.name}: trust`, Math.round((p.coachTrust ?? 60) - (before.pt ?? 60)), true],
          ["Team morale", Math.round((state.morale ?? 0) - (before.morale ?? state.morale)), true],
        ];
      } else if (c.type === "team" || c.type === "half")
        rows = [["Team morale", Math.round((state.morale ?? 0) - (before.morale ?? state.morale)), true]];
      const fx = rows
        .map(([label, v, up]) => {
          const tone = !v ? "" : v > 0 === up ? "good" : "bad",
            blocks = Math.min(5, Math.ceil(Math.abs(v) / 2));
          return `<li class="scn-fx-row ${tone}"><span class="scn-fx-label">${esc(label)}</span><span class="scn-fx-bar" aria-hidden="true">${Array.from({ length: 5 }, (_, i) => `<i class="${i < blocks ? "on" : ""}"></i>`).join("")}</span><b class="gd-chip${tone ? " gd-" + tone : ""}">${v > 0 ? "+" : ""}${v || 0}</b></li>`;
        })
        .join("");
      const chips = [];
      if (c.type === "staff") chips.push(["Gameplan updated", "good"]);
      if (c.type === "half") chips.push(["Second half ready", "good"]);
      if (c.type === "player" && result.record?.choices?.[1]?.index === 2) chips.push(["Role review promised next week", "warn"]);
      if (press?.follow?.id === "promise") chips.push([`Promise: start ${press.playerName} by week ${press.week + 2}`, "warn"]);
      if (press?.events?.some((e) => e.kind === "callout")) chips.push(["Relationship rift", "bad"]);
      if (press?.tone === "confident") chips.push([c.type === "pre" ? "Bold claim: opponent motivated" : "Bold claim on record", "warn"]);
      for (const n of press?.notes || []) chips.push([n, /hit|less forgiving|heard it/i.test(n) ? "bad" : /backed up/i.test(n) ? "good" : "warn"]);
      const copy = press
        ? press.reaction || (press.changes.morale > 0 ? "The room liked what it heard. Expect the quotes in tomorrow's papers." : "Your words are on the record now. The room and the fans will remember them.")
        : c.type === "player"
          ? result.delta > 0
            ? "The player leaves feeling heard. Your next decisions will show whether the words hold up."
            : "The challenge did not land as intended. This player may respond better to reassurance."
          : c.type === "staff"
            ? "Your coordinator has enabled the chosen tactical directive. You can review it in assistant delegation."
            : "Your message is recorded in the career conversation log.";
      modal(
        `<div class="scene-result scn-dialog scn-result"><div class="scn-head"><div class="scn-head-copy"><span class="scn-label">${press ? "Press conference · what changed" : "Conversation complete"}</span><h2>${esc(c.type === "staff" ? "The plan is set." : "Your words carry weight.")}</h2></div><button class="icon-button scn-close" aria-label="Close" onclick="closeModal()">×</button></div><div class="scn-result-body">${pixelFace(who, { size: 88, team: state.team, cls: "scn-face" })}<div class="scn-result-copy">${press ? `<p class="scn-quote">“${esc(press.quote)}”${press.follow ? `<br>“${esc(press.follow.text)}”` : ""}</p>` : ""}<p>${esc(copy)}</p>${fx ? `<ul class="scn-fx">${fx}</ul>` : ""}${chips.length ? `<div class="scene-outcomes scn-outcomes">${chips.map(([t, tone]) => `<span class="gd-chip gd-${tone}">${esc(t)}</span>`).join("")}</div>` : ""}</div></div><div class="modal-actions scn-actions">${press?.playerId ? `<button class="secondary" onclick="closeModal();W.open('Locker room')">Locker room</button>` : ""}<button onclick="closeModal()">${c.type === "half" ? "Back to the touchline" : "Return to career"} →</button></div></div>`,
      );
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
    return `<section class="gd-actionbar"><div class="f-actions"><button onclick="CI.open('team')">Team meeting</button><button class="secondary" onclick="CI.open('staff')">Coordinator briefing</button>${active ? `<button class="secondary" onclick="CI.scene()">Resume conversation</button>` : ""}${state.interviewPending ? `<button class="secondary" onclick="postInterview()">Postgame interview</button>` : ""}</div></section><section class="panel pad"><h2>One-on-one conversations</h2><p class="subtitle">One meeting per player each week. Personalities change how a challenge is received.</p><div class="conversation-roster">${state.roster
      .slice()
      .sort((a, b) => a.morale - b.morale)
      .map(
        (p) =>
          `<button onclick="CI.open('player','${p.id}')">${pixelFace(p, { size: 44, team: state.team })}<span><b>${esc(p.name)}</b><small>${p.pos} · ${p.holdout ? "Holdout" : p.injury ? "Injury recovery" : p.starter ? "Starter" : "Reserve"}</small></span><em>${Math.round(p.morale)}%<small>MORALE</small></em></button>`,
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
    `<section class="gd-actionbar"><div class="f-actions"><button onclick="W.open('Conversations')">Conversations →</button></div></section>` +
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
    .addEventListener("close", () => {
      // A conversation opened right after closing another dialog keeps its frame.
      const m = document.getElementById("modal");
      if (!m.open) m.classList.remove("cinema-modal");
    });
  document.addEventListener("keydown", (e) => {
    if (
      !e.repeat &&
      ["1", "2", "3", "4"].includes(e.key) &&
      document.querySelectorAll("#modal .scn-opt").length >= Number(e.key) &&
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
