import {settleCalendarRound,enterOffseasonCalendar,enterSeasonCalendar} from './calendar-core.mjs';
import {
  capturePreseason,
  advanceCareerTime,
  processCoachRound,
  generateJobOffers,
} from "./career-systems.mjs";
import { recordRound } from "./records.mjs";
import { freezeAwards } from "./awards.mjs";
import {
  processRumors,
  processComparisons,
  applyCommitteeRules,
} from "./world-events.mjs";
import { runStaffCarousel } from "./staff.mjs";
import { assertCanAdvance } from "./compliance.mjs";
import { processNewsRound } from "./newsroom.mjs";
import { processDevelopment, offseasonDevelopment } from "./development.mjs";
import { reviewPromises } from "./conversations.mjs";
import { retirementAge, retireRecord } from "./newgens.mjs";
import { ensureCareerRatings } from "./ratings.mjs";
import {
  roster,
  capLedger,
  capHit,
  log,
  MILLION,
  makePlayer,
  POS,
  basicContract,
  bonusCharge,
} from "./state.mjs";
import { weekly, marketDay } from "./world.mjs";
import { seasonAwards } from "./history.mjs";
export function newSchedule(games = 17) {
  let ring = Array.from({ length: 32 }, (_, i) => i),
    weeks = [];
  for (let w = 0; w < games; w++) {
    let pairs = [];
    for (let i = 0; i < 16; i++)
      pairs.push({ a: ring[i], b: ring[31 - i], score: null });
    weeks.push(pairs);
    ring.splice(1, 0, ring.pop());
  }
  let middle = weeks[8];
  weeks.splice(8, 1, middle.slice(0, 8), middle.slice(8));
  return weeks;
}
const ranked = (s, ids) =>
  ids
    .slice()
    .sort(
      (a, b) =>
        s.teams[b].w - s.teams[a].w ||
        s.teams[b].pf - s.teams[b].pa - (s.teams[a].pf - s.teams[a].pa),
    );
