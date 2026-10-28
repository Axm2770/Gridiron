// In-engine cinematics for narrative moments (title celebration, draft night, press podium,
// playoff exit, walk-off win, locker-room confrontation). Built from the same rigged
// characters as the conversation scenes, played full-screen with letterbox, titles and skip.
// Read-only over state and the narrative event log.
import * as THREE from "../vendor/three.module.js";
import { createCharacter, appearanceFor } from "../franchise/character-stage.mjs";
import { eventsSince } from "../franchise/event-bus.mjs";
import { TEAM_COLORS } from "../bridge/ue-protocol.mjs";

export const SCENES = {
  Championship: { priority: 100, major: true, duration: 9 },
  DraftPick: { priority: 80, major: true, duration: 7 },
  PlayoffElimination: { priority: 70, major: true, duration: 7 },
  ClutchFinish: { priority: 60, major: false, duration: 6.5 },
  LockerRoomDilemma: { priority: 50, major: false, duration: 6 },
  PressConference: { priority: 40, major: false, duration: 5 },
};

export function cinematicPreference() {
  try {
    return localStorage.getItem("gridiron-cinematics") || "all";
  } catch {
    return "all";
  }
}

// Picks the one moment worth showing from a batch of new events.
export function pickCinematic(events, pref = cinematicPreference()) {
  if (pref === "off") return null;
  return (
    events
      .filter((e) => SCENES[e.kind] && (pref === "all" || SCENES[e.kind].major))
      .sort((a, b) => SCENES[b.kind].priority - SCENES[a.kind].priority)[0] ?? null
  );
}

/* ------------------------------------------------------------------ props */

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
function add(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
const box = (p, w, h, d, mat, x, y, z) => add(p, new THREE.BoxGeometry(w, h, d), mat, x, y, z);

function textPanel(lines, { w = 1024, h = 512, bg = "#0b1320", accent = "#3b6cc8" } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, accent);
  g.addColorStop(1, bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,.06)";
  for (let x = -h; x < w; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + h, 0);
    ctx.lineTo(x + h + 20, 0);
    ctx.lineTo(x + 20, h);
    ctx.fill();
  }
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  lines.forEach(([text, size, y]) => {
    // Long names shrink to fit rather than run off the screen.
    do ctx.font = `800 ${size}px 'Barlow Condensed', Arial`;
    while (ctx.measureText(text).width > w * 0.88 && (size -= 4) > 20);
    ctx.fillText(text, w / 2, y);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function trophy(parent, x, y, z) {
  const silver = std("#e4e8ec", { metalness: 1, roughness: 0.18 }),
    g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  add(g, new THREE.CylinderGeometry(0.16, 0.2, 0.12, 24), std("#1a1a1a", { roughness: 0.3 }), 0, 0.06, 0);
  const profile = [
    [0.02, 0],
    [0.09, 0.02],
    [0.05, 0.1],
    [0.035, 0.32],
    [0.05, 0.42],
    [0.02, 0.46],
  ].map(([r, h]) => new THREE.Vector2(r, h));
  add(g, new THREE.LatheGeometry(profile, 24), silver, 0, 0.12, 0);
  const ball = add(g, new THREE.SphereGeometry(0.11, 20, 12), silver, 0, 0.66, 0);
  ball.scale.set(1, 0.62, 0.62);
  ball.rotation.z = 0.5;
  return g;
}

function confetti(scene, colors, count = 900, area = 8) {
  const pos = new Float32Array(count * 3),
    col = new Float32Array(count * 3),
    vel = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([(Math.random() - 0.5) * area, 3 + Math.random() * 6, (Math.random() - 0.5) * area], i * 3);
    const c = new THREE.Color(colors[i % colors.length]);
    col.set([c.r, c.g, c.b], i * 3);
    vel[i] = 0.4 + Math.random() * 0.9;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.07, vertexColors: true }));
  scene.add(pts);
  return (dt, time) => {
    for (let i = 0; i < count; i++) {
      pos[i * 3] += Math.sin(time * 2 + i) * 0.004;
      pos[i * 3 + 1] -= vel[i] * dt;
      if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 6 + Math.random() * 3;
    }
    geo.attributes.position.needsUpdate = true;
  };
}

