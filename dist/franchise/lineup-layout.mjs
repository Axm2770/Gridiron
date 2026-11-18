// Formation layout for the visual lineup (Squad, Tactics and the matchday Team lineup).
// Pure: positions come from formation templates on a fixed field grid measured in "field
// units": the field is FIELD.W = 100 units wide; its height is the window around the formation
// (LOS band + the unit's depth + an end-zone band), so a shallow shotgun gets a short, wide field
// with big cards and a deep I formation a taller one. Defense is mirrored: LOS near the bottom,
// the secondary towards the top. Sizes are relative, so the same layout holds at every screen
// size, CSS zoom or --ui-scale.
// Slot indices are the match engine's (engine/execution.mjs buildActors):
//   offense 0 QB · 1 RB · 2,3 WR (TE in Goal Line) · 4 TE (WR in 10) · 5–9 OL · 10 WR (TE in 12, RB in 21)
//   defense 0–3 DL (3 is an LB in the 3–4) · 4–6 LB (6 CB in Nickel/Dime, 5 CB in Dime) · 7,8 CB · 9,10 S

export const FIELD = Object.freeze({
  W: 100,
  side: 4.2, // sideline strip on each side (yard numbers live there)
  los: 10, // template line of scrimmage (the final window moves it)
  zoneH: 3.6, // end-zone band height
  pad: 1.2, // turf between the deepest card and the end zone
  tw: 9.4, // token width
  th: 10.8, // token height
  row: 11.8, // distance between rows behind the line
  gap: 0.8, // minimum gap between tokens
});

const { W, side, los, tw, th, row, gap } = FIELD;
const minX = side + tw / 2 + 0.4,
  maxX = W - side - tw / 2 - 0.4;
const OL_STEP = tw + gap;
const olX = (i) => 50 + (i - 2) * OL_STEP;
const tackleEdge = olX(4) + tw / 2; // right edge of the right tackle
const besideRight = tackleEdge + gap + tw / 2,
  besideLeft = 100 - besideRight;
const WIDE_L = minX,
  WIDE_R = maxX,
  SLOT_L = WIDE_L + tw + 0.65,
  SLOT_R = 100 - SLOT_L;

// Short slot labels shown on tokens and lists: LT LG C RG RT on the line, numbered otherwise.
const OL_LABELS = ["LT", "LG", "C", "RG", "RT"];
export function slotLabels(actors) {
  const total = {},
    seen = {};
  for (const a of actors) total[a.role] = (total[a.role] || 0) + 1;
  return actors.map((a) => {
    const n = (seen[a.role] = (seen[a.role] || 0) + 1);
    if (a.role === "OL" && total.OL === 5) return OL_LABELS[n - 1];
    return total[a.role] > 1 ? `${a.role}${n}` : a.role;
  });
}

function offenseSpot(a, i, m, roles) {
  const f = m.offense || "Shotgun spread",
    pers = m.personnel || "11",
    under = f === "Singleback" || f === "I formation",
    twoBacks = roles[10] === "RB";
  if (a.role === "OL") return [olX(Math.max(0, i - 5)), 0];
  switch (i) {
    case 0:
      return [50, under ? 1 : 1.4];
    case 1:
      if (f === "Empty backfield") return [SLOT_R, 1.7];
      if (f === "I formation") return [50, twoBacks ? 3 : 2.6];
      if (f === "Singleback") return [50, 2];
      return [61, 1.4];
    case 2:
      return a.role === "TE" ? [besideLeft, 0] : [WIDE_L, 0];
    case 3:
      return a.role === "TE" ? [WIDE_R, 0.62] : [WIDE_R, 0];
    case 4:
      return a.role === "TE" ? [besideRight, 0] : [SLOT_R, 0.62];
    case 10:
      if (a.role === "TE") return [besideLeft, 0];
      if (a.role === "RB") {
        if (f === "I formation") return [50, 2];
        if (f === "Empty backfield") return [SLOT_L, 0.62];
        if (f === "Singleback") return [38.5, 1.25];
        return [39, 1.4];
      }
      return pers === "Goal Line" ? [WIDE_L, 0] : [SLOT_L, 0.62];
  }
  return [50, 2];
}

