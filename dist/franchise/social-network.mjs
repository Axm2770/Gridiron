import { expandedSocialPosts } from "./world-events.mjs";
import { reputationView, reputationLeaders } from "./reputation.mjs";
const hash = (s) => {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
const fans = [
  ["Maya / Section 214", "maya214"],
  ["Fourth Down Film", "fourthdownfilm"],
  ["Noah on Sundays", "noahonsundays"],
  ["Cap Room Corner", "caproomcorner"],
  ["Route Detail", "routedetail"],
  ["Jordan / Sunday Notes", "sundaynotes"],
];
const fmt = (n) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: 1 })
    : "unrecorded";
const current = (p, s) => p.stats?.[s.year] || {};
function sample(p, s) {
  const a = current(p, s);
  return Number.isFinite(a.snaps)
    ? `${a.snaps} recorded snaps`
    : Number.isFinite(a.attempts)
      ? `${a.attempts} recorded pass attempts`
      : "No current-season workload recorded";
}
function comparison(s, mine, other, pos) {
  const key =
    pos === "QB"
      ? "passYards"
      : pos === "RB"
        ? "rushYards"
        : pos === "WR"
          ? "recYards"
          : "sacks";
  const metric =
    pos === "QB"
      ? "passing yards"
      : pos === "RB"
        ? "rushing yards"
        : pos === "WR"
          ? "receiving yards"
          : "sacks";
  const pair = [mine, other].map((x) => ({
    ...x,
    value: Number.isFinite(current(x.p, s)[key]) ? current(x.p, s)[key] : null,
    reputation: reputationView(s, x.p).recognition,
    sample: sample(x.p, s),
  }));
  const [a, b] = pair,
    sa = current(a.p, s),
    sb = current(b.p, s),
    den =
      pos === "QB"
        ? "attempts"
        : pos === "RB"
          ? "rushAttempts"
          : pos === "WR"
            ? "receptions"
            : "snaps",
    eff = (x, st) =>
      st[den] > 0 && x.value != null ? x.value / st[den] : null,
    ea = eff(a, sa),
    eb = eff(b, sb),
    effLabel =
      pos === "QB"
        ? "yards per attempt"
        : pos === "RB"
          ? "yards per carry"
          : pos === "WR"
            ? "yards per catch"
            : "sacks per snap";
  const data =
    Number.isFinite(ea) && Number.isFinite(eb)
      ? `${a.p.name}: ${fmt(ea)} ${effLabel}; ${b.p.name}: ${fmt(eb)}. That changes the raw-total argument.`
      : `We have ${a.sample.toLowerCase()} for ${a.p.name} and ${b.sample.toLowerCase()} for ${b.p.name}. There is not a complete efficiency comparison yet.`;
  const repA = Math.round(a.reputation),
    repB = Math.round(b.reputation),
    share = Math.max(
      20,
      Math.min(
        80,
        Math.round(
          50 +
            (repA - repB) * 0.8 +
            (a.p.ovr - b.p.ovr) * 0.6 +
            ((hash(a.p.id + b.p.id + s.week) % 13) - 6),
        ),
      ),
    );
  return {
    id: `comparison-${s.year}-${s.week}-${pos}`,
    feedOrder: 2 + ["QB", "RB", "WR", "DL"].indexOf(pos) * 5,
    name: "Fourth Down Film",
    handle: "fourthdownfilm",
    team: s.team,
    year: s.year,
    week: s.week,
    topic: "Comparisons",
    tone: "Debate",
    body: `Two ${pos}s, different arguments. ${a.p.name} or ${b.p.name} for one season? ${repA >= repB ? a.p.name : b.p.name} has the bigger name; I want to compare production, workload and fit before picking.`,
    pair,
    metric,
    likes: Math.round((a.reputation + b.reputation) ** 2 * 0.18),
    poll: {
      question: "Who would you build this season around?",
      options: [a.p.name, b.p.name],
      shares: [share, 100 - share],
      votes: Math.round((a.reputation + b.reputation) * 38),
    },
    comments: [
      {
        name: "Maya / Section 214",
        stance: "Production",
        text:
          a.value != null && b.value != null
            ? `${a.p.name} has ${fmt(a.value)} ${metric}, compared with ${fmt(b.value)} for ${b.p.name}. I lean toward the production we can actually see.`
            : "I cannot pick from an empty stat line. Let us get a few games of evidence first.",
      },
      {
        name: "Route Detail",
        replyTo: "Maya / Section 214",
        stance: "Film & context",
        text: data,
      },
      {
        name: "Cap Room Corner",
        replyTo: "Route Detail",
        stance: "Roster building",
        text: `I would ask what the team already has around them. ${a.p.name} is ${a.p.age}; ${b.p.name} is ${b.p.age}. Age and supporting cast can change the choice. I would build the role before making the move.`,
      },
      {
        name: "Noah on Sundays",
        stance: "Reputation",
        text: `${repA >= repB ? a.p.name : b.p.name} is the more established name. That brings a benefit of the doubt, but the name on the jersey cannot be the whole argument.`,
      },
    ],
  };
}
export function buildSocialFeed(s, teams, stories, prefs) {
  const posts = [...expandedSocialPosts(s)],
    all = reputationLeaders(s),
    own = all.filter((x) => x.team === s.team);
  for (const a of stories.slice(0, 30)) {
    const h = hash(a.id),
      [name, handle] = fans[h % fans.length],
      medical = a.category === "Medical",
      positive =
        /win|victory|breakout|shared standards|joins|champion|return/i.test(
          a.title,
        ) && !/defeat|loss/i.test(a.title),
      negative =
        (medical && !/return|cleared/i.test(a.title)) ||
        /holdout|defeat|loss|investigat/i.test(a.title),
      p = all.find((x) => x.p.id === a.playerId),
      rep = p?.recognition ?? 55;
    const specifics = medical
      ? `Availability changes the rotation. I would protect the recovery plan and give the next player a defined role.`
      : a.category === "Scouting"
        ? `The report is a range, not a guarantee. Scheme fit and another evaluation matter more to me than moving up for a headline.`
        : a.category === "Players"
          ? `The daily habits matter. I want to see whether this shows up in preparation and on the next game film.`
          : `What is the adjustment for next week? Personnel, protection or play selection — pick one and explain the change.`;
    posts.push({
      id: "fan-" + a.id,
      feedOrder: posts.length + Math.floor(posts.length / 3),
      name,
      handle,
      team: a.team ?? s.team,
      year: a.year,
      week: a.week,
      topic: medical
        ? "Injuries"
        : a.category === "Scouting"
          ? "Draft"
          : "Reactions",
      tone: negative ? "Concerned" : positive ? "Optimistic" : "Debate",
      body: [
        `On “${a.title}”: ${specifics}`,
        `${a.title}. Here is my question: ${specifics}`,
        `Thread after the latest update — “${a.title}”. ${specifics}`,
      ][h % 3],
      storyId: a.id,
      title: a.title,
      likes: Math.round(18 + rep ** 2 * 0.08 + (h % 170)),
      comments: medical
        ? [
            {
              name: "Maya / Section 214",
              stance: "Team fan",
              text: "The replacement does not need to be a copy of the starter. Give them the jobs they can execute.",
            },
            {
              name: "Fourth Down Film",
              replyTo: "Maya / Section 214",
              stance: "Film analysis",
              text: "Agreed. Adjust the call sheet too. Keeping the same workload with a different skill set is asking a lot.",
            },
          ]
        : [
            {
              name: "Noah on Sundays",
              stance: "Short term",
              text: "I want an adjustment we can measure next game, not just another big statement.",
            },
            {
              name: "Cap Room Corner",
              replyTo: "Noah on Sundays",
              stance: "Long term",
              text: "Fair, but the next game cannot be the whole plan. I would keep the development and roster costs in view too.",
            },
          ],
    });
  }
  // Players post in their simulated career voice; never present these as real-world quotes.
  const authors = [
    ...own.slice(0, 3),
    ...all.filter((x) => x.team !== s.team).slice(0, 3),
  ];
  for (const x of authors) {
    const p = x.p,
      v = reputationView(s, p),
      st = current(p, s),
      form = p.progression?.form;
    const voice =
      (authors
        .filter((y) => y.p.pos === p.pos)
        .findIndex((y) => y.p.id === p.id) +
        s.week +
        hash(p.pos + s.year)) %
      3;
    const details = {
      QB: [
        "Protection checks and timing were the focus today. The little adjustments matter.",
        "A lot of work with the receivers on being in the right place at the right time.",
        "Spent time on the looks we expect this week. Clear communication has to come first.",
      ],
      WR: [
        "Working the releases and the route details. Every step has a purpose.",
        "Timing, spacing, and finishing the catch. A few details I want to be sharper on.",
        "The work without the ball matters too. Trying to make every rep useful.",
      ],
      TE: [
        "Routes, protection, run fits. I like having a job in every part of the offense.",
        "A little cleaner with the footwork today. Keep building the habits.",
        "The details at the line are the focus. Doing my part to keep the offense moving.",
      ],
      RB: [
        "Patience in the run game, decisive when the lane opens. Back at it.",
        "Working on the details in pass protection as much as the runs.",
        "Reads, footwork, ball security. There is always another detail to improve.",
      ],
      DL: [
        "Get-off, hand placement, finish. Keeping the work simple and consistent.",
        "The best rushes start with everybody doing their job. Building that connection.",
        "Finding a little more detail on the film every week. Ready to put the work in.",
      ],
      OL: [
        "Five people, one set of eyes. Communication and footwork today.",
        "Nothing flashy about the work. Keeping the pocket clean is the standard.",
        "Working the combinations and making the calls clear. The details add up.",
      ],
      LB: [
        "Eyes right, communicate, finish. Taking the next rep seriously.",
        "A lot of film on the fits this week. Want to get everybody moving together.",
        "The small checks matter. Working on being a step earlier with the call.",
      ],
      CB: [
        "Feet and eyes. Staying patient at the line and trusting the technique.",
        "The challenge is winning the next rep, whatever happened on the last one.",
        "Working on the breaks and the communication. There is always another level.",
      ],
      S: [
        "Everybody connected on the back end. That is the focus this week.",
        "Film and communication. Want the whole secondary seeing the same thing.",
        "The angles and the checks matter. Good work with the group today.",
      ],
    };
    const body = p.injury
      ? [
          "Working through the recovery plan with the staff. Staying involved in meetings and helping the group however I can.",
          "Not on the practice field yet, but still part of the preparation. Taking the recovery work one day at a time.",
          "Appreciate the messages. Keeping the focus on the recovery plan and being ready when the staff clears me.",
        ][voice]
      : Number.isFinite(form) && form < 6.2
        ? [
            "The film is honest. There are plays I need to finish better. Back to work with the group this week.",
            "I expect more from myself. Taking the corrections into practice and keeping the focus on the next job.",
            "Not satisfied with the execution. Appreciate the support; the response has to come in the work.",
          ][voice]
        : `${p.age < 25 ? ["Still learning, still asking questions. ", "Another week building the habits. ", "Appreciate the veterans who keep helping me with the details. "][voice] : ["Back to work. ", "Good session with the group. ", "Film, practice, repeat. "][voice]}${(details[p.pos] || ["Getting the details right with the group.", "Focused on a consistent week of preparation.", "Looking forward to the next challenge."])[voice]} ${Number.isFinite(form) && form >= 7.3 ? "Proud of the recent work, and plenty left to improve." : ["Appreciate everyone riding with us.", "Looking forward to the next one.", "One good day at a time."][voice]}`;
    const metric =
        p.pos === "QB"
          ? "passYards"
          : p.pos === "WR" || p.pos === "TE"
            ? "recYards"
            : p.pos === "RB"
              ? "rushYards"
              : "tackles",
      label =
        metric === "passYards"
          ? "passing yards"
          : metric === "recYards"
            ? "receiving yards"
            : metric === "rushYards"
              ? "rushing yards"
              : "tackles";
    posts.push({
      id: `player-${s.year}-${s.week}-${p.id}`,
      feedOrder: 1 + authors.indexOf(x) * 6,
      name: p.name,
      handle:
        p.name.toLowerCase().replace(/[^a-z0-9]/g, "") +
        "_" +
        (p.jersey || p.pos.toLowerCase()),
      authorPlayer: p.id,
      authorFace: Object.fromEntries(
        ["id", "name", "pos", "face", "headshot", "generated"]
          .filter((k) => p[k] !== undefined)
          .map((k) => [k, p[k]]),
      ),
      team: x.team,
      year: s.year,
      week: s.week,
      topic: "Players",
      tone: p.injury
        ? "Recovery"
        : form && form < 6.2
          ? "Accountability"
          : "Inside the team",
      body,
      reputation: v,
      likes: Math.round(v.audience * 0.008 + (hash(p.id + s.week) % 500)),
      comments: [
        {
          name: "Maya / Section 214",
          stance: "Supporter",
          text: p.injury
            ? "Take the time you need. I would rather see a proper return than a rushed one."
            : Number.isFinite(st[metric])
              ? `${fmt(st[metric])} ${label} this season. Keep building on the good plays.`
              : "Looking forward to seeing the preparation turn into game-day production.",
        },
        {
          name: "Route Detail",
          replyTo: "Maya / Section 214",
          stance: "Performance",
          text: Number.isFinite(form)
            ? `${form >= 7 ? "The recent consistency is encouraging." : "The next step is turning those practice details into consistent execution."} I want to see that carry into the next matchup.`
            : "We have not seen enough football yet to judge the trend. Let the performances give us something to discuss.",
        },
        {
          name: "Noah on Sundays",
          replyTo: "Route Detail",
          stance: "Perspective",
          text: `${v.label} does not mean every week will be perfect. The interesting part is how the player responds over several games.`,
        },
      ],
    });
  }
  for (const pos of ["QB", "RB", "WR", "DL"]) {
    const mine = own
      .filter((x) => x.p.pos === pos)
      .sort((a, b) => b.p.ovr - a.p.ovr)[0];
    if (!mine) continue;
    const peers = all
      .filter((x) => x.team !== s.team && x.p.pos === pos)
      .sort(
        (a, b) =>
          Math.abs(a.recognition - mine.recognition) +
          Math.abs(a.p.ovr - mine.p.ovr) -
          (Math.abs(b.recognition - mine.recognition) +
            Math.abs(b.p.ovr - mine.p.ovr)),
      );
    if (peers[0]) posts.push(comparison(s, mine, peers[0], pos));
  }
  posts.push(
    ...(prefs.socialSnapshots || []).filter(
      (p) =>
        prefs.socialSaved.includes(p.id) && !posts.some((x) => x.id === p.id),
    ),
  );
  return posts.sort(
    (a, b) =>
      b.year - a.year ||
      b.week - a.week ||
      (a.feedOrder ?? 0) - (b.feedOrder ?? 0) ||
      a.id.localeCompare(b.id),
  );
}
export function castSocialVote(s, posts, id, index) {
  const post = posts.find((p) => p.id === id);
  if (
    !post?.poll ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= post.poll.options.length
  )
    throw Error("This poll is no longer available.");
  const o = s.franchise.office.hub;
  o.socialVotes ??= {};
  o.socialVotes[id] = index;
  const ids = Object.keys(o.socialVotes);
  if (ids.length > 300) delete o.socialVotes[ids[0]];
}