function fireworks(scene, colors) {
  const bursts = [];
  return (dt, time) => {
    if (Math.random() < dt * 1.6) {
      const n = 160,
        pos = new Float32Array(n * 3),
        vel = [],
        origin = new THREE.Vector3((Math.random() - 0.5) * 30, 14 + Math.random() * 6, -18 - Math.random() * 10);
      for (let i = 0; i < n; i++) {
        pos.set([origin.x, origin.y, origin.z], i * 3);
        vel.push(new THREE.Vector3().randomDirection().multiplyScalar(4 + Math.random() * 3));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ size: 0.35, color: colors[(Math.random() * colors.length) | 0], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const pts = new THREE.Points(geo, mat);
      scene.add(pts);
      bursts.push({ pts, vel, age: 0 });
    }
    for (const b of bursts) {
      b.age += dt;
      const p = b.pts.geometry.attributes.position.array;
      b.vel.forEach((v, i) => {
        v.y -= 3 * dt;
        p[i * 3] += v.x * dt;
        p[i * 3 + 1] += v.y * dt;
        p[i * 3 + 2] += v.z * dt;
      });
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, 1 - b.age / 1.8);
    }
    while (bursts.length && bursts[0].age > 1.8) {
      const b = bursts.shift();
      scene.remove(b.pts);
      b.pts.geometry.dispose();
      b.pts.material.dispose();
    }
  };
}

