// Pure helpers behind franchise actions in ui.mjs (no DOM), kept separate so tests can import them.

// Training camp runs through the offseason until the first game of the season is played.
export const campOpen = (s) =>
  s.phase === "offseason" ||
  (s.phase === "season" &&
    !s.schedule?.some((round) =>
      round.some((g) => g.score && (g.a === s.team || g.b === s.team)),
    ));
// What the player sees after a roster operation, instead of a generic "Franchise updated".
export function actionMessage(name, rosterDelta = 0) {
  const n = Math.abs(rosterDelta),
    players = (k) => `${k} player${k === 1 ? "" : "s"}`;
  switch (name) {
    case "camp":
      return n
        ? `${players(n)} invited to camp. Trim the active roster to 53 before the next game.`
        : "The camp roster is already full (90 players).";
    case "recruit":
      return n
        ? `The scouts signed ${players(n)} to fill thin positions.`
        : "Every position already has enough healthy depth.";
    case "trim":
      return "Active roster trimmed to 53.";
    case "directive":
      return "Directive saved.";
    case "ticket":
      return "Ticket price updated.";
    case "move":
      return "Roster designation updated.";
    case "protect":
      return "Practice-squad protection updated.";
    default:
      return "Franchise updated";
  }
}
