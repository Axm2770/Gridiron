// Dynamic social engine: persona archetypes, a contextual template grammar and a persisted
// sentiment model (fan score, drama, chemistry) that feeds back into morale and fan approval.
// Original career fiction. All accounts are generated characters, never real people.
import { random } from "../engine/random.mjs";
import { hash, fanReaction } from "./career-systems.mjs";
import { applyMood, ensureOffice } from "./newsroom.mjs";
import { emitGameEvent, eventSeed } from "./event-bus.mjs";

const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));
const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

/* ------------------------------------------------------------------ personas */

export const ARCHETYPES = {
  insider: { label: "National insider", reach: 2.1e6, bias: 0, volatility: 0.35, verified: true },
  beat: { label: "Beat writer", reach: 1.6e5, bias: 0.05, volatility: 0.55, verified: true },
  analyst: { label: "Analytics account", reach: 4.2e5, bias: 0, volatility: 0.3 },
  hottake: { label: "Hot-take host", reach: 1.4e6, bias: -0.15, volatility: 1.8, verified: true },
  team: { label: "Official team account", reach: 3e6, bias: 0.55, volatility: 0.4, verified: true },
  rival: { label: "Rival player", reach: 6e5, bias: -0.35, volatility: 1.1, verified: true },
  player: { label: "Player account", reach: 5e5, bias: 0.3, volatility: 0.7, verified: true },
  fan: { label: "Fan", reach: 4e3, bias: 0, volatility: 1 },
};

// Fan sub-voices give replies distinct temperaments instead of one polite chorus.
export const FAN_VOICES = {
  loyalist: { bias: 0.45, stance: "Ride or die" },
  doomer: { bias: -0.55, stance: "Seen this before" },
  statnerd: { bias: 0, stance: "Numbers guy" },
  oldtimer: { bias: -0.1, stance: "Season ticket since '98" },
  meme: { bias: 0, stance: "Shitposter" },
  capguy: { bias: -0.05, stance: "Cap sheet truther" },
};

const BEAT_NAMES = ["Dana Whitfield", "Luis Ortega", "Kendra Pike", "Sam Okafor", "Priya Natarajan", "Gus Lindqvist", "Renee Batiste", "Cole Ferraro"];
const FAN_HANDLES = {
  loyalist: ["{abbr}TilIDie", "Bleed{team}", "{team}Faithful_{n}", "Sec{n}Diehard"],
  doomer: ["Same{team}Again", "{abbr}Trauma{n}", "WaitTilNextYear{n}", "Pain_{team}"],
  statnerd: ["{abbr}Analytics", "SuccessRate{n}", "DVOAfter{team}", "ChartingThe{team}"],
  oldtimer: ["OldSchool{abbr}", "Since98_{team}", "Lot{n}Tailgate", "GrandpaWatches{abbr}"],
  meme: ["{team}Memes", "Ratio{abbr}", "Clip{team}Highlights", "{abbr}Brainrot"],
  capguy: ["{abbr}CapSheet", "DeadMoney{n}", "{team}Ledger", "VoidYears{n}"],
};

/* ---------------------------------------------------------------- templates */
// Grammar: {slot} fills a value, [a|b|c] picks one seeded variant, {?tag:text} includes text
// only when the context carries that tag, {!tag:text} only when it does not.
// Each template carries an id so the anti-repetition memory can rotate them.