function lights(scene, { key = "#fff1dc", rim = "#7fb6ff", ambient = 1.1, keyI = 3.2 } = {}) {
  scene.add(new THREE.HemisphereLight("#c9dcff", "#2a2420", ambient));
  const k = new THREE.DirectionalLight(key, keyI);
  k.position.set(4, 8, 6);
  k.castShadow = true;
  k.shadow.mapSize.set(2048, 2048);
  Object.assign(k.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
  scene.add(k);
  const r = new THREE.DirectionalLight(rim, 2.2);
  r.position.set(-5, 4, -6);
  scene.add(r);
}

function spotCone(scene, x, z, color = "#fff6e0") {
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 9, 32, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  cone.position.set(x, 4.5, z);
  scene.add(cone);
  const s = new THREE.SpotLight(color, 60, 20, 0.35, 0.6);
  s.position.set(x, 9, z);
  s.target.position.set(x, 0, z);
  scene.add(s, s.target);
}

function player(team, p) {
  const rig = createCharacter({ ...appearanceFor(p || {}), jacket: TEAM_COLORS[team], outfit: "Tracksuit", headset: false }, { player: true });
  return rig;
}
function coach() {
  return createCharacter({ ...appearanceFor({ name: state.coach?.name }), ...(state.coach?.appearance || {}), outfit: "Suit", headset: false });
}

const star = () => state.roster.filter((p) => !p.injury).sort((a, b) => b.ovr - a.ovr)[0];

/* ----------------------------------------------------------------- scenes */
// Each builder returns { scene, shots, update(dt,time,u), title }.

function championship(e) {
  const scene = new THREE.Scene(),
    color = TEAM_COLORS[e.team];
  scene.background = new THREE.Color("#04060c");
  scene.fog = new THREE.Fog("#04060c", 18, 60);
  lights(scene, { ambient: 0.6 });
  box(scene, 60, 0.1, 40, std("#1f5b35", { roughness: 0.95 }), 0, -0.05, 0);
  for (let x = -25; x <= 25; x += 5) box(scene, 0.12, 0.02, 40, std("#e8eedc"), x, 0.01, 0);
  box(scene, 5, 0.5, 3, std("#111821", { metalness: 0.4, roughness: 0.3 }), 0, 0.25, 0);
  box(scene, 5.2, 0.06, 3.2, std(color, { emissive: color, emissiveIntensity: 0.6 }), 0, 0.52, 0);
  const c = coach(),
    s = player(e.team, star());
  c.group.position.set(-0.55, 0.55, 0.2);
  s.group.position.set(0.6, 0.55, 0.1);
  scene.add(c.group, s.group);
  const cup = trophy(scene, -0.25, 1.5, 0.55);
  spotCone(scene, 0, 0.3);
  const fall = confetti(scene, [color, "#ffffff", "#ffd34d"]),
    boom = fireworks(scene, [color, "#ffd34d", "#ffffff"]);
  return {
    scene,
    title: { kicker: `${state.year} season`, headline: "CHAMPIONS", sub: `${clubs[e.team][1]} ${clubs[e.team][2]}${e.score ? ` · ${e.score[0]}–${e.score[1]}` : ""}` },
    shots: [
      { t: 0, pos: [0, 1.2, 14], look: [0, 1.5, 0], fov: 30 },
      { t: 0.35, pos: [5, 2.4, 7], look: [0, 1.6, 0], fov: 32 },
      { t: 0.7, pos: [-1.8, 1.6, 3.2], look: [-0.2, 2, 0.4], fov: 30 },
      { t: 1, pos: [0, 3.5, 6], look: [0, 2.2, 0], fov: 38 },
    ],
    update(dt, time, u) {
      const lift = Math.min(1, Math.max(0, (u - 0.45) / 0.2));
      c.arms[1].rotation.x = -2.9 * lift;
      s.arms[0].rotation.x = -2.6 * lift;
      cup.position.set(-0.25 + 0.15 * lift, 1.5 + 0.95 * lift, 0.55);
      c.head.rotation.x = -0.25 * lift;
      fall(dt, time);
      boom(dt, time);
    },
  };
}

function draftNight(e) {
  const scene = new THREE.Scene(),
    color = TEAM_COLORS[e.team];
  scene.background = new THREE.Color("#05070b");
  lights(scene, { ambient: 0.5, keyI: 2.4 });
  box(scene, 14, 0.4, 7, std("#0e131a", { roughness: 0.25, metalness: 0.4 }), 0, 0.2, 0);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 5),
    new THREE.MeshBasicMaterial({ map: textPanel([[`ROUND ${e.round ?? 1}`, 70, 120], [String(e.playerName || "THE PICK").toUpperCase(), 120, 280], [`${clubs[e.team][1].toUpperCase()} ${clubs[e.team][2].toUpperCase()}`, 60, 400]], { accent: color }), toneMapped: false }),
  );
  screen.position.set(0, 3.2, -3);
  scene.add(screen);
  box(scene, 1, 1.2, 0.6, std("#1b2430", { metalness: 0.5, roughness: 0.3 }), -1.6, 0.98, 0.8);
  const prospect = createCharacter({ ...appearanceFor({ name: e.playerName }), outfit: "Suit", jacket: "#1d2530", headset: false }),
    host = createCharacter({ ...appearanceFor({ name: "Commissioner" }), outfit: "Suit", jacket: "#2b2f36", headset: false });
  prospect.group.position.set(0.9, 0.4, 0.9);
  host.group.position.set(-1.6, 0.4, 0.3);
  prospect.group.rotation.y = -0.35;
  host.group.rotation.y = 0.35;
  scene.add(prospect.group, host.group);
  spotCone(scene, 0.9, 0.9);
  spotCone(scene, -1.6, 0.3, "#cfe0ff");
  return {
    scene,
    title: { kicker: "Draft night", headline: String(e.playerName || "The pick is in").toUpperCase(), sub: `Round ${e.round ?? 1} · ${clubs[e.team][2]}` },
    shots: [
      { t: 0, pos: [0, 2.5, 13], look: [0, 2.6, -2], fov: 34 },
      { t: 0.5, pos: [2.8, 2.1, 6.2], look: [0.5, 1.9, 0.5], fov: 32 },
      { t: 1, pos: [2.2, 2.05, 5.2], look: [0.8, 1.95, 0.9], fov: 30 },
    ],
    update(dt, time, u) {
      const wave = Math.max(0, Math.sin(Math.min(1, Math.max(0, (u - 0.55) / 0.4)) * Math.PI));
      prospect.arms[1].rotation.x = -2.4 * wave;
      prospect.head.rotation.y = Math.sin(time * 0.8) * 0.12;
    },
  };
}

