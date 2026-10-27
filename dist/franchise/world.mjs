import {marketCalendarDate} from './calendar-core.mjs';
import {
  advanceCareerTime,
  dialogueFit,
  dialogueConsequences,
  fanReaction,
} from "./career-systems.mjs";
import { consumeBoardPermit } from "./boardroom.mjs";
import { voteCommittee, processRumors } from "./world-events.mjs";
import {
  roster,
  active,
  log,
  requireRole,
  MILLION,
  capLedger,
  makePlayer,
  POS,
  basicContract,
  financeYear,
} from "./state.mjs";
import { hireStaff } from "./staff.mjs";
import { assertCanAdvance } from "./compliance.mjs";
import { random, clamp } from "../engine/random.mjs";
import { offerScore, proposal } from "./contracts.mjs";
export function marketDay(s, {calendarManaged=false}={}) {
  assertCanAdvance(s);
  let f = s.franchise;
  f.market.day++;
  f.calendar.day++;
  if(!calendarManaged)marketCalendarDate(s);
  processRumors(s, `market:${s.year}:${f.market.day}`);
  if (f.market.day >= 3) f.market.phase = "Open";
  if (f.market.day === 3 && s.phase === "offseason") {
    for (let team = 0; team < 32; team++) {
      for (let p of roster(s, team).slice()) {
        let c = f.contracts[p.id];
        if (c && !c.ended && c.start + c.years <= financeYear(s)) {
          c.ended = true;
          let amount =
            Math.max(0, c.start + c.prorate - financeYear(s)) *
            Math.round(c.bonus / c.prorate);
          if (amount)
            f.dead.push({
              team,
              year: financeYear(s),
              amount,
              reason: "Void-year acceleration",
              playerId: p.id,
            });
          if (team === s.team) s.roster = s.roster.filter((x) => x.id !== p.id);
          else
            f.clubs[team].players = f.clubs[team].players.filter(
              (x) => x.id !== p.id,
            );
          p.status = "free";
          p.starter = false;
          s.agents.push(p);
          f.market.losses.push({ team, player: p.id, value: p.salary });
        }
      }
    }
  }
  let rng = random(s.year * 1009 + f.market.day * 31);
  for (let p of s.agents
    .slice()
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 12)) {
    let existing = f.market.offers.filter((o) => o.playerId === p.id);
    for (let j = 0; j < 3; j++) {
      let team = Math.floor(rng() * 32);
      if (team === s.team || existing.some((o) => o.team === team)) continue;
      let c = proposal(s, p, {
        annual: Math.max(0.8, p.salary * (0.9 + rng() * 0.5)),
        years: 2 + Math.floor(rng() * 3),
        bonus: p.salary * 0.5,
        guaranteed: p.salary * 0.8,
      });
      c.team = team;
      if (capLedger(s, team).room >= c.base[0] + c.bonus / c.prorate)
        f.market.offers.push({
          id: `cpu-${p.id}-${team}`,
          playerId: p.id,
          team,
          contract: c,
          close: f.market.day + 1,
        });
    }
  }
  if (f.market.phase === "Open") {
    let closing = new Set(
      f.market.offers
        .filter((o) => o.close <= f.market.day)
        .map((o) => o.playerId),
    );
    for (let id of closing) {
      let p = s.agents.find((p) => p.id === id);
      if (!p) continue;
      let offers = f.market.offers
        .filter((o) => o.playerId === id)
        .sort((a, b) => offerScore(s, p, b) - offerScore(s, p, a));
      let winning = offers.find(
        (o) =>
          capLedger(s, o.team).room >=
            o.contract.base[0] + o.contract.bonus / o.contract.prorate &&
          (roster(s, o.team).filter((p) => p.status === "active").length <
            (s.phase === "offseason" ? 90 : 53) ||
            (o.team !== s.team &&
              roster(s, o.team).some((q) => !q.starter && q.ovr < p.ovr))),
      );
      if (winning) {
        if (
          winning.team !== s.team &&
          roster(s, winning.team).filter((q) => q.status === "active").length >=
            (s.phase === "offseason" ? 90 : 53)
        ) {
          let released = roster(s, winning.team)
              .filter((q) => !q.starter)
              .sort((a, b) => a.ovr - b.ovr)[0],
            old = f.contracts[released.id];
          f.clubs[winning.team].players = f.clubs[winning.team].players.filter(
            (q) => q.id !== released.id,
          );
          old.ended = true;
          f.dead.push({
            team: winning.team,
            year: financeYear(s),
            amount:
              Math.max(0, old.start + old.prorate - financeYear(s)) *
              Math.round(old.bonus / old.prorate),
            reason: "CPU release",
            playerId: released.id,
          });
          released.status = "free";
          s.agents.push(released);
        }
        p.status = "active";
        p.stats ??= {};
        p.wear ??= { knee: 0, ankle: 0, shoulder: 0, back: 0 };
        p.fitness ??= 100;
        p.starter = false;
        p.salary = winning.contract.base[0] / MILLION;
        roster(s, winning.team).push(p);
        f.contracts[id] = winning.contract;
        s.agents = s.agents.filter((x) => x.id !== id);
        f.market.gains.push({
          team: winning.team,
          player: id,
          value: p.salary,
        });
        log(
          s,
          winning.team === s.team
            ? "Free agent signed"
            : "Free agency agreement",
          `${p.name} accepted team ${winning.team + 1}'s offer; $${(winning.contract.base[0] / MILLION).toFixed(1)}M annual base.`,
        );
      }
      f.market.offers = f.market.offers.filter((o) => o.playerId !== id);
    }
  }
  for (let w of f.waivers.filter((w) => w.day <= f.market.day)) {
    let order = w.claims.sort((a, b) => s.teams[a].w - s.teams[b].w),
      winner = order.find(
        (t) =>
          active(s, t).filter((p) => p.status === "active").length <
            (s.phase === "offseason" ? 90 : 53) &&
          capLedger(s, t).room > w.player.salary * MILLION,
      );
    if (winner !== undefined) {
      w.player.status = "active";
      roster(s, winner).push(w.player);
      f.contracts[w.player.id] = basicContract(
        w.player,
        winner,
        financeYear(s),
      );
      log(
        s,
        "Waiver awarded",
        `${w.player.name} claimed by team ${winner + 1}.`,
      );
    } else {
      w.player.status = "free";
      s.agents.push(w.player);
    }
    f.waivers = f.waivers.filter((x) => x !== w);
  }
  if(!calendarManaged)for (let c of f.clubs)
    for (let p of c.stadium.projects) {
      p.remaining--;
      if (p.remaining === 0) {
        c.stadium[p.area] = (c.stadium[p.area] || 0) + p.gain;
        log(s, "Facility project completed", p.name);
      }
    }
}
export function meeting(s, id, tone) {
  requireRole(s, "media");
  let p = s.roster.find((p) => p.id === id);
  if (!p) throw Error("Player unavailable.");
  p.meetingWeek ??= "";
  let key = s.year + ":" + s.week;
  if (p.meetingWeek === key)
    throw Error("Already met with this player this week.");
  p.meetingWeek = key;
  let delta = dialogueFit(p, tone, { injured: !!p.injury });
  dialogueConsequences(s, {
    person: p,
    tone,
    delta,
    key: `${key}:${id}:meeting`,
  });
  p.morale = clamp(p.morale + delta, 20, 99);
  s.morale = clamp(s.morale + Math.round(delta / 3), 35, 99);
  if (tone === "Support") {
    p.holdout = false;
    if (p.morale >= 55) p.tradeDemand = false;
  }
  log(
    s,
    "Player meeting",
    `${p.name}: ${tone}. Morale ${delta > 0 ? "+" : ""}${delta}.`,
  );
}
export function stadiumProject(s, area, funding) {
  requireRole(s, "stadium");
  let c = s.franchise.clubs[s.team],
    stadium = c.stadium,
    cost =
      area === "condition"
        ? 60 * MILLION
        : area === "capacity"
          ? 250 * MILLION
          : 35 * MILLION;
  if (stadium.projects.some((p) => p.remaining > 0))
    throw Error("Complete the current construction project first.");
  if (funding === "Public") {
    if (c.fanApproval < 55 || stadium.condition > 85)
      throw Error(
        "The council rejected public funding. Consider private financing.",
      );
    cost = Math.round(cost * 0.55);
    c.fanApproval -= 5;
  }
  if (c.cash < cost) throw Error("Not enough ownership cash.");
  const permit = consumeBoardPermit(s, "Stadium", { area, funding });
  if (permit.scope === "Compromise") cost = Math.round(cost * 0.8);
  c.cash -= cost;
  stadium.projects.push({
    name: `${area} upgrade`,
    area,
    gain:
      area === "condition"
        ? permit.scope === "Compromise"
          ? 16
          : 20
        : area === "capacity"
          ? permit.scope === "Compromise"
            ? 6400
            : 8000
          : 1,
    remaining: permit.scope === "Compromise" ? 5 : 3,
    cost,
    funding,
  });
  log(
    s,
    "Facility project approved",
    `Construction begins with ${funding.toLowerCase()} funding${permit.scope === "Compromise" ? " and a reduced scope / extended delivery period" : ""}.`,
  );
}
export function relocate(s, city, name) {
  requireRole(s, "stadium");
  if (s.phase !== "offseason")
    throw Error("Relocation applications are reviewed in the offseason.");
  let c = s.franchise.clubs[s.team];
  if (c.stadium.condition > 50 && c.fanApproval > 45)
    throw Error("The league sees no sufficient case for relocation.");
  if (!city?.trim() || !name?.trim())
    throw Error("Enter a city and team name.");
  if (c.cash < 400 * MILLION)
    throw Error("Relocation requires $400M in available cash.");
  const permit = consumeBoardPermit(s, "Relocation", { city, name });
  c.cash -= (permit.scope === "Compromise" ? 350 : 400) * MILLION;
  c.stadium.capacity = permit.scope === "Compromise" ? 55000 : 65000;
  c.stadium.city = city.trim().slice(0, 40);
  c.stadium.name = city.trim() + " Stadium";
  c.stadium.condition = 95;
  c.rebrand = {
    city: city.trim().slice(0, 40),
    name: name.trim().slice(0, 40),
  };
  c.fanApproval = 55;
  log(
    s,
    "Relocation approved",
    `${c.rebrand.name} will play in ${c.rebrand.city}. Division membership is retained pending a league realignment vote.`,
  );
}
export function vote(s, proposal, vote) {
  return voteCommittee(s, proposal, vote);
}
export function forceEvent(s, type) {
  let f = s.franchise,
    c = f.clubs[s.team],
    p = s.roster.slice().sort((a, b) => b.ovr - a.ovr)[0];
  if (["Holdout", "Trade demand"].includes(type) && !p)
    throw Error("No rostered player is available for this event.");
  if (type === "Holdout") {
    p.holdout = true;
    p.morale = 40;
    log(
      s,
      "Contract holdout",
      `${p.name} is unhappy with his contract and will miss preparation until addressed.`,
      "drama",
    );
  } else if (type === "Trade demand") {
    p.tradeDemand = true;
    p.morale -= 10;
    log(
      s,
      "Trade demand",
      `${p.name} requests a move. Meet with him or open trade talks.`,
      "drama",
    );
  } else if (type === "League investigation") {
    c.cash -= 5 * MILLION;
    (f.futurePicks ??= []).push({
      year: s.year + 2,
      team: s.team,
      round: 3,
      forfeited: true,
      source: "Sanction",
    });
    log(
      s,
      "League sanction",
      "A league tampering investigation resulted in a $5M fine and forfeiture of a future third-round pick.",
      "sanction",
    );
  } else if (type === "Ownership sale") {
    c.owner = {
      name: "New Investment Group",
      trait: ["Patient Rebuilder", "Meddler", "Win-Now", "Penny-Pincher"][
        (s.year + s.week) % 4
      ],
      age: 45,
      patience: 50,
    };
    c.cash += 150 * MILLION;
    log(
      s,
      "Ownership changes hands",
      `New ownership brings a ${c.owner.trait} approach.`,
      "ownership",
    );
  } else if (type === "Locker room leak") {
    c.fanApproval -= 5;
    s.morale = Math.max(35, s.morale - 5);
    log(
      s,
      "Locker room leak",
      "An internal disagreement reached the media. A team meeting may restore trust.",
      "drama",
    );
  }
}
export function weekly(s) {
  let f = s.franchise,
    rng = random(s.year * 701 + s.week * 101),
    intensity = f.preparation.intensity / 100,
    c = f.clubs[s.team];
  f.scoutPoints = Math.min(20, (f.scoutPoints || 0) + 5);
  f.preparation.familiarity = clamp(
    f.preparation.familiarity + Math.round(intensity * 5),
    0,
    100,
  );
  for (let p of s.roster) {
    if (p.status === "elevated") p.status = "practice";
    if (p.holdout) continue;
    for (let part of Object.keys(p.wear)) {
      p.wear[part] = clamp(
        p.wear[part] + intensity * 5 - (1 - intensity) * 7 - c.stadium.medical,
        0,
        100,
      );
    }
    p.fitness = clamp((p.fitness || 100) + 20 - intensity * 15, 45, 100);
    if (
      !p.injury &&
      rng() <
        intensity *
          0.025 *
          (p.progression?.load === "Intensive"
            ? 1.6
            : p.progression?.load === "Light"
              ? 0.5
              : 1) *
          (p.progression?.rehab ? 1.4 : 1)
    ) {
      p.injury = 2 + Math.floor(rng() * 3);
      p.medical = {
        bodyPart: ["knee", "ankle", "shoulder", "back"][Math.floor(rng() * 4)],
        diagnosis: "Practice strain",
        weeks: p.injury,
      };
    }
  }
  for (let p of s.roster.filter(
    (p) => p.status === "practice" && !p.protected && p.ovr >= 75,
  )) {
    if (rng() < 0.12) {
      let team = f.clubs.find(
        (t) =>
          t.id !== s.team &&
          t.players.filter((p) => p.status === "active").length <
            (s.phase === "offseason" ? 90 : 53) &&
          capLedger(s, t.id).room > p.salary * MILLION,
      );
      if (team) {
        let old = f.contracts[p.id];
        old.ended = true;
        let amount =
          Math.max(0, old.start + old.prorate - financeYear(s)) *
          Math.round(old.bonus / old.prorate);
        f.dead.push({
          team: s.team,
          year: financeYear(s),
          amount,
          reason: "Practice-squad poaching",
          playerId: p.id,
        });
        s.roster = s.roster.filter((q) => q.id !== p.id);
        p.status = "active";
        team.players.push(p);
        f.contracts[p.id] = basicContract(p, team.id, financeYear(s));
        log(
          s,
          "Practice-squad player signed away",
          p.name + " accepted an active-roster opportunity.",
        );
      }
    }
  }
  for (let p of s.roster) p.protected = false;
  let ticketDemand = clamp(
      1.15 - c.stadium.ticket / 300 + c.fanApproval / 250,
      0.3,
      1,
    ),
    revenue =
      c.stadium.capacity *
      ticketDemand *
      (c.stadium.ticket + c.stadium.concessions * 0.65) *
      100;
  c.cash += Math.round(revenue + c.stadium.luxury / 18) - 4 * MILLION;
  c.attendance = ticketDemand;
  c.stadium.condition = Math.max(1, c.stadium.condition - 0.3);
  if (rng() < 0.18)
    forceEvent(
      s,
      ["Holdout", "Trade demand", "Locker room leak"][Math.floor(rng() * 3)],
    );
  if (c.owner.age > 78 || c.cash < 0) forceEvent(s, "Ownership sale");
  for (let t of f.clubs) t.owner.age += 1 / 52;
  log(
    s,
    "Weekly review",
    `Preparation familiarity ${f.preparation.familiarity}%; attendance ${(ticketDemand * 100).toFixed(0)}%.`,
  );
}
export function hire(s, candidate) {
  if (!candidate) throw Error("Staff candidate unavailable.");
  return hireStaff(s, candidate.role, candidate.id);
}
export function buySkill(s, skill) {
  let c = s.franchise.career;
  if (!Object.hasOwn(c.skills, skill) || c.xp < 100)
    throw Error("A skill point costs 100 XP.");
  c.xp -= 100;
  c.skills[skill]++;
  log(
    s,
    "Career development",
    `${skill} skill improved to level ${c.skills[skill]}.`,
  );
}

export function careerInterview(s) {
  throw Error(
    "Open your career dossier to review invitations and complete an ownership interview.",
  );
}