const T = {
  insider: {
    result: {
      pos: [
        "The {team} [improve|move] to {record} after a {score} win over the {opp}. {?clutch:Decided on the final possession. }{?rivalry:Division implications are real. }[League sources|People around the league] [expect|believe] the {team} are [for real|a legitimate contender] if {star} stays healthy.",
        "{team} {score} {opp}. {?win-streak:That's {absStreak} straight. }[Front offices are|Scouts are] taking note of how [the staff|{coach}] [adjusted at halftime|managed the game script].",
      ],
      neg: [
        "The {team} fall to {record} after a {score} loss to the {opp}. {?losing-streak:{absStreak} straight losses. }[I'm told|Sources tell me] [frustration is building|there's tension] [in the building|between the staff and front office]{?blowout:, and today did not help}.",
        "{opp} {themScore}, {team} {usScore}. {?blowout:Not competitive. }[Expect|There will be] [questions about the play-calling|a long film session|pressure on {coach}] this week.",
      ],
      neu: ["{team} and {opp} finish {score}. [A strange one.|Hard to read anything from that one.]"],
    },
    injury: {
      neg: [
        "[Sources:|Per sources,] {team} {pos} {player} is expected to miss [{weeks} weeks|time] with an injury. {?season-altering:This one changes their season. }[Further tests pending.|MRI scheduled.]",
        "[Bad news for the {team}:|Brutal blow in {city}:] {player} ({pos}) is out [{weeks} weeks|for the foreseeable future], I'm told.{?starter: A starter, and [the depth chart is thin|a tough replacement job].}",
      ],
    },
    return: { pos: ["{team} {pos} {player} has been cleared and is expected to [play this week|return to the lineup], per sources."] },
    trade: {
      neu: ["[Trade:|Deal done:] {headline}. [Terms being finalized.|More details to come.] [Interesting move for a team at {record}.|Bold.]"],
    },
    signing: { neu: ["[Signing:|Agreed:] {headline}. [I'm told it came together quickly.|Both sides wanted this.]"] },
    holdout: { neg: ["{player} is not [reporting|attending practice] as contract talks [stall|drag on], sources say. [The gap is significant.|Neither side is blinking.]"] },
    draft: {
      pos: ["The {team} [take|select] {player}{?first-round: in the first round}. {?on-our-board:[I'm told he was high on their board all along.|They did their homework: private visit, medicals, the works.]}{!on-our-board:[Teams I spoke with had a high grade on him.|Several teams were targeting him in this range.]}"],
      neu: ["The {team} select {player}. {?unscouted:[I'm told their scouts had limited exposure to him.|A bit of a surprise around the league.]}{!unscouted:[Solid value.|Expected range.]}"],
    },
    bust: { neg: ["[League evaluators are|Scouts are] [quietly writing off|losing patience with] {player}. A [rough|disappointing] start for a premium pick."] },
    title: { pos: ["THE {TEAM} ARE CHAMPIONS. {score} over the {opp}. [{coach} cements his legacy.|A season to remember in {city}.]"] },
    elimination: { neg: ["The {team}'s season is over. [Big offseason decisions ahead.|Expect changes.] {?blowout:Not how anyone pictured it ending.}"] },
    presser: { neu: ["{coach} [on the podium|at the press conference]: \"{quote}\" [Read into that what you will.|Notable tone.]"] },
    dilemma: { neu: ["[Hearing|I'm told] the {team} [handled|addressed] a locker-room issue this week: {headline}."] },
    preview: { neu: ["[Week {week} circle game:|One to watch this week:] {team} vs {opp}. {?rivalry:Division rivals. }[Both teams need it.|Pressure is on {coach}.]"] },
  },
  beat: {
    result: {
      pos: [
        "[Postgame notes|Locker room after] {score} win: [music blasting|game ball went to {star}|{coach} gave a short, happy speech]. {?clutch:Players said the final drive was 'calm in the huddle.' }[{record} now.|Good week ahead.]",
        "Final: {team} {usScore}, {opp} {themScore}. [Three things I saw:|My takeaways:] 1) {star} [took over|set the tone] 2) [the defense tightened up late|o-line won up front] 3) {?rivalry:that one meant something to this building}{!rivalry:this team looks [connected|confident]}.",
      ],
      neg: [
        "Quiet locker room after the {score} loss. [{star} spoke for a long time at his locker.|Several players left without talking.] {?losing-streak:That's {absStreak} straight.} [{coach} said 'it starts with me.'|{coach} was short with reporters.]",
        "[Final|FINAL]: {opp} {themScore}, {team} {usScore}. [The run game never got going.|Turnovers killed them.|Third downs, again.] {?blowout:Starters came out early. }I'll have more from {city} tonight.",
      ],
      neu: ["{team} and {opp} finish {score}. [Odd game.|Players weren't sure how to feel.]"],
    },
    injury: {
      neg: ["{player} [was in a walking boot|left the facility on crutches|wasn't spotted at practice] today. {coach} called it [day to day|'week to week']. {?season-altering:Doesn't sound good.}"],
    },
    return: { pos: ["{player} [back at practice|in full pads] today. [Looked explosive.|Moving well.] {coach}: 'He's ready.'"] },
    trade: { neu: ["Locker room reaction to {headline}: [mixed|a lot of surprised faces]. [One veteran: 'Business is business.'|Players found out on social media.]"] },
    signing: { neu: ["{headline}. [He'll wear a familiar number.|Expect him in the rotation immediately.]"] },
    holdout: { neg: ["Day {n} without {player} at practice. [His locker is untouched.|Teammates are saying the right things — for now.]"] },
    draft: { pos: ["Spoke with {player} by phone: 'I [can't wait to get to work|was hoping {city} would call].' [His family was in tears.|Fun guy.]"] },
    bust: { neg: ["{player} [took reps with the twos again|was a healthy scratch]. Coaches say they're 'still developing him.'"] },
    title: { pos: ["Champagne everywhere. {coach} [hugged every player|was soaked in Gatorade]. {star}: '[We did it for {city}.|Nobody believed in us.]'"] },
    elimination: { neg: ["Lockers being cleaned out tomorrow. [Several veterans were emotional.|A few players hinted they might not be back.]"] },
    presser: { neu: ["Full {coach} presser quote: \"{quote}\""] },
    dilemma: { neu: ["Talked to a few players about {headline}. [The vibe is better than outside noise suggests.|There's some real tension.]"] },
    preview: { neu: ["Practice notes: [crisp|chippy|energetic] session ahead of {opp}. {?rivalry:You can feel it's rivalry week.}"] },
  },
  analyst: {
    result: {
      pos: ["{team} [won the success-rate battle|dominated early downs] in the {score} win. {?clutch:Win probability on the final drive swung [41%|38%|46%]. }[Sustainable?|Process looks real.]"],
      neg: ["{team} [lost the EPA battle badly|went [2|3]-for-{thirdDowns} on third down] in the {score} loss. {?blowout:Win probability under 10% by halftime. }[Regression is coming either way.|This is the data's warning shot.]"],
      neu: ["Model had this as a coin flip. {score}. [Close enough.|Variance happens.]"],
    },
    injury: { neg: ["Losing {player} ({pos}) [costs roughly 1.5 points per game|knocks ~{n}% off the {team}'s playoff odds] in our model."] },
    return: { pos: ["{player} back = [+1.2|+0.8] points/game for the {team} in our model."] },
    title: { pos: ["Preseason title odds for the {team}: [4%|7%|11%]. Models are fun."] },
    elimination: { neg: ["{team} season ends. [Point differential said this was coming.|They outperformed their expected wins all year.]"] },
    trade: { neu: ["Quick value check on {headline}: [surplus value favors the {team}|the receiving side wins on paper]."] },
  },
  hottake: {
    result: {
      pos: [
        "I SAID IT. The {team} are [the best team in football|winning it all|a DYNASTY in the making]. {?rivalry:The {opp} are [frauds|done]. }[Don't @ me.|Receipts saved.]",
        "{star} is [a top-5 player in this league|the most underrated player alive|HIM]. {score}. [Stop debating.|End of conversation.]",
      ],
      neg: [
        "FIRE. EVERYBODY. {score} against the {opp}?! {?blowout:Embarrassing. }[{coach} has lost the locker room.|{star} is OVERRATED and I'll die on that hill.]",
        "The {team} are [frauds|paper tigers|a JOKE]. {?losing-streak:{absStreak} straight L's. }[Blow it up.|Somebody has to say it.] [{coach} on the hot seat? Try ON FIRE.|Trade {star}.]",
      ],
      neu: ["{score}?! [Nobody wins that game.|Both teams should be embarrassed.]"],
    },
    injury: { neg: ["{player} hurt AGAIN?! [Made of glass.|You can't build around that.] {team} need to [move on|find a real {pos}]."] },
    trade: { neu: ["{headline}?! [Fleeced.|Highway robbery.|Worst trade of the decade.] [Somebody explain this to me.|Not a serious franchise.]"] },
    holdout: { neg: ["{player} wants MORE money?! [Show up and play.|Win something first.] [Trade him.|Let him sit.]"] },
    draft: {
      pos: ["{player} to the {team}? {?first-round:[STEAL of the draft.|Franchise-changer.]}{!first-round:[Sneaky good pick.|Remember this name.]} [I had him top-10 on my board.|Love it.]"],
      neg: ["{player}?! {?surprise-pick:[Nobody had him on their board.|Who is that?!]}{!surprise-pick:[Reach.|Way too early.]} [The {team} front office strikes again.|Draft grade: D.]"],
      neu: ["{player} to the {team}. [Fine pick.|Ok.] [Show me in camp.|We'll see.]"],
    },
    bust: { neg: ["{player} is the biggest BUST in {team} history. [I was screaming this on draft night.|Receipts are out there.]"] },
    title: { pos: ["I ALWAYS believed in the {team}. ALWAYS. [Go find the tape.|Never doubted.]"] },
    elimination: { neg: ["Same old {team}. [Blow it all up.|Fire everybody.] [{coach} has to go.|Embarrassing.]"] },
    presser: { neu: ["{coach} said \"{quote}\"?! [That's a man who knows he's in trouble.|COACHSPEAK.]"] },
    dilemma: { neg: ["Drama in {city}: {headline}. [This locker room is a mess.|Somebody's getting traded.]"] },
  },
  team: {
    result: {
      pos: ["[FINAL.|WE WIN.|VICTORY.] {team} {usScore}, {opp} {themScore}. {?clutch:[Never in doubt 😤|Heart attack ball.] }{?rivalry:[Division rivals. Handled.|Keep the bragging rights home.] }#{hashtag}"],
      neg: ["Final: {team} {usScore}, {opp} {themScore}. [We'll be back.|On to next week.] #{hashtag}"],
      neu: ["Final: {team} {usScore}, {opp} {themScore}."],
    },
    injury: { neg: ["Injury update: {player} ({pos}) is {?season-altering:out indefinitely}{!season-altering:[day-to-day|questionable]}. We're with you, {first}. 💪"] },
    return: { pos: ["He's back. {player} is [cleared|ready to go]. 🔥"] },
    signing: { pos: ["[Welcome to {city}!|Officially official.] {headline} #{hashtag}"] },
    draft: { pos: ["With our pick, the {team} select {player}. Welcome to {city}! #{hashtag}"] },
    title: { pos: ["CHAMPIONS. 🏆 Thank you {city}. #{hashtag}"] },
    elimination: { neg: ["Thank you to the best fans in football. [We'll be back.|This team will be back.]"] },
    preview: { pos: ["[Game week.|Locked in.] {team} vs {opp}. {?rivalry:Rivalry week. }#{hashtag}"] },
  },
  rival: {
    result: {
      // Polarity is the rival's own: "pos" means they beat the human club.
      pos: ["[Easy work.|Too easy.|Never in doubt.] {?rivalry:{city} knows who runs this division now. }[🤫|📈|🧹]", "[They talked all week.|Heard a lot of noise from {city}.] [Scoreboard.|Quiet now.]"],
      neg: ["[Respect to {city}.|Tip of the cap.] [We'll see them again.|Good team.] [Back to work.|Not over.]", "[Circle the rematch.|Remember this feeling.] {?rivalry:[See you twice a year, {city}.|This rivalry isn't done.]}"],
      neu: ["[Weird one.|That one stings for everybody.]"],
    },
  },
  player: {
    result: {
      pos: ["[Love this team.|That's us.|One more.] {?clutch:Heart rate still up. }[Back to work Monday.|Proud of the guys.] [🙏|💯|🔒]"],
      neg: ["[It's on me.|We'll fix it.|Not good enough.] [Back to work.|Stay with us, {city}.]"],
      neu: ["[Strange game.|We'll get better.]"],
    },
    return: { pos: ["[Feels good to be back.|Thank you to the training staff.|Missed this.] [Let's work.|🙏]"] },
    injury: { neg: ["[Appreciate all the love.|Setback for a comeback.|I'll be back stronger.]"] },
  },
};