function defenseSpot(a, i, m, roles) {
  const front = m.defense || "Nickel",
    shell = m.shell || "2-High";
  if (i <= 3 && a.role === "DL") {
    const n = roles.slice(0, 4).filter((r) => r === "DL").length,
      step = tw + 1.2;
    return [50 + (i - (n - 1) / 2) * step, 0];
  }
  if (a.role === "LB") {
    const lbs = roles.map((r, k) => (r === "LB" ? k : -1)).filter((k) => k >= 0),
      n = lbs.length,
      k = lbs.indexOf(i),
      step = n >= 4 ? 14.3 : 14;
    return [50 + (k - (n - 1) / 2) * step, 1.1];
  }
  if (a.role === "CB") {
    if (i === 7) return [WIDE_L, 0.25];
    if (i === 8) return [WIDE_R, 0.25];
    if (i === 6) return [front === "Dime" ? 78 : 22, 0.65];
    if (i === 5) return [22, 0.65];
  }
  if (a.role === "S") {
    const first = i === 9;
    if (shell === "Single-High") return first ? [24, 2.15] : [50, 2.45];
    if (shell === "Zero") return first ? [24, 2.1] : [76, 2.1];
    return first ? [28, 2.25] : [72, 2.25];
  }
  return [50, 2];
}

const rect = (t) => ({ l: t.x - tw / 2, r: t.x + tw / 2, t: t.y, b: t.y + th });
const hit = (a, b, pad = 0) => {
  const p = rect(a),
    q = rect(b);
  return p.l < q.r + pad && q.l < p.r + pad && p.t < q.b + pad && q.t < p.b + pad;
};

// Safety net: push apart any tokens that still touch (new formations, odd personnel).
function separate(tokens) {
  let adjusted = 0;
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let i = 0; i < tokens.length; i++)
      for (let j = i + 1; j < tokens.length; j++) {
        const a = tokens[i],
          b = tokens[j];
        if (!hit(a, b, 0.5)) continue;
        moved = true;
        adjusted++;
        const dx = b.x - a.x,
          need = tw + gap - Math.abs(dx);
        if (need > 0 && need < tw * 0.75) {
          const s = dx === 0 ? (j % 2 ? 1 : -1) : Math.sign(dx);
          a.x -= (s * need) / 2;
          b.x += (s * need) / 2;
        } else b.y = a.y + th + gap;
        for (const t of [a, b]) t.x = Math.min(maxX, Math.max(minX, t.x));
      }
    if (!moved) break;
  }
  return adjusted;
}

// formationLayout(actors, unit, settings) → { field: FIELD, tokens: [{ index, role, label, x, y, w, h, left, top, width, height }] }
// x is the token centre and y its top edge, in field units; left/top/width/height are percentages
// of the field box for CSS.
export function formationLayout(actors, unit = "Offense", m = {}) {
  const roles = actors.map((a) => a.role),
    labels = slotLabels(actors);
  let tokens = actors.map((a, i) => {
    let x, r;
    if (unit === "Specialists") [x, r] = [i ? 61 : 39, 1.2];
    else if (unit === "Defense") [x, r] = defenseSpot(a, a.index ?? i, m, roles);
    else [x, r] = offenseSpot(a, a.index ?? i, m, roles);
    return { index: a.index ?? i, role: a.role, label: labels[i], x: Math.min(maxX, Math.max(minX, x)), y: los + 0.8 + r * row };
  });
  const adjusted = separate(tokens);
  // Window: the band above the LOS (first-down line, labels) grows with the formation's depth so
  // the line sits about a quarter to a third of the way down, then the depth, then the end zone.
  const depth = Math.max(...tokens.map((t) => t.y + th)) - los,
    band = Math.min(15, Math.max(12.5, depth * 0.4)),
    H = +(band + depth + FIELD.pad + FIELD.zoneH).toFixed(2),
    flip = unit === "Defense";
  for (const t of tokens) {
    t.y = t.y - los + band;
    if (flip) t.y = H - t.y - th;
  }
  const field = {
    ...FIELD,
    H,
    flip,
    los: flip ? H - band : band,
    band,
    zoneTop: flip ? 0 : H - FIELD.zoneH,
    zoneBottom: flip ? FIELD.zoneH : H,
  };
  return {
    field,
    adjusted,
    tokens: tokens.map((t) => ({
      ...t,
      w: tw,
      h: th,
      left: +(((t.x - tw / 2) / W) * 100).toFixed(3),
      top: +((t.y / H) * 100).toFixed(3),
      width: +((tw / W) * 100).toFixed(3),
      height: +((th / H) * 100).toFixed(3),
    })),
  };
}

// Pixel rectangles of the tokens for a field drawn `widthPx` wide (tests and debugging).
export function tokenRects(layout, widthPx) {
  const u = widthPx / FIELD.W;
  return layout.tokens.map((t) => ({
    index: t.index,
    left: Math.round((t.x - tw / 2) * u),
    top: Math.round(t.y * u),
    right: Math.round((t.x + tw / 2) * u),
    bottom: Math.round((t.y + th) * u),
  }));
}

// Pairs of overlapping rectangles ({left, top, right, bottom}); empty when the layout is clean.
export function overlappingPairs(rects) {
  const out = [];
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i],
        b = rects[j];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) out.push([a.index ?? i, b.index ?? j]);
    }
  return out;
}
