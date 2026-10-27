import {
  dialogueFit,
  dialogueConsequences,
  changeCoachReputation,
} from "./career-systems.mjs";
import { clamp } from "../engine/random.mjs";
const playerOf = (s, id) => s.roster.find((p) => p.id === id);
export function conversationValid(s, c) {
  return (
    c?.team === s.team &&
    c.year === s.year &&
    c.week === s.week &&
    (!c.playerId || !!playerOf(s, c.playerId)) &&
    (c.type !== "pre" || (!!s.live && !s.live.interviewDone)) &&
    (c.type !== "post" || !!s.interviewPending) &&
    (c.type !== "half" || !!s.live?.halftime)
  );
}
export function createConversation(s, type = "player", id) {
  if (
    (type === "pre" && (!s.live || s.live.interviewDone)) ||
    (type === "post" && (!s.interviewPending || !s.lastMatch)) ||
    (type === "half" && !s.live?.halftime)
  )
    throw Error("This interview or team talk is not available right now.");
  const p = id ? playerOf(s, id) : null;
  if (id && !p) throw Error("That player is no longer on your roster.");
  const key = `${s.year}:${s.week}:${type}:${id || "team"}`;
  if ((s.franchise.cinema?.history || []).some((h) => h.key === key))
    throw Error("This conversation is already complete for this week.");
  const lead = s.roster
    .slice()
    .sort(
      (a, b) => (b.persona?.leadership || 0) - (a.persona?.leadership || 0),
    )[0];
  let title, setting, speaker, lines, choices;
  const opts = (a, b, c) => [
    { tone: "Support", text: a },
    { tone: "Challenge", text: b },
    { tone: "Clarify role", text: c },
  ];
  if (type === "player") {
    title = p.holdout
      ? "Repairing the relationship"
      : p.tradeDemand
        ? "A future at this club"
        : p.injury
          ? "The road back"
          : !p.starter
            ? "Earning a place"
            : "Behind closed doors";
    setting = "office";
    speaker = p.name;
    lines = [
      p.holdout
        ? "I need to know the club values me before I can commit to coming back."
        : p.tradeDemand
          ? "I want a clear reason to believe my future is here."
          : p.injury
            ? "I want to help the team, but I need to be confident my body is ready."
            : !p.starter
              ? "I have been working all week. What do I need to do to get a real opportunity?"
              : "I want to make a difference this week. How do you see my role?",
      "I hear you. What do you want me to focus on when I leave this room?",
    ];
    choices = opts(
      "You matter to this team. Let’s work through this together.",
      "You have the talent. Show me you can meet the standard.",
      "Here is the role I need from you. Let’s be clear about it.",
    );
  } else if (type === "team" || type === "half") {
    title =
      type === "half" ? "Thirty minutes to respond" : "One room. One standard.";
    setting = "locker";
    speaker = lead?.name || "Team captain";
    const trailing =
      s.live &&
      s.live.score[s.live.a === s.team ? 0 : 1] <
        s.live.score[s.live.a === s.team ? 1 : 0];
    lines = [
      type === "half"
        ? trailing
          ? "We know the score. Give us something we can take onto the field."
          : "We have put ourselves in a position to win. What is the message for the second half?"
        : s.morale < 65
          ? "The room is feeling the pressure. We need to hear where we go from here."
          : "The players are ready. What is our focus for this week?",
      "Then we do it together. What is the one thing you want us to remember?",
    ];
    choices = opts(
      "Trust the work. Play for the person next to you.",
      "Raise the standard. Every detail matters.",
      "Stay composed. Win your assignment, one snap at a time.",
    );
  } else if (type === "staff") {
    title = "The weekly game plan";
    setting = "film";
    speaker = s.franchise.clubs[s.team].staff[0]?.name || "Coordinator";
    lines = [
      "We can sharpen the plan, but we need one clear priority. What do you want us to emphasize?",
      "Understood. How do you want us to handle the players this week?",
    ];
    choices = opts(
      "Protect the quarterback. Keep the answers simple.",
      "Establish the run and put the pressure on them.",
      "Back the young players when the game is under control.",
    );
  } else if (type === "pre" || type === "post") {
    title =
      type === "pre" ? "Before the lights come on" : "At the final whistle";
    setting = "press";
    speaker = "Jordan Ellis · Gridiron Network";
    const m = s.lastMatch,
      k = m?.a === s.team ? 0 : 1,
      won = m?.score[k] > m?.score[1 - k];
    lines = [
      type === "pre"
        ? "Coach, what should supporters expect from your team today?"
        : won
          ? "Your team found a way to win. What made the difference?"
          : "A difficult result today. Where do you take responsibility?",
      "And what is your message to the players listening to this interview?",
    ];
    choices =
      type === "pre"
        ? opts(
            "We trust our preparation and each other.",
            "We are here to make a statement.",
            "We will let our performance do the talking.",
          )
        : opts(
            won
              ? "The players earned this. They executed together."
              : "That starts with me. We will learn and improve.",
            "We have to be sharper. Our standard is higher.",
            "We will review the film before drawing conclusions.",
          );
  } else throw Error("Unknown conversation.");
  return {
    key,
    type,
    playerId: id || null,
    team: s.team,
    year: s.year,
    week: s.week,
    step: 0,
    choicesMade: [],
    title,
    setting,
    speaker,
    speakerId: p?.id || (["team", "half"].includes(type) ? lead?.id : null),
    lines,
    choices,
  };
}
export function sceneChoices(c) {
  return c.step === 0
    ? c.choices
    : [
        { tone: "Trust", text: "Be honest with me. My door is always open." },
        {
          tone: "Accountability",
          text: "Make the next practice your best. We will review the film.",
        },
        {
          tone: "Promise",
          text:
            c.type === "player"
              ? "I will review your role after the next game."
              : "We will judge ourselves on execution, not headlines.",
        },
      ];
}
export function chooseResponse(s, index) {
  const cinema = s.franchise.cinema,
    c = cinema?.active;
  if (!conversationValid(s, c))
    throw Error(
      "This conversation has expired. Reopen it from the current week.",
    );
  if (!Number.isInteger(index) || index < 0 || index >= sceneChoices(c).length)
    throw Error("Choose an available response.");
  const chosen = sceneChoices(c)[index];
  c.choicesMade.push({ index, text: chosen.text, tone: chosen.tone });
  if (c.step === 0) {
    c.step = 1;
    c.reaction =
      index === 0
        ? "A nod. The tension in the room eases."
        : index === 1
          ? "The room grows quiet. Your challenge has landed."
          : "They lean forward, listening for the details.";
    return { complete: false, scene: c };
  }
  if (
    !(
      s.franchise.debug ||
      ["Owner", "GM", "HC", "OC", "DC"].includes(s.franchise.role)
    )
  )
    throw Error("Media responsibility is unavailable.");
  let delta = 0,
    player = null;
  const first = c.choicesMade[0].index;
  if (c.type === "player") {
    player = playerOf(s, c.playerId);
    if (player.meetingWeek === `${s.year}:${s.week}`)
      throw Error("Already met with this player this week.");
    player.meetingWeek = `${s.year}:${s.week}`;
    delta = dialogueFit(player, c.choicesMade[0].tone, {
      injured: !!player.injury,
    });
    dialogueConsequences(s, {
      person: player,
      tone: c.choicesMade[0].tone,
      delta,
      key: c.key,
    });
    player.morale = clamp(player.morale + delta, 20, 99);
    player.coachTrust = clamp(
      (player.coachTrust ?? 60) + (index === 0 ? 5 : index === 1 ? 2 : 3),
      0,
      99,
    );
    if (first === 0) {
      player.holdout = false;
      if (player.morale >= 55) player.tradeDemand = false;
    }
    s.morale = clamp(s.morale + Math.round(delta / 3), 35, 99);
    if (index === 2)
      (cinema.promises ??= []).push({
        playerId: player.id,
        name: player.name,
        year: s.year,
        week: s.week,
        due: s.week + 1,
        type: "Role review",
        done: false,
      });
  } else if (c.type === "team") {
    delta = first === 0 ? 3 : first === 1 ? (s.morale < 60 ? -2 : 2) : 1;
    s.morale = clamp(s.morale + delta, 35, 99);
    for (const p of s.roster) p.morale = clamp(p.morale + delta, 20, 99);
  } else if (c.type === "staff") {
    if (
      !s.franchise.debug &&
      !["Owner", "HC", "OC", "DC"].includes(s.franchise.role)
    )
      throw Error("Your role delegates tactical briefings.");
    const keys = ["protectQB", "feedRB", "rookies"];
    s.franchise.directives[keys[first]] = true;
    delta = 0;
  }
  if (["pre", "post", "team", "half", "staff"].includes(c.type)) {
    const people =
      c.type === "staff"
        ? s.franchise.clubs[s.team].staff.filter((x) =>
            ["OC", "DC"].includes(x.role),
          )
        : s.roster.filter((x) => x.starter);
    for (const person of people.slice(0, 3)) {
      const tone = c.choicesMade[0].tone,
        fit = dialogueFit(person, tone, {
          injured: !!person.injury,
          publicCriticism: ["pre", "post"].includes(c.type) && first === 1,
        });
      dialogueConsequences(s, {
        person,
        tone,
        delta: fit,
        key: `${c.key}:${person.id}`,
        publicCriticism: ["pre", "post"].includes(c.type) && first === 1,
        kind: c.type === "staff" ? "staff" : "player",
      });
    }
  }
  const record = {
    key: c.key,
    type: c.type,
    title: c.title,
    speaker: c.speaker,
    year: s.year,
    week: s.week,
    choices: structuredClone(c.choicesMade),
    delta,
  };
  cinema.history.unshift(record);
  cinema.history = cinema.history.slice(0, 80);
  cinema.active = null;
  return { complete: true, scene: c, record, first, delta, player };
}
export function reviewPromises(s) {
  for (const promise of s.franchise.cinema?.promises || []) {
    if (
      promise.done ||
      promise.year > s.year ||
      (promise.year === s.year && s.week < promise.due)
    )
      continue;
    const p = playerOf(s, promise.playerId);
    promise.dueNow = true;
    if (!p) {
      promise.done = true;
      promise.outcome = "Player left the club";
    } else if (p.meetingWeek === `${s.year}:${s.week}`) {
      promise.done = true;
      promise.outcome = "Role reviewed";
      p.coachTrust = clamp((p.coachTrust ?? 60) + 3, 0, 99);
    } else if (promise.year < s.year || s.week > promise.due + 1) {
      promise.done = true;
      promise.outcome = "Review missed";
      changeCoachReputation(
        s,
        `promise:${promise.playerId}:${promise.year}:${promise.week}`,
        -0.5,
        "A promised role review was missed",
        "Relationships",
      );
      p.coachTrust = clamp((p.coachTrust ?? 60) - 8, 0, 99);
      p.morale = clamp(p.morale - 3, 20, 99);
    }
  }
}