// Fan voices by stance toward the human club: "pos" backs the team, "neg" turns on it.
// Result-aware conditionals keep a reply consistent with what actually happened.
const REPLIES = {
  loyalist: {
    pos: ["{?win:[We're so back.|Best team in football.|Told y'all.]}{!win:[Still believe.|One game. Relax.|Ride or die, always.]} #{hashtag}", "[Never leaving.|Never doubting {star}.|Love this team.]"],
    neg: ["{?loss:[I'll still be there Sunday but this hurt.|Even I can't defend that one.]}{!loss:[Not my favorite week.|Rough one, but we move.]}"],
  },
  doomer: {
    pos: ["{?win:[Fine. ONE good week.|Don't get used to it.|Fool's gold, but I'll take it.]}{!win:[Could've been worse, I guess.|Not dead yet.]}"],
    neg: ["[Here we go again.|Every. Single. Year.|Wake me up in April.|Same {team}.]", "{?loss:[Called it Tuesday.|Blow it up.|Fire everybody, I mean it this time.]}{!loss:[Doom loading...|This is how it starts.]}"],
  },
  statnerd: {
    pos: ["[The underlying numbers back this up.|Success rate agrees.|Process over results, and the process is good.]"],
    neg: ["[Point differential has been screaming this.|The efficiency numbers were never there.|Regression was always coming.]"],
  },
  oldtimer: {
    pos: ["[That's real football.|Reminds me of the old days.|Hard-nosed. Love it.]"],
    neg: ["[Back in my day we ran the ball.|These guys don't tackle anymore.|Pathetic. Just pathetic.]"],
  },
  meme: {
    pos: ["[Absolute cinema.|Bro cooked.|📈📈📈|Clip it.]"],
    neg: ["[💀💀💀|It's so over.|{opp} fans are never letting us live this down|🤡]"],
  },
  capguy: {
    pos: ["[And there's still cap room to add.|That contract is paying off.|Cheap production on the cap sheet.]"],
    neg: ["[Paying {star} for THAT?|That dead money is going to haunt us.|Imagine this with our cap sheet.]"],
  },
};
const stanceFor = (voice, base, rng) => (FAN_VOICES[voice].bias + base * 0.9 + (rng() - 0.5) * 0.6 >= 0 ? "pos" : "neg");