export function finishRound(s, results) {
  assertCanAdvance(s);
  const newsRoundKey = `${s.year}:${s.phase}:${s.week}:${s.franchise.postseason?.round || 0}`;
  capturePreseason(s, true);
  const roundInfo = {
    key: newsRoundKey,
    phase: s.phase,
    week: s.week,
    round: s.franchise.postseason?.round || 0,
  };
  let f = s.franchise,
    games =
      s.phase === "season" ? s.schedule[s.week] : s.playoffs.rounds.at(-1);
  for (let g of games) {
    if (g.score) continue;
    let result = results.find((r) => r.a === g.a && r.b === g.b);
    if (!result) throw Error("Missing game result.");
    g.score = result.score;
    if (s.phase === "season")
      for (let [k, t] of [g.a, g.b].entries()) {
        let team = s.teams[t];
        team.pf += g.score[k];
        team.pa += g.score[1 - k];
        team[g.score[k] > g.score[1 - k] ? "w" : "l"]++;
      }
  }
  processDevelopment(s, results);
  recordRound(s, results, roundInfo);
  processCoachRound(s, results, roundInfo);
  settleCalendarRound(s,roundInfo);
  if (s.phase === "season") {
    s.week++;
    weekly(s);
    for (let p of s.roster) p.injury = Math.max(0, p.injury - 1);
    if (s.week >= s.schedule.length) {
      let seeds = (conf) => {
        let ids = Array.from({ length: 16 }, (_, i) => i + conf * 16),
          winners = Array.from(
            { length: 4 },
            (_, i) => ranked(s, ids.slice(i * 4, i * 4 + 4))[0],
          );
        return [
          ...ranked(s, winners),
          ...ranked(
            s,
            ids.filter((t) => !winners.includes(t)),
          ).slice(0, 3),
        ];
      };
      let afc = seeds(0),
        nfc = seeds(1);
      f.postseason = { seeds: [afc, nfc], round: 0 };
      s.playoffs = {
        rounds: [
          [afc, nfc].flatMap((c) => [
            { a: c[1], b: c[6], score: null },
            { a: c[2], b: c[5], score: null },
            { a: c[3], b: c[4], score: null },
          ]),
        ],
      };
      freezeAwards(s);
      s.phase = "playoffs";
      log(
        s,
        "The postseason begins",
        "Seven teams per conference qualify; the top seed receives a bye.",
      );
    }
  } else {
    let post = f.postseason;
    if (!post) {
      post = f.postseason = {
        seeds: [
          Array.from({ length: 16 }, (_, i) => i),
          Array.from({ length: 16 }, (_, i) => i + 16),
        ],
        round: s.playoffs.rounds.length - 1,
        legacy: true,
      };
    }
    let winners = games.map((g) => (g.score[0] > g.score[1] ? g.a : g.b));
    if (winners.length === 1) {
      s.phase = "offseason";
      enterOffseasonCalendar(s);
      s.history.push({
        year: s.year,
        champion: winners[0],
        record: s.teams[s.team].w + "–" + s.teams[s.team].l,
      });
      for (let contract of Object.values(f.contracts)) {
        let player = roster(s, contract.team).find(
            (p) => p.id === contract.playerId,
          ),
          stats = player?.stats?.[s.year];
        for (let incentive of contract.incentives || [])
          if (incentive.year === s.year) {
            incentive.earned =
              (stats?.passTD || 0) +
                (stats?.rushTD || 0) +
                (stats?.recTD || 0) >=
              5;
            let adjustment =
              incentive.type === "NLTBE" && incentive.earned
                ? incentive.amount
                : incentive.type === "LTBE" && !incentive.earned
                  ? -incentive.amount
                  : 0;
            if (adjustment)
              (f.capAdjustments ??= []).push({
                team: contract.team,
                year: s.year + 1,
                amount: adjustment,
                reason: "Incentive reconciliation",
              });
          }
      }
      for (let t = 0; t < 32; t++)
        if (f.rules.rollover)
          f.rollover[t] = {
            year: s.year + 1,
            amount: Math.max(0, capLedger(s, t, s.year).room),
          };
      f.calendar = { day: 0, stage: "League meeting", leagueYear: s.year + 1 };
      f.market = {
        day: 0,
        phase: "Tampering",
        offers: [],
        losses: f.market.losses,
        gains: f.market.gains,
      };
      seasonAwards(s);
      log(
        s,
        "Championship decided",
        `Team ${winners[0] + 1} wins the championship. The offseason is open.`,
      );
    } else {
      let rounds = [];
      for (let conf = 0; conf < 2; conf++) {
        let remaining = winners.filter((t) => (t < 16 ? 0 : 1) === conf);
        if (post.round === 0 && !post.legacy)
          remaining.push(post.seeds[conf][0]);
        remaining.sort(
          (a, b) => post.seeds[conf].indexOf(a) - post.seeds[conf].indexOf(b),
        );
        for (let i = 0; i < Math.floor(remaining.length / 2); i++)
          rounds.push({
            a: remaining[i],
            b: remaining[remaining.length - 1 - i],
            score: null,
          });
      }
      if (!rounds.length && winners.length === 2)
        rounds = [{ a: winners[0], b: winners[1], score: null }];
      s.playoffs.rounds.push(rounds);
      post.round++;
    }
  }
  reviewPromises(s);
  processNewsRound(s, results, newsRoundKey);
  ensureCareerRatings(s);
  f.career.xp += 25;
  processRumors(s, newsRoundKey);
  processComparisons(s);
  generateJobOffers(s);
}
export function rollSeason(s) {
  assertCanAdvance(s, { camp: true });
  if (s.phase !== "offseason")
    throw Error("Training camp opens after the championship.");
  let f = s.franchise,
    year = s.year + 1,
    existingAgentIds = new Set(s.agents.map((p) => p.id));
  for (let team = 0; team < 32; team++) {
    if (f.rules.rollover && f.rollover[team]?.year !== year)
      f.rollover[team] = {
        year,
        amount: Math.max(0, capLedger(s, team, s.year).room),
      };
    let expired = [];
    for (let p of roster(s, team)) {
      let c = f.contracts[p.id];
      p.age++;
      p.experience = (p.experience ?? Math.max(0, p.age - 23)) + 1;
      p.injury = 0;
      if (p.status === "ir") {
        p.status = "active";
        p.irReturnWeek = 0;
      }
      p.fitness = 100;
      p.holdout = false;
      p.elevations = 0;
      offseasonDevelopment(
        p,
        s.year,
        team === s.team ? f.career.skills.development : 0,
      );
      if (p.age >= retirementAge(p)) {
        expired.push(p);
        if (c && !c.ended) {
          c.ended = true;
          let amount =
            Math.max(0, c.start + c.prorate - year) *
            Math.round(c.bonus / c.prorate);
          if (amount)
            f.dead.push({
              team,
              year,
              amount,
              reason: "Retirement acceleration",
              playerId: p.id,
            });
        }
        retireRecord(s, p, team, year);
        continue;
      }
      if (c && !c.ended && year >= c.start + c.years) {
        expired.push(p);
        c.ended = true;
        let dead =
          Math.max(0, c.start + c.prorate - year) *
          Math.round(c.bonus / c.prorate);
        if (dead)
          f.dead.push({
            team,
            year,
            amount: dead,
            reason: "Void-year acceleration",
            playerId: p.id,
          });
        p.status = "free";
        p.starter = false;
        s.agents.push(p);
        f.market.losses.push({ team, player: p.id, value: p.salary });
      }
    }
    if (team === s.team)
      s.roster = s.roster.filter((p) => !expired.includes(p));
    else
      f.clubs[team].players = f.clubs[team].players.filter(
        (p) => !expired.includes(p),
      );
    let loss = f.market.losses.filter((x) => x.team === team).length,
      gain = f.market.gains.filter((x) => x.team === team).length;
    for (
      let i = 0;
      i < Math.min(f.rules.compMax, Math.max(0, loss - gain));
      i++
    )
      (f.futurePicks ??= []).push({
        team,
        year: year + 1,
        round: Math.min(7, 3 + i),
        source: "Free-agent compensation",
      });
  }
  s.agents = s.agents.filter((p) => {
    if (existingAgentIds.has(p.id)) {
      p.age++;
      p.experience = (p.experience ?? Math.max(0, p.age - 23)) + 1;
    }
    if (p.age >= retirementAge(p)) {
      retireRecord(s, p, -1, year);
      return false;
    }
    if (existingAgentIds.has(p.id)) offseasonDevelopment(p, s.year, 0);
    return true;
  });
  runStaffCarousel(s);
  for (let h of f.hall)
    if (h.year <= year && !h.inducted) {
      h.inducted = true;
      log(s, "Hall of Fame induction", h.name + " joins the Hall of Fame.");
    }
  for (let team = 0; team < 32; team++)
    if (team !== s.team) {
      let list = roster(s, team);
      for (let pos of new Set(POS))
        if (!list.some((p) => p.pos === pos && !p.injury)) {
          let p = makePlayer(
            `replacement-${year}-${team}-${pos}`,
            pos,
            year * 137 + team * 79 + POS.indexOf(pos),
          );
          list.push(p);
          f.contracts[p.id] = basicContract(p, team, year);
        }
      while (list.filter((p) => p.status === "active").length < 53) {
        let i = list.length,
          p = makePlayer(
            `replacement-${year}-${team}-${i}`,
            POS[i % 22],
            year * 719 + team * 61 + i,
          );
        list.push(p);
        f.contracts[p.id] = basicContract(p, team, year);
      }
      if (list.filter((p) => p.status === "active").length > 53) {
        let keep = new Set();
        for (let pos of new Set(POS)) {
          let best = list
            .filter((p) => p.pos === pos)
            .sort((a, b) => b.ovr - a.ovr)[0];
          if (best) keep.add(best.id);
        }
        for (let p of list.slice().sort((a, b) => b.ovr - a.ovr))
          if (keep.size < 53) keep.add(p.id);
        for (let p of list) p.status = keep.has(p.id) ? "active" : "practice";
        let practice = list
          .filter((p) => p.status === "practice")
          .sort((a, b) => b.ovr - a.ovr);
        for (let p of practice.slice(16)) {
          let c = f.contracts[p.id];
          c.ended = true;
          f.dead.push({
            team,
            year,
            amount:
              Math.max(0, c.start + c.prorate - year) *
              Math.round(c.bonus / c.prorate),
            reason: "CPU camp release",
            playerId: p.id,
          });
          p.status = "free";
          s.agents.push(p);
          f.clubs[team].players = f.clubs[team].players.filter(
            (q) => q.id !== p.id,
          );
        }
      }
    }
  applyCommitteeRules(s);

  s.year = year;
  enterSeasonCalendar(s);
  s.week = 0;
  s.teams.forEach((t) => Object.assign(t, { w: 0, l: 0, pf: 0, pa: 0 }));
  s.schedule = newSchedule(f.rules.regularGames);
  s.phase = "season";
  s.playoffs = null;
  s.live = null;
  s.interviewPending = null;
  s.drafted = 0;
  s.prospects = Array.from({ length: 260 }, (_, i) =>
    makePlayer(`prospect-${year}-${i}`, POS[i % 22], year * 967 + i, true),
  );
  f.draft = null;
  f.reports = {};
  f.visits = [];
  f.board = [];
  f.scoutPoints = 10;
  f.calendar = { day: 100, stage: "Training camp", leagueYear: year };
  f.market = { day: 3, phase: "Open", offers: [], losses: [], gains: [] };
  f.tagYear = null;
  capturePreseason(s, false);
  log(
    s,
    "Training camp opens",
    `A new ${f.rules.regularGames}-game season begins. Trim active rosters to 53 before playing.`,
  );
  assertCanAdvance(s, { camp: true });
}