function podium(e) {
  const scene = new THREE.Scene(),
    color = TEAM_COLORS[e.team];
  scene.background = new THREE.Color("#0b111a");
  lights(scene, { ambient: 1.2, keyI: 2.8 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshStandardMaterial({ map: textPanel([[clubs[e.team][0], 150, 300]], { accent: color, bg: "#0e1620" }), roughness: 0.8 }));
  wall.position.set(0, 2, -1.2);
  scene.add(wall);
  box(scene, 1, 1.15, 0.55, std("#3a2a1f", { roughness: 0.5 }), 0, 0.58, 0.3);
  add(scene, new THREE.CylinderGeometry(0.012, 0.012, 0.35, 8), std("#111"), 0.12, 1.32, 0.35).rotation.x = -0.6;
  const c = coach();
  c.group.position.set(0, 0, -0.15);
  scene.add(c.group);
  const flashes = [];
  return {
    scene,
    title: { kicker: "Press conference", headline: `“${e.quote || "We move forward."}”`, sub: state.coach?.name || "Head coach" },
    shots: [
      { t: 0, pos: [0, 1.6, 6], look: [0, 1.5, 0], fov: 30 },
      { t: 1, pos: [0.6, 1.62, 2.6], look: [0, 1.6, 0], fov: 26 },
    ],
    update(dt, time) {
      c.head.rotation.y = Math.sin(time * 0.9) * 0.08;
      c.arms[0].rotation.x = -0.35 - Math.sin(time * 1.4) * 0.15;
      if (Math.random() < dt * 4) {
        const f = new THREE.PointLight("#ffffff", 30, 6);
        f.position.set((Math.random() - 0.5) * 4, 1.4, 2.5);
        scene.add(f);
        flashes.push({ f, age: 0 });
      }
      for (const x of flashes) x.age += dt;
      while (flashes.length && flashes[0].age > 0.08) scene.remove(flashes.shift().f);
    },
  };
}

function lockerRoom(e, { somber }) {
  const scene = new THREE.Scene(),
    color = TEAM_COLORS[e.team];
  scene.background = new THREE.Color("#07090d");
  lights(scene, { ambient: somber ? 0.35 : 0.8, keyI: somber ? 1.4 : 2.6, key: "#ffe2bf" });
  box(scene, 12, 0.1, 8, std("#24282e", { roughness: 0.9 }), 0, -0.05, 0);
  const wood = std("#4a3424"),
    metal = std(color, { roughness: 0.45, metalness: 0.3 });
  for (let i = -4; i <= 4; i++) {
    box(scene, 0.9, 2.3, 0.6, metal, i * 1.0, 1.15, -2.6);
    box(scene, 0.86, 0.05, 0.55, std("#0c0f13"), i * 1.0, 1.5, -2.3);
  }
  box(scene, 7, 0.08, 0.5, wood, 0, 0.45, -1.5);
  const c = coach(),
    cast = [];
  // Coach stands to the side, facing the bench, so the camera has a clear line to the players.
  c.group.position.set(2.6, 0, 0.1);
  c.group.rotation.y = -Math.PI / 2 - 0.5;
  scene.add(c.group);
  const roster = state.roster.slice(0, 5);
  roster.forEach((p, i) => {
    const r = createCharacter({ ...appearanceFor(p), jacket: color, outfit: "Tracksuit", headset: false }, { player: true, seated: somber });
    r.group.position.set(-2 + i, somber ? 0 : 0, somber ? -1.5 : -0.6);
    if (somber) r.head.rotation.x = 0.45;
    scene.add(r.group);
    cast.push(r);
  });
  return {
    scene,
    title: somber ? { kicker: "Season over", headline: "THE LONG WALK", sub: `${clubs[e.team][2]} fall ${e.score ? `${e.score[0]}–${e.score[1]}` : "in the playoffs"}` } : { kicker: "Locker room", headline: String(e.headline || "A word with the team").toUpperCase(), sub: state.coach?.name || "" },
    shots: somber
      ? [
          { t: 0, pos: [-3.8, 1.9, 5.2], look: [0.3, 1.0, -1.5], fov: 36 },
          { t: 1, pos: [-0.6, 1.5, 3.8], look: [0.3, 1.05, -1.5], fov: 36 },
        ]
      : [
          { t: 0, pos: [-2.5, 1.7, 4.8], look: [0.6, 1.3, -0.4], fov: 36 },
          { t: 1, pos: [-0.6, 1.6, 3.0], look: [1.2, 1.4, -0.2], fov: 32 },
        ],
    update(dt, time) {
      c.arms[1].rotation.x = somber ? -0.1 : -0.6 - Math.sin(time * 1.6) * 0.3;
      cast.forEach((r, i) => (r.head.rotation.y = Math.sin(time * 0.5 + i) * 0.06));
    },
  };
}

function walkOff(e) {
  const scene = new THREE.Scene(),
    color = TEAM_COLORS[e.team];
  scene.background = new THREE.Color("#060a14");
  scene.fog = new THREE.Fog("#060a14", 15, 55);
  lights(scene, { ambient: 0.7 });
  box(scene, 60, 0.1, 40, std("#1f5b35", { roughness: 0.95 }), 0, -0.05, 0);
  const s = player(e.team, star()),
    mob = [];
  s.group.position.set(0, 0, 0);
  scene.add(s.group);
  for (let i = 0; i < 7; i++) {
    const r = player(e.team, state.roster[i + 1]);
    const a = (i / 7) * Math.PI * 2;
    r.group.position.set(Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3);
    r.group.rotation.y = -a - Math.PI / 2;
    scene.add(r.group);
    mob.push(r);
  }
  const boom = fireworks(scene, [color, "#ffffff"]);
  return {
    scene,
    title: { kicker: "Final", headline: "WALK-OFF", sub: `${clubs[e.team][2]} ${e.score ? `${e.score[0]}–${e.score[1]}` : ""}` },
    shots: [
      { t: 0, pos: [0, 8, 10], look: [0, 1, 0], fov: 40 },
      { t: 1, pos: [2.2, 1.6, 3], look: [0, 1.4, 0], fov: 32 },
    ],
    update(dt, time) {
      s.arms.forEach((arm) => (arm.rotation.x = -2.8));
      mob.forEach((r, i) => {
        r.group.position.y = Math.max(0, Math.sin(time * 7 + i)) * 0.35;
        r.arms[i % 2].rotation.x = -2.5;
      });
      boom(dt, time);
    },
  };
}

const BUILDERS = {
  Championship: championship,
  DraftPick: draftNight,
  PressConference: podium,
  PlayoffElimination: (e) => lockerRoom(e, { somber: true }),
  LockerRoomDilemma: (e) => lockerRoom(e, { somber: false }),
  ClutchFinish: walkOff,
};

/* ----------------------------------------------------------------- player */

const ease = (x) => x * x * (3 - 2 * x);
function sampleShot(shots, u) {
  let i = 0;
  while (i < shots.length - 2 && u > shots[i + 1].t) i++;
  const a = shots[i],
    b = shots[i + 1] || a,
    k = ease(Math.min(1, Math.max(0, (u - a.t) / Math.max(0.0001, b.t - a.t))));
  const lerp3 = (p, q) => p.map((v, j) => v + (q[j] - v) * k);
  return { pos: lerp3(a.pos, b.pos), look: lerp3(a.look, b.look), fov: a.fov + (b.fov - a.fov) * k };
}

let active = null;

export function playCinematic(event) {
  const build = BUILDERS[event.kind];
  if (!build || active) return false;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches,
    def = SCENES[event.kind],
    cut = build(event);
  const root = document.createElement("div");
  root.className = "gd-cine";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", `${cut.title.kicker}: ${cut.title.headline}`);
  root.innerHTML = `<div class="gd-cine-stage"></div><i class="gd-cine-bar gd-top"></i><i class="gd-cine-bar gd-bottom"></i><div class="gd-cine-title" style="--tc:${TEAM_COLORS[event.team] ?? "#3b6cc8"}"><span>${cut.title.kicker}</span><h2></h2><p></p></div><div class="gd-cine-controls"><select aria-label="Cinematics preference"><option value="all">All cinematics</option><option value="major">Big moments only</option><option value="off">Off</option></select><button class="gd-btn">Skip ▸</button></div><div class="gd-cine-progress"><i></i></div>`;
  root.querySelector("h2").textContent = cut.title.headline;
  root.querySelector("p").textContent = cut.title.sub;
  const select = root.querySelector("select");
  select.value = cinematicPreference();
  select.onchange = () => {
    try {
      localStorage.setItem("gridiron-cinematics", select.value);
    } catch {}
  };
  document.body.append(root);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch {
    root.remove();
    return false;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  root.querySelector(".gd-cine-stage").append(renderer.domElement);
  // A soft studio environment so metals (trophy, podium) reflect light instead of rendering black.
  const pmrem = new THREE.PMREMGenerator(renderer),
    studio = new THREE.Scene();
  studio.add(new THREE.Mesh(new THREE.BoxGeometry(20, 12, 20), new THREE.MeshBasicMaterial({ color: "#20262e", side: THREE.BackSide })));
  for (const [x, y, z, w, h, c] of [[0, 5.9, 0, 10, 0.1, "#ffffff"], [-9.9, 2, 0, 0.1, 4, "#ffe9c8"], [9.9, 2, 0, 0.1, 4, "#c9dcff"], [0, 2, -9.9, 6, 3, TEAM_COLORS[event.team] ?? "#3b6cc8"]]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w || 0.1, h, w ? 0.1 : 8), new THREE.MeshBasicMaterial({ color: c }));
    panel.position.set(x, y, z);
    studio.add(panel);
  }
  const envMap = pmrem.fromScene(studio, 0.03).texture;
  cut.scene.environment = envMap;
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200),
    size = () => {
      renderer.setSize(innerWidth, innerHeight, false);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    };
  size();
  addEventListener("resize", size);
  const duration = reduced ? 3.5 : def.duration,
    bar = root.querySelector(".gd-cine-progress i");
  let start = performance.now(),
    last = start,
    frame = 0;
  const close = () => {
    cancelAnimationFrame(frame);
    removeEventListener("resize", size);
    removeEventListener("keydown", key);
    root.classList.add("gd-out");
    setTimeout(() => {
      cut.scene.traverse((o) => {
        o.geometry?.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          m?.map?.dispose();
          m?.dispose();
        });
      });
      envMap.dispose();
      renderer.dispose();
      root.remove();
      active = null;
      document.dispatchEvent(new CustomEvent("gridiron:cinematic-closed", { detail: { eventId: event.id } }));
    }, 380);
  };
  const key = (ev) => {
    if (ev.key === "Escape" || ev.key === " " || ev.key === "Enter") close();
  };
  addEventListener("keydown", key);
  root.querySelector("button").onclick = close;
  const tick = (now) => {
    const u = Math.min(1, (now - start) / 1000 / duration),
      dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const shot = sampleShot(cut.shots, reduced ? 1 : u);
    camera.position.set(...shot.pos);
    camera.fov = shot.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(...shot.look);
    if (!reduced) cut.update(dt, now / 1000, u);
    else if (!root.dataset.posed) {
      cut.update(0, 0, 0.8);
      root.dataset.posed = "1";
    }
    renderer.render(cut.scene, camera);
    bar.style.width = `${u * 100}%`;
    if (u > 0.12) root.classList.add("gd-titled");
    if (u >= 1) return close();
    frame = requestAnimationFrame(tick);
  };
  active = { event, close };
  requestAnimationFrame(() => root.classList.add("gd-in"));
  frame = requestAnimationFrame(tick);
  return true;
}

export function installCinematics({ isBusy }) {
  let cursor = Number(state.franchise?.eventLog?.serial ?? 0);
  const pending = [];
  const previous = render;
  render = function () {
    previous();
    if (!state.franchise) return;
    const fresh = eventsSince(state, cursor);
    cursor = Number(state.franchise.eventLog?.serial ?? cursor);
    pending.push(...fresh.filter((e) => e.team === state.team));
    // Wait until the match animation and any modal are done before rolling a cinematic.
    const busy = isBusy() || (typeof animating !== "undefined" && animating) || document.getElementById("modal")?.open;
    if (!pending.length || busy || active) return;
    const pick = pickCinematic(pending.splice(0));
    if (pick) setTimeout(() => playCinematic(pick), 250);
  };
  window.Cinematics = { play: playCinematic, preview: (kind) => playCinematic({ id: "preview-" + kind, kind, team: state.team, score: [31, 24], playerName: "Top Prospect", round: 1, quote: "We earned this together.", headline: "A word with the team" }) };
}