const QUOTES = {
  pos: ["We played complementary football.", "Credit to the guys — they bought in.", "We're not satisfied, but it's a good step."],
  neg: ["It starts with me. I have to coach better.", "We'll look at the film and get it fixed.", "Not acceptable. Everything's on the table."],
  neu: ["We're focused on the next opponent.", "I'm not going to get into that.", "Every week is its own season."],
};

/* ------------------------------------------------------------------ grammar */

export function expandTemplate(template, ctx, rng) {
  const tags = new Set(ctx.tags || []);
  let out = template.replace(/\{([?!])([\w-]+):([^{}]*(?:\{[\w]+\}[^{}]*)*)\}/g, (_, mode, tag, body) =>
    (mode === "?") === tags.has(tag) ? body : "",
  );
  // Innermost choices first, so "[a|b [c|d]]" nests.
  for (let prev = null; prev !== out; ) {
    prev = out;
    out = out.replace(/\[([^\[\]]+)\]/g, (_, body) => pick(rng, body.split("|")));
  }
  out = out.replace(/\{(\w+)\}/g, (_, key) => (ctx[key] ?? "").toString());
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
}

const KIND_GROUP = {
  GameResult: "result",
  ClutchFinish: "result",
  Blowout: "result",
  RivalryGame: "result",
  Injury: "injury",
  InjuryReturn: "return",
  Trade: "trade",
  Signing: "signing",
  Holdout: "holdout",
  DraftPick: "draft",
  DraftBust: "bust",
  Championship: "title",
  PlayoffElimination: "elimination",
  PressConference: "presser",
  LockerRoomDilemma: "dilemma",
  Milestone: "result",
};

