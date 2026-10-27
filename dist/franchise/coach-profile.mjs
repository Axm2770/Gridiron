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
