export const COACH_ATTRIBUTES = [
  "offense",
  "defense",
  "tactics",
  "development",
  "motivation",
  "discipline",
  "medical",
  "adaptability",
];
export const COACH_BUDGET = 104;
export const BACKGROUNDS = {
  "Former Player": {
    offense: 14,
    defense: 14,
    tactics: 12,
    development: 12,
    motivation: 16,
    discipline: 13,
    medical: 10,
    adaptability: 13,
  },
  "Analytics Guru": {
    offense: 14,
    defense: 14,
    tactics: 17,
    development: 12,
    motivation: 10,
    discipline: 12,
    medical: 12,
    adaptability: 13,
  },
  "College Innovator": {
    offense: 15,
    defense: 10,
    tactics: 14,
    development: 18,
    motivation: 14,
    discipline: 10,
    medical: 10,
    adaptability: 13,
  },
};
export const DEFAULT_APPEARANCE = {
  skin: "#b77b51",
  hair: "#24201c",
  hairStyle: "Short",
  beard: "Stubble",
  outfit: "Polo",
  jacket: "#204c68",
  build: "Athletic",
  height: 183,
  glasses: false,
  headset: true,
};
export function defaultCoach(team = 16) {
  return {
    saveName: "My coaching career",
    name: "Alex Morgan",
    age: 38,
    nationality: "United States",
    team,
    role: "HC",
    background: "Former Player",
    experience: "Coordinator",
    style: "Balanced",
    personality: "Players coach",
    attributes: { ...BACKGROUNDS["Former Player"] },
    appearance: { ...DEFAULT_APPEARANCE },
  };
}
export function validateCoach(profile) {
  if (
    !profile ||
    !String(profile.name || "").trim() ||
    profile.name.length > 40
  )
    throw Error("Enter a coach name, up to 40 characters.");
  if (!String(profile.saveName || "").trim() || profile.saveName.length > 60)
    throw Error("Name this career, up to 60 characters.");
  if (
    !Number.isInteger(Number(profile.age)) ||
    profile.age < 25 ||
    profile.age > 80
  )
    throw Error("Coach age must be between 25 and 80.");
  if (
    !Number.isInteger(Number(profile.team)) ||
    profile.team < 0 ||
    profile.team > 31
  )
    throw Error("Choose an NFL franchise.");
  if (!["Owner", "GM", "HC", "OC", "DC"].includes(profile.role))
    throw Error("Choose a career role.");
  if (
    !Object.hasOwn(BACKGROUNDS, profile.background) ||
    !["First appointment", "Coordinator", "Veteran head coach"].includes(
      profile.experience,
    ) ||
    !["Balanced", "Run-first", "Vertical offense"].includes(profile.style) ||
    !["Players coach", "Disciplinarian", "Tactician"].includes(
      profile.personality,
    )
  )
    throw Error("Choose a supported coaching background and style.");
  const values = COACH_ATTRIBUTES.map((k) => Number(profile.attributes[k]));
  if (
    values.some((n) => !Number.isInteger(n) || n < 1 || n > 20) ||
    values.reduce((a, b) => a + b, 0) > COACH_BUDGET
  )
    throw Error(
      "Distribute at most 104 points, with each attribute between 1 and 20.",
    );
  const a = profile.appearance;
  if (
    !a ||
    !["Short", "Curly", "Bald"].includes(a.hairStyle) ||
    !["None", "Stubble", "Full"].includes(a.beard) ||
    !["Polo", "Tracksuit", "Suit"].includes(a.outfit) ||
    !["Lean", "Athletic", "Broad"].includes(a.build) ||
    a.height < 160 ||
    a.height > 205 ||
    !["skin", "hair", "jacket"].every((k) => /^#[0-9a-f]{6}$/i.test(a[k]))
  )
    throw Error("Choose a valid coach appearance.");
  return true;
}
export function applyCoach(s, p) {
  validateCoach(p);
  s.franchise.userCoach = structuredClone(p);
  s.franchise.role = p.role;
  s.coach = {
    ...s.coach,
    name: p.name,
    style: p.style,
    temperament: p.personality,
    calling: "Manual",
  };
  const c = s.franchise.career;
  c.origin = p.background;
  c.reputation =
    p.experience === "Veteran head coach"
      ? 75
      : p.experience === "Coordinator"
        ? 55
        : 35;
  if (s.franchise.coachReputation) {
    s.franchise.coachReputation.value = c.reputation;
    s.franchise.coachReputation.ledger = [];
    s.franchise.coachReputation.seen = [];
  }
  c.archetype =
    p.attributes.development >= 16
      ? "Development Wizard"
      : p.attributes.offense >= p.attributes.defense
        ? "Offensive Guru"
        : "Defensive Genius";
  c.avatar = { skin: p.appearance.skin, shirt: p.appearance.jacket };
  if (p.role === "HC") {
    const staff = s.franchise.clubs?.[s.team]?.staff;
    const hc = staff?.find((c) => c.role === "HC");
    if (hc) {
      hc.name = p.name;
      hc.rating = Math.round(
        (Object.values(p.attributes).reduce((a, b) => a + b, 0) /
          COACH_ATTRIBUTES.length) *
          5,
      );
    }
  }
  c.skills = {
    offense: Math.floor(p.attributes.offense / 5),
    defense: Math.floor(p.attributes.defense / 5),
    development: Math.floor(p.attributes.development / 5),
    cap: 0,
  };
  return s;
}

// Career setup (role, background, archetype) is fixed once the career is created. The only
// in-career route to a different role is a career event: accepting a job offer or a promotion.
export const CAREER_SETUP_LOCKED =
  "Your role, background and archetype were set when this career began. Start a new career, or accept a job offer, to take a different role.";
export function careerSetupLocked() {
  return Error(CAREER_SETUP_LOCKED);
}
const LOCKED_FIELDS = ["role", "origin", "background", "archetype"];
const HEX = /^#[0-9a-f]{6}$/i;
// Appearance stays editable mid-career: it is cosmetic and never feeds results.
export function updateCareerAppearance(s, changes = {}) {
  if (!changes || typeof changes !== "object")
    throw Error("Choose a valid coach appearance.");
  if (LOCKED_FIELDS.some((k) => Object.hasOwn(changes, k)))
    throw careerSetupLocked();
  const extra = Object.keys(changes).filter((k) => k !== "avatar");
  if (extra.length) throw Error("Only the coach's appearance can be changed.");
  const { shirt, skin } = changes.avatar || {};
  if (!HEX.test(shirt || "") || !HEX.test(skin || ""))
    throw Error("Choose a valid coach appearance.");
  const c = s.franchise.career;
  c.avatar = { ...(c.avatar || {}), shirt, skin };
  if (s.franchise.userCoach?.appearance) {
    s.franchise.userCoach.appearance.jacket = shirt;
    s.franchise.userCoach.appearance.skin = skin;
  }
  return s;
}

/* ---------- New-career wizard helpers (read-only presets and copy) ---------- */
// Swatches offered by the coach creator. Every value is a #rrggbb colour validateCoach accepts;
// the wizard also offers the club colour for the jacket and a custom picker.
export const APPEARANCE_SWATCHES = {
  skin: ["#f1c7a5", "#e0ac84", "#c68c63", "#b77b51", "#8d5a3b", "#5e3b26"],
  hair: ["#24201c", "#4a3426", "#7a5232", "#b98a4e", "#d9c7a0", "#8c8c8c"],
  jacket: ["#204c68", "#1d2b3a", "#2f3a2f", "#6b1f2a", "#3a3f4a", "#d8d8d0"],
};
// What each coaching choice actually changes in the game (coach-profile applyCoach,
// career-systems coachPerks, development.mjs training, match.js temperament, game-plan STYLES).
export const PHILOSOPHY = {
  background: {
    "Former Player": {
      tag: "Motivator",
      effect: "Players buy in. Motivation lifts weekly training performance.",
    },
    "Analytics Guru": {
      tag: "Game planner",
      effect: "The sharpest tactical mind of the three, but a quieter locker room.",
    },
    "College Innovator": {
      tag: "Developer",
      effect: "Players improve faster in training. You start as a Development Wizard.",
    },
  },
  experience: {
    "First appointment": {
      tag: "Reputation 35",
      effect: "Under scrutiny: players ask about 3% more and are harder to recruit.",
    },
    Coordinator: {
      tag: "Reputation 55",
      effect: "Building credibility: close to neutral contract demands and recruiting.",
    },
    "Veteran head coach": {
      tag: "Reputation 75",
      effect: "Highly respected: about 5% cheaper contracts, cheaper staff, easier recruiting and prestige job offers.",
    },
  },
  style: {
    Balanced: { tag: "Default", effect: "A mix of runs and passes." },
    "Run-first": { tag: "Ground game", effect: "Runs on early downs, then play action." },
    "Vertical offense": { tag: "Air raid", effect: "Deep shots. More big plays, more incompletions." },
  },
  personality: {
    "Players coach": { tag: "Stamina", effect: "Starters lose 10% less energy per snap." },
    Disciplinarian: { tag: "Execution", effect: "Small execution bonus when team morale is 70% or higher." },
    Tactician: { tag: "Scheme fit", effect: "Small execution bonus when your formation fits the play call." },
  },
};
// The archetype applyCoach records for these attributes.
export function coachArchetype(attributes) {
  return attributes.development >= 16
    ? "Development Wizard"
    : attributes.offense >= attributes.defense
      ? "Offensive Guru"
      : "Defensive Genius";
}
// Default career save name until the player types their own.
export function autoSaveName(name, club) {
  return `${String(name || "").trim() || "Coach"} · ${club}`.slice(0, 60);
}