// Base public sentiment for an event in [-1, 1]: positive is good news for the human club.
export function eventSentiment(e) {
  const t = new Set(e.tags || []);
  let v =
    {
      GameResult: e.margin > 0 ? 0.45 : e.margin < 0 ? -0.45 : 0,
      Injury: e.severity === "major" ? -0.85 : e.starter ? -0.6 : -0.3,
      InjuryReturn: 0.5,
      Trade: 0,
      Signing: 0.3,
      Holdout: -0.5,
      DraftPick: 0.35,
      DraftBust: -0.7,
      Championship: 1,
      PlayoffElimination: -0.8,
      PressConference: e.tone === "pos" ? 0.3 : e.tone === "neg" ? -0.3 : 0,
      LockerRoomDilemma: e.sentiment ?? -0.2,
      Milestone: 0.6,
    }[e.kind] ?? 0;
  if (e.kind === "DraftPick") {
    if (t.has("first-round")) v += 0.2;
    if (t.has("surprise-pick") && t.has("unscouted")) v -= 0.45;
  }
  if (["GameResult"].includes(e.kind)) {
    if (t.has("blowout")) v *= 1.9;
    if (t.has("clutch") && e.margin > 0) v += 0.3;
    if (t.has("rivalry")) v *= 1.3;
    if (t.has("playoffs")) v *= 1.4;
    if (t.has("win-streak")) v += 0.15;
    if (t.has("losing-streak")) v -= 0.2;
  }
  return Math.max(-1, Math.min(1, v));
}

/* ------------------------------------------------------------------- state */

export function ensureSocial(s) {
  const f = s.franchise;
  if (!f) return null;
  f.socialEngine ??= {
    version: 1,
    posts: [],
    recent: [],
    seen: [],
    pulse: { fanScore: f.clubs?.[s.team]?.fanApproval ?? 60, drama: 15, chemistry: 70 },
    history: [],
  };
  const e = f.socialEngine;
  for (const k of ["posts", "recent", "seen", "history"]) if (!Array.isArray(e[k])) e[k] = [];
  return e;
}

export function socialPulse(s) {
  const e = ensureSocial(s);
  const p = e.pulse;
  return {
    ...p,
    label:
      p.drama >= 70 ? "Media firestorm" : p.drama >= 45 ? "Simmering" : p.fanScore >= 75 ? "Fanbase buzzing" : p.fanScore <= 35 ? "Fanbase restless" : "Steady",
    moraleModifier: moraleModifier(p),
    trend: e.history.slice(0, 8).reverse(),
  };
}

// Chemistry and drama translate into a bounded weekly morale nudge (-3..+3).
export const moraleModifier = (p) =>
  Math.max(-3, Math.min(3, Math.round((p.chemistry - 62) / 12 - Math.max(0, p.drama - 55) / 15)));

/* ---------------------------------------------------------------- context */

const teamName = (s, t) => s.franchise.clubs?.[t]?.identity?.name || globalThis.clubs?.[t]?.[2] || `Team ${t + 1}`;
const teamCity = (s, t) => s.franchise.clubs?.[t]?.identity?.city || globalThis.clubs?.[t]?.[1] || teamName(s, t);
const teamAbbr = (s, t) => globalThis.clubs?.[t]?.[0] || teamName(s, t).slice(0, 3).toUpperCase();
const roster = (s, t) => (t === s.team ? s.roster : s.franchise.clubs?.[t]?.players) || [];
const topPlayer = (s, t) => roster(s, t).filter((p) => !p.injury).sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0))[0];

function context(s, e, rng) {
  const t = s.team,
    opp = Number.isInteger(e.opponent) ? e.opponent : null,
    me = s.teams?.[t],
    star = topPlayer(s, t),
    oppStar = opp != null ? topPlayer(s, opp) : null,
    team = teamName(s, t);
  return {
    tags: e.tags || [],
    team,
    TEAM: team.toUpperCase(),
    city: teamCity(s, t),
    abbr: teamAbbr(s, t),
    hashtag: `${team.replace(/\W/g, "")}Talk`,
    opp: opp != null ? teamName(s, opp) : "opponent",
    oppCity: opp != null ? teamCity(s, opp) : "",
    usScore: e.score?.[0] ?? "",
    themScore: e.score?.[1] ?? "",
    score: e.score ? `${e.score[0]}–${e.score[1]}` : "",
    absStreak: Math.abs(e.streak ?? 0),
    record: me ? `${me.w}-${me.l}` : "",
    coach: s.coach?.name || "the head coach",
    star: star?.name || "the quarterback",
    oppStar: oppStar?.name || "their best player",
    player: e.playerName || star?.name || "",
    first: (e.playerName || "").split(" ")[0],
    pos: e.pos || "",
    weeks: e.weeks ?? "a few",
    week: (s.week ?? 0) + 1,
    headline: e.headline || "",
    quote: e.quote || pick(rng, QUOTES[e.tone || "neu"]),
    n: 2 + Math.floor(rng() * 11),
    thirdDowns: 11 + Math.floor(rng() * 5),
  };
}

