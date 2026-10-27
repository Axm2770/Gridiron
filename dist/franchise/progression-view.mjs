// Presentation deliberately exposes direction, never a numeric development delta.
export const attributeLabel = (key) =>
  ({
    throwPower: "Throw Power",
    throwAccuracyShort: "Short Accuracy",
    throwAccuracyMid: "Medium Accuracy",
    throwAccuracyDeep: "Deep Accuracy",
    shortRouteRunning: "Route Running",
    changeOfDirection: "Change of Direction",
    breakTackle: "Break Tackle",
    passBlock: "Pass Blocking",
    runBlock: "Run Blocking",
    manCoverage: "Man Coverage",
    zoneCoverage: "Zone Coverage",
    kickPower: "Kick Power",
    kickAccuracy: "Kick Accuracy",
    injury: "Durability",
  })[key] ||
  key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
export function progressionView(p) {
  const h = (p.progression?.history || []).slice(-4),
    delta = h.reduce((n, r) => n + (r.delta || 0), 0),
    attributes = {};
  for (const r of h)
    for (const [k, v] of Object.entries(r.attributeDirections || {}))
      attributes[k] = (attributes[k] || 0) + v;
  const movement = Object.entries(attributes)
    .filter(([, v]) => Math.abs(v) >= 0.005)
    .map(([key, v]) => ({
      key,
      label: attributeLabel(key),
      direction: v > 0 ? "up" : "down",
      arrow: v > 0 ? "▲" : "▼",
    }));
  const last = h.at(-1),
    ovrDelta = h.length > 1 ? last.ovr - h[0].ovr : 0;
  const direction =
    ovrDelta > 0
      ? "up"
      : ovrDelta < 0
        ? "down"
        : delta > 0.015
          ? "up"
          : delta < -0.015
            ? "down"
            : "stable";
  return {
    status: { up: "Improving", down: "Declining", stable: "Stable" }[direction],
    direction,
    attributes: movement,
  };
}