/* ---------------------------------------------------------------- authors */

function author(s, kind, e, rng) {
  const a = ARCHETYPES[kind],
    t = s.team,
    ctx = { abbr: teamAbbr(s, t), team: teamName(s, t).replace(/\W/g, ""), n: 10 + (hash(t + kind) % 89) };
  if (kind === "insider") return { name: "Mara Quinlan", handle: "MQuinlanReports", ...a };
  if (kind === "analyst") return { name: "Expected Points Ghost", handle: "EPAghost", ...a };
  if (kind === "hottake") return { name: "Tre Vance", handle: "TreTakesNoPrisoners", ...a };
  if (kind === "beat") {
    const name = BEAT_NAMES[hash("beat" + t) % BEAT_NAMES.length];
    return { name, handle: `${ctx.abbr}Beat_${name.split(" ")[1]}`, outlet: `${teamCity(s, t)} Ledger`, ...a };
  }
  if (kind === "team") return { name: `${teamCity(s, t)} ${teamName(s, t)}`, handle: `${ctx.abbr}Official`, ...a };
  if (kind === "rival" || kind === "player") {
    const club = kind === "rival" ? e.opponent : t,
      pool = roster(s, club).filter((p) => !p.injury || e.playerId === p.id),
      p =
        (kind === "player" && e.playerId && pool.find((x) => x.id === e.playerId)) ||
        pool.sort((x, y) => (y.ovr ?? 0) - (x.ovr ?? 0))[Math.floor(rng() * Math.min(4, pool.length))];
    if (!p) return null;
    const recognition = p.reputation?.recognition ?? clamp((p.ovr ?? 60) * 1.1 - 10, 1, 99);
    return {
      ...a,
      name: p.name,
      handle: p.name.toLowerCase().replace(/[^a-z0-9]/g, "") + (p.jersey ?? ""),
      team: club,
      player: p,
      reach: Math.round(1200 + recognition ** 3 * 8),
    };
  }
  const voice = pick(rng, Object.keys(FAN_VOICES)),
    handle = expandTemplate(pick(rng, FAN_HANDLES[voice]), { ...ctx, tags: [] }, rng);
  return { name: handle, handle, voice, ...a, bias: FAN_VOICES[voice].bias, stance: FAN_VOICES[voice].stance };
}

// Which voices weigh in depends on how big the moment is.
export function castFor(e, base) {
  if (e.preview) return ["beat", "insider", "team", "fan"];
  const group = KIND_GROUP[e.kind],
    tags = new Set(e.tags || []),
    cast = ["beat"];
  const big = Math.abs(base) >= 0.6 || tags.has("rivalry") || tags.has("playoffs");
  if (big || ["trade", "holdout", "title", "elimination", "injury"].includes(group)) cast.push("insider");
  if (Math.abs(base) >= 0.4 || ["trade", "holdout", "bust", "presser", "dilemma", "draft"].includes(group)) cast.push("hottake");
  if (["result", "title", "injury", "return", "draft", "signing", "preview", "elimination"].includes(group)) cast.push("team");
  if (group === "result" || group === "injury" || group === "return" || group === "title") cast.push("analyst");
  if (group === "result" && Number.isInteger(e.opponent)) cast.push("rival");
  if (["result", "return", "injury"].includes(group)) cast.push("player");
  cast.push("fan");
  if (big) cast.push("fan");
  return cast;
}

/* ------------------------------------------------------------------ posts */

function chooseTemplate(engine, kind, group, polarity, rng) {
  const bank = T[kind]?.[group];
  if (!bank) return null;
  const list = bank[polarity] || bank.neu || bank.pos || bank.neg;
  if (!list?.length) return null;
  const ids = list.map((_, i) => `${kind}:${group}:${polarity}:${i}`),
    fresh = ids.filter((id) => !engine.recent.includes(id)),
    id = pick(rng, fresh.length ? fresh : ids);
  engine.recent.unshift(id);
  engine.recent = engine.recent.slice(0, 40);
  return { id, text: list[ids.indexOf(id)] };
}

const polarityOf = (v) => (v > 0.15 ? "pos" : v < -0.15 ? "neg" : "neu");

export function composePost(s, e, kind, engine, rng) {
  const base = eventSentiment(e),
    a = author(s, kind, e, rng);
  if (!a) return null;
  // Rival players experience the human club's result as its inverse.
  const perspective = kind === "rival" ? -base : base,
    sentiment = Math.max(-1, Math.min(1, perspective * (0.6 + a.volatility * 0.4) + a.bias * 0.5 + (rng() - 0.5) * 0.3)),
    group = e.preview ? "preview" : KIND_GROUP[e.kind] || "result",
    ctx = context(s, e, rng);
  let polarity = kind === "fan" ? null : polarityOf(kind === "rival" ? perspective : sentiment);
  let text;
  if (kind === "fan") {
    const stance = stanceFor(a.voice, base, rng);
    text = expandTemplate(pick(rng, REPLIES[a.voice][stance]), ctx, rng);
    polarity = stance;
  } else {
    const tpl = chooseTemplate(engine, kind, group, polarity, rng);
    if (!tpl) return null;
    text = expandTemplate(tpl.text, ctx, rng);
  }
  if (!text) return null;
  const drama = engine.pulse.drama,
    engagement = Math.round(a.reach * (0.002 + Math.abs(sentiment) * 0.01) * (1 + drama / 80) * (0.7 + rng() * 0.6));
  return {
    id: `se-${e.id}-${kind}-${a.handle}`,
    eventId: e.id,
    archetype: kind,
    name: a.name,
    handle: a.handle,
    voiceKind: a.outlet ? `${a.label} · ${a.outlet}` : a.stance ? `${a.label} · ${a.stance}` : a.label,
    verified: !!a.verified,
    team: a.team ?? s.team,
    year: e.year,
    week: e.week,
    topic: { result: "Reactions", injury: "Injuries", return: "Injuries", draft: "Draft", bust: "Draft", trade: "Rumors", holdout: "Rumors", title: "Reactions", elimination: "Reactions", presser: "Reactions", dilemma: "Players" }[group] || "Reactions",
    tone: sentiment > 0.5 ? "Hyped" : sentiment > 0.15 ? "Optimistic" : sentiment < -0.5 ? "Furious" : sentiment < -0.15 ? "Concerned" : "Debate",
    body: text,
    sentiment: Math.round(sentiment * 100) / 100,
    reach: a.reach,
    likes: engagement,
    reposts: Math.round(engagement * (0.12 + Math.abs(sentiment) * 0.2)),
    targetPlayer: kind === "hottake" && sentiment < -0.4 ? e.playerId ?? topPlayer(s, s.team)?.id : undefined,
    ...(a.player
      ? {
          authorPlayer: a.player.id,
          authorFace: Object.fromEntries(["id", "name", "pos", "face", "headshot", "generated"].filter((k) => a.player[k] !== undefined).map((k) => [k, a.player[k]])),
          reputation: { recognition: a.player.reputation?.recognition ?? a.player.ovr ?? 60, label: "Player account", audience: a.reach },
        }
      : {}),
    comments: replies(s, ctx, sentiment, base, a, rng),
    feedOrder: { insider: 0, hottake: 1, team: 2, beat: 3, rival: 4, player: 5, analyst: 6, fan: 7 }[kind] ?? 8,
  };
}

function replies(s, ctx, sentiment, base, parent, rng) {
  const count = 2 + Math.floor(rng() * 3),
    out = [],
    voices = Object.keys(REPLIES);
  for (let i = 0; i < count; i++) {
    const voice = voices[Math.floor(rng() * voices.length)],
      text = expandTemplate(pick(rng, REPLIES[voice][stanceFor(voice, base, rng)]), ctx, rng);
    if (out.some((r) => r.text === text)) continue;
    const handle = expandTemplate(pick(rng, FAN_HANDLES[voice]), { abbr: ctx.abbr, team: ctx.team.replace(/\W/g, ""), n: 10 + Math.floor(rng() * 89), tags: [] }, rng);
    out.push({ name: handle, stance: FAN_VOICES[voice].stance, replyTo: out.length && rng() < 0.45 ? out.at(-1).name : undefined, text });
  }
  return out;
}

/* ---------------------------------------------------------- round processing */

// Turn this round's events (plus untagged newsroom transactions) into persisted posts, then
// update fan score / drama / chemistry and apply bounded morale and fan-approval consequences.
export function processSocialRound(s, events = []) {
  const engine = ensureSocial(s);
  if (!engine) return [];
  // Clutch/blowout/rivalry results are carried as tags on GameResult; their standalone events
  // exist for cinematic triggers, so the feed skips them to avoid duplicate reactions.
  // Medical news is capped at the two most significant spells per round (starters, then length)
  // so a bad injury week reads as a story rather than a flood.
  const fresh = [...events, ...storyEvents(s, engine), ...previewEvents(s)].filter(
    (e) => e && !engine.seen.includes(e.id) && !["ClutchFinish", "Blowout"].includes(e.kind) && (e.kind !== "RivalryGame" || e.preview),
  );
  const medical = new Set(
    fresh
      .filter((e) => e.kind === "Injury" || e.kind === "InjuryReturn")
      .sort((a, b) => b.starter - a.starter || (b.weeks ?? 0) - (a.weeks ?? 0))
      .slice(0, 2),
  );
  const all = fresh.filter((e) => (e.kind !== "Injury" && e.kind !== "InjuryReturn") || medical.has(e));
  for (const e of fresh) if (!all.includes(e)) engine.seen.push(e.id);
  if (!all.length) return [];
  const created = [];
  let weighted = 0,
    weights = 0,
    heat = 0;
  for (const e of all) {
    engine.seen.push(e.id);
    const rng = random(eventSeed(e, "social")),
      base = eventSentiment(e);
    for (const kind of castFor(e, base)) {
      const post = composePost(s, e, kind, engine, rng);
      if (!post || created.some((p) => p.id === post.id)) continue;
      created.push(post);
      const w = Math.log10(post.reach + 10);
      weighted += (kind === "rival" ? -post.sentiment : post.sentiment) * w;
      weights += w;
      if (post.sentiment < -0.4) heat += kind === "hottake" ? 9 : kind === "insider" ? 6 : 2;
      if (["trade", "holdout", "dilemma"].includes(KIND_GROUP[e.kind])) heat += 4;
    }
  }
  engine.seen = engine.seen.slice(-1500);
  engine.posts = [...created, ...engine.posts].slice(0, 160);
  const mood = weights ? weighted / weights : 0,
    p = engine.pulse,
    before = { ...p };
  p.fanScore = Math.round(clamp(p.fanScore + mood * 7, 5, 99) * 10) / 10;
  p.drama = Math.round(clamp(p.drama * 0.72 + heat, 0, 100) * 10) / 10;
  const results = all.filter((e) => e.kind === "GameResult"),
    won = results.some((e) => e.margin > 0);
  const resilience = s.franchise.depth?.tree?.unlocked?.includes("culture-builder") ? 0.5 : 1;
  p.chemistry = Math.round(clamp(p.chemistry + (won ? 1.5 : results.length ? -1 : 0) - (Math.max(0, p.drama - 60) / 8) * resilience + mood * 2, 10, 99) * 10) / 10;
  const key = `social:${s.year}:${s.phase}:${s.week}`;
  engine.history.unshift({ key, year: s.year, week: s.week, mood: Math.round(mood * 100) / 100, ...p });
  engine.history = engine.history.slice(0, 40);
  applyConsequences(s, engine, created, mood, before, key);
  return created;
}

function applyConsequences(s, engine, created, mood, before, key) {
  const delta = Math.round(mood * 3);
  if (delta) fanReaction(s, key, delta, mood > 0 ? "The fanbase is buzzing online" : "Online backlash is building", { topic: "Social" });
  const modifier = moraleModifier(engine.pulse);
  if (s.roster?.length && ensureOffice(s) && (modifier || engine.pulse.drama >= 60)) {
    applyMood(s, {
      teamDelta: modifier,
      reason: modifier >= 0 ? "Positive public narrative around the team" : "Outside noise is affecting the locker room",
      sourceId: key,
      spillover: false,
    });
  }
  // Thin-skinned players take public criticism personally.
  for (const post of created.filter((p) => p.targetPlayer)) {
    const target = s.roster?.find((p) => p.id === post.targetPlayer);
    if (!target || (target.persona?.leadership ?? 0.5) >= 0.7) continue;
    applyMood(s, { playerId: target.id, delta: -2, reason: `Public criticism from ${post.name}`, sourceId: post.id, spillover: false });
  }
}

// Bridge until every transaction path emits explicitly: classify fresh newsroom stories.
function storyEvents(s, engine) {
  const o = s.franchise.office;
  if (!o?.stories) return [];
  const out = [];
  for (const a of o.stories.slice(0, 20)) {
    if (a.team !== s.team || engine.seen.includes(`story:${a.id}`)) continue;
    // Rumor stories ("trade buzz", reports) already get insider posts from world-events.
    const t = a.title || "",
      rumor = /buzz|rumou?r|report|around the league|speculat/i.test(t),
      kind = rumor
        ? null
        : /\b(acquires?|acquired|traded|completes? (a )?trade|trade (for|with|sends))\b/i.test(t)
          ? "Trade"
          : /holdout/i.test(t)
            ? "Holdout"
            : /\b(signs|signed|agrees|joins)\b/i.test(t)
              ? "Signing"
              : /\b(drafts|drafted|selects|selected)\b/i.test(t)
                ? "DraftPick"
                : null;
    engine.seen.push(`story:${a.id}`);
    if (!kind) continue;
    const e = emitGameEvent(s, `story:${a.id}`, { kind, headline: t, playerId: a.playerId, playerName: s.roster?.find((p) => p.id === a.playerId)?.name });
    if (e) out.push(e);
  }
  return out;
}

function previewEvents(s) {
  if (s.phase !== "season") return [];
  const g = s.schedule?.[s.week]?.find((g) => g.a === s.team || g.b === s.team);
  if (!g || g.score) return [];
  const opponent = g.a === s.team ? g.b : g.a,
    rivalry = globalThis.clubs?.[s.team]?.[3] && globalThis.clubs[s.team][3] === globalThis.clubs[opponent]?.[3];
  // Previews only fire for rivalry weeks to keep the feed focused.
  if (!rivalry) return [];
  const e = emitGameEvent(s, `preview:${s.year}:${s.week}`, { kind: "RivalryGame", opponent, preview: true, tags: ["rivalry", "preview"] });
  return e ? [e] : [];
}

export function socialEnginePosts(s) {
  return ensureSocial(s)?.posts ?? [];
}

// Explicit event hook for other systems (press conferences, dilemmas, trades).
export function reactTo(s, key, event) {
  const e = emitGameEvent(s, key, event);
  return e ? processSocialRound(s, [e]) : [];
}
