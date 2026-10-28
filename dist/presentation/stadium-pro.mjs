// Stadium Pro: a presentation layer over stadium.js. Adds image-based lighting, a sky that runs
// from afternoon to night across the game, a full bowl with upper deck, jumbotrons and ribbon
// boards, a GPU-animated crowd in team colours, confetti and flashbulbs, and a "Director"
// camera that cuts like a broadcast. It reads match state only; results are never touched.

const TIMES = {
  Afternoon: { top: "#3d7fc4", horizon: "#bcd8ec", ground: "#4a5a46", sun: "#fff1d6", sunI: 3.2, hemi: 1.6, exposure: 1.0, glow: 0.15, fog: "#a9c6da" },
  Dusk: { top: "#1d2f5c", horizon: "#f2a35e", ground: "#2a2a30", sun: "#ffb27a", sunI: 1.6, hemi: 0.9, exposure: 1.1, glow: 0.7, fog: "#6d6a7e" },
  Night: { top: "#050a16", horizon: "#1a2440", ground: "#0b0d12", sun: "#cfe0ff", sunI: 0.5, hemi: 0.45, exposure: 1.25, glow: 1.0, fog: "#141b2b" },
};
const RAIN = { top: "#59687a", horizon: "#9aa8b4", fog: "#7b8995" };

export function timeOfDay(m) {
  if (!m) return "Afternoon";
  return m.quarter >= 4 ? "Night" : m.quarter === 3 ? "Dusk" : "Afternoon";
}

// Broadcast shot selection from the play's phase. Pure: returns where the camera wants to be.
export function directorShot(s, a, { replay = false, now = 0, dir = 1 } = {}) {
  const f = s.focus;
  // Between plays: a slow, wide drift that shows the bowl, the boards and the sky.
  if (!a) return { pos: [f.x + dir * 10 + Math.sin(now * 0.00012) * 8, 26, f.z + 52], look: [f.x, 6, f.z - 10], fov: 50, lerp: 0.03, name: "Establishing" };
  const t = a.elapsed / a.duration,
    carrier = s.players[a.carrier]?.group.position ?? f,
    ball = s.ball.position;
  if (replay) {
    if (a.pass && t > a.release && t < a.catchTime) return { pos: [ball.x - dir * 10, 7, ball.z - 14], look: [ball.x, ball.y, ball.z], fov: 38, lerp: 0.08, name: "Reverse air" };
    return { pos: [carrier.x + dir * 6, 3.2, carrier.z - 13], look: [carrier.x, 1.1, carrier.z], fov: 34, lerp: 0.07, name: "Low reverse" };
  }
  if (a.touchdown && t > 0.82) return { pos: [dir * 64, 2.4, carrier.z * 0.6 + 3], look: [carrier.x, 1.3, carrier.z], fov: 32, lerp: 0.06, name: "End zone hero" };
  if ((a.pass || a.kick) && t >= a.release && t < a.catchTime) return { pos: [ball.x - dir * 15, 11, ball.z + 7], look: [ball.x + dir * 6, ball.y * 0.6, ball.z], fov: 46, lerp: 0.09, name: "SkyCam" };
  if (t < (a.pass ? a.release : 0.3)) return { pos: [f.x + dir * 3, 13, f.z + 25], look: [f.x + dir * 3, 1, f.z], fov: 40, lerp: 0.07, name: "Sideline" };
  return { pos: [carrier.x - dir * 8, 4.6, carrier.z + 11], look: [carrier.x + dir * 2, 1.2, carrier.z], fov: 38, lerp: 0.08, name: "Ground track" };
}

function canvasTexture(THREE, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx: canvas.getContext("2d"), texture };
}

function glowTexture(THREE) {
  const { ctx, texture } = canvasTexture(THREE, 128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,244,220,.65)");
  g.addColorStop(1, "rgba(255,240,210,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return texture;
}

/* ------------------------------------------------------------------ build */

function enhance(s, G) {
  const { THREE, teamColors } = G,
    r = s.renderer;
  s.__pro = { THREE, teamColors, time: null, mix: null, boards: [], glows: [], lastBoard: "" };
  const pro = s.__pro;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1;
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  s.sun.shadow.mapSize.set(2048, 2048);
  s.sun.shadow.normalBias = 0.02;
  s.scene.fog = new THREE.Fog(0xa9c6da, 160, 420);
  s.camera.far = 900;
  s.camera.updateProjectionMatrix();
  pro.hemi = s.scene.children.find((c) => c.isHemisphereLight);

  // Sky dome; also rendered into a PMREM environment so materials pick up real reflections.
  pro.skyUniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color() } };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: pro.skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader:
      "uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; varying vec3 vDir; void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, ground, pow(-h, 0.4)); gl_FragColor = vec4(c, 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
  });
  pro.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), skyMat);
  s.scene.add(pro.sky);
  pro.pmrem = new THREE.PMREMGenerator(r);
  pro.envScene = new THREE.Scene();
  pro.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat.clone()));
  pro.envScene.children[0].material.uniforms = pro.skyUniforms;

  buildBowl(s, pro);
  buildCrowd(s, pro);
  buildBoards(s, pro);
  buildLights(s, pro);
  buildParticles(s, pro);
  for (const c of [s.crowd, s.fanHeads]) if (c) c.visible = false; // replaced by the GPU crowd
  if (s.fanArms) s.fanArms.visible = false;
  s.animateFans = () => {};
}

function buildBowl(s, pro) {
  const { THREE } = pro,
    concrete = s.mat("#2f3a43", { roughness: 0.9 }),
    steel = s.mat("#9aa7b0", { roughness: 0.4, metalness: 0.6 }),
    roof = s.mat("#1b2229", { roughness: 0.7, metalness: 0.3 });
  pro.seatHome = s.mat("#3b6cc8", { roughness: 0.75 });
  pro.seatAway = s.mat("#888888", { roughness: 0.75 });
  // Upper deck on both sidelines, raked back above the lower bowl.
  for (const side of [-1, 1])
    for (let tier = 0; tier < 10; tier++) {
      const z = side * (66 + tier * 2.6),
        y = 21 + tier * 1.7;
      s.box(170, 1.2, 2.6, tier % 2 ? concrete : side > 0 ? pro.seatHome : pro.seatAway, 0, y, z);
    }
  // End-zone stands closing the bowl.
  for (const side of [-1, 1])
    for (let tier = 0; tier < 12; tier++) s.box(2.8, 1.3, 96, tier % 2 ? concrete : pro.seatHome, side * (78 + tier * 2.7), 1.2 + tier * 1.75, 0);
  // Roof canopy ring with a lighting truss.
  for (const side of [-1, 1]) {
    const canopy = s.box(190, 0.8, 22, roof, 0, 42, side * 82);
    canopy.rotation.x = side * -0.12;
    s.box(190, 0.35, 0.35, steel, 0, 40.5, side * 72);
    const end = s.box(26, 0.8, 150, roof, side * 112, 40, 0);
    end.rotation.z = side * 0.1;
  }
  // Sideline team areas and end-zone pylons.
  for (const side of [-1, 1]) s.box(50, 0.05, 6, s.mat("#1d3a2a"), 0, 0.09, side * 31);
  const pylon = s.mat("#ff7a1a", { emissive: "#ff5a00", emissiveIntensity: 0.25 });
  for (const x of [-50, -60, 50, 60]) for (const z of [-26.7, 26.7]) s.box(0.35, 1, 0.35, pylon, x, 0.55, z);
}

// One InstancedMesh, animated entirely in the vertex shader (bob + arms-up energy).
function buildCrowd(s, pro) {
  const { THREE } = pro,
    seats = [];
  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 9; tier++) for (let x = -72; x <= 72; x += 1.25) seats.push([x, 2.25 + tier * 1.65, side * (35 + tier * 3) - side * 0.6]);
    for (let tier = 0; tier < 10; tier += 1) for (let x = -82; x <= 82; x += 1.3) seats.push([x, 21.7 + tier * 1.7, side * (66 + tier * 2.6) - side * 0.5]);
    for (let tier = 0; tier < 12; tier += 2) for (let z = -46; z <= 46; z += 1.3) seats.push([side * (78 + tier * 2.7) - side * 0.5, 2.05 + tier * 1.75, z]);
  }
  const geo = new THREE.CapsuleGeometry(0.28, 0.55, 2, 6);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  pro.crowdUniforms = { uTime: { value: 0 }, uEnergy: { value: 0.25 } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, pro.crowdUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime; uniform float uEnergy;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nfloat seed = float(gl_InstanceID) * 0.618;\nfloat jump = max(0.0, sin(uTime * (3.0 + fract(seed) * 2.0) + seed * 6.2831));\ntransformed.y += jump * uEnergy * 0.55;\ntransformed.x += sin(uTime * 1.3 + seed) * 0.04;",
      );
  };
  const crowd = new THREE.InstancedMesh(geo, mat, seats.length),
    dummy = new THREE.Object3D();
  seats.forEach(([x, y, z], i) => {
    dummy.position.set(x + (((i * 7919) % 100) / 100 - 0.5) * 0.3, y + 0.55, z);
    dummy.updateMatrix();
    crowd.setMatrixAt(i, dummy.matrix);
  });
  crowd.userData.fanHeads = true;
  s.scene.add(crowd);
  pro.crowd = crowd;
  pro.seats = seats;
}

function paintCrowd(s, m) {
  const { THREE, teamColors } = s.__pro,
    home = new THREE.Color(teamColors[m.a]),
    away = new THREE.Color(teamColors[m.b]),
    neutral = [new THREE.Color("#e8e8e8"), new THREE.Color("#2a2f36"), new THREE.Color("#8c96a0")];
  for (let i = 0; i < s.__pro.crowd.count; i++) {
    const roll = ((i * 2654435761) >>> 0) % 100,
      c = roll < 62 ? home.clone().offsetHSL(0, 0, (roll % 7) * 0.02 - 0.06) : roll < 78 ? away : neutral[roll % 3];
    s.__pro.crowd.setColorAt(i, c);
  }
  s.__pro.crowd.instanceColor.needsUpdate = true;
  s.__pro.seatHome.color.set(teamColors[m.a]).multiplyScalar(0.55);
  s.__pro.seatAway.color.set(teamColors[m.b]).multiplyScalar(0.55);
}

function buildBoards(s, pro) {
  const { THREE } = pro;
  // Jumbotrons above each end zone.
  for (const side of [-1, 1]) {
    const { canvas, ctx, texture } = canvasTexture(THREE, 1024, 512);
    const frame = s.box(1.2, 18, 34, s.mat("#0c1116", { roughness: 0.4, metalness: 0.5 }), side * 96, 34, 0);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(31, 15.5), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: false }));
    screen.position.set(side * 95.3, 34, 0);
    screen.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    s.scene.add(screen);
    s.box(1, 22, 1, s.mat("#2b333b"), side * 96, 12.5, 0);
    pro.boards.push({ canvas, ctx, texture, frame });
  }
  // Scrolling LED ribbon around the field wall.
  const ribbon = canvasTexture(THREE, 2048, 64);
  ribbon.texture.wrapS = THREE.RepeatWrapping;
  ribbon.texture.repeat.set(3, 1);
  pro.ribbon = ribbon;
  const ribbonMat = new THREE.MeshBasicMaterial({ map: ribbon.texture, toneMapped: false });
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(150, 1.1), ribbonMat);
    strip.position.set(0, 1.25, side * 33.6);
    if (side > 0) strip.rotation.y = Math.PI;
    s.scene.add(strip);
  }
}

function paintRibbon(s, m) {
  const { ctx, canvas, texture } = s.__pro.ribbon,
    { teamColors } = s.__pro;
  ctx.fillStyle = "#06080b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const words = [clubs[m.a][2].toUpperCase(), "GRIDIRON DIRECTOR", clubs[m.b][2].toUpperCase(), `${clubs[m.a][1].toUpperCase()} · WEEK ${state.week + 1}`];
  ctx.font = "bold 42px 'Barlow Condensed', Arial";
  ctx.textBaseline = "middle";
  let x = 20;
  for (let i = 0; x < canvas.width; i++) {
    const word = words[i % words.length];
    ctx.fillStyle = i % 2 ? "#ffffff" : teamColors[i % 4 === 2 ? m.b : m.a];
    ctx.fillText(word, x, 34);
    x += ctx.measureText(word).width + 70;
  }
  texture.needsUpdate = true;
}

function paintBoards(s, m, banner = null) {
  if (!m?.score) return;
  const pro = s.__pro,
    key = JSON.stringify([m.score, m.quarter, Math.floor(m.clock / 5), m.down, m.toGo, m.poss, banner]);
  if (key === pro.lastBoard) return;
  pro.lastBoard = key;
  for (const { ctx, canvas, texture } of pro.boards) {
    const w = canvas.width,
      h = canvas.height;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#0b1320");
    bg.addColorStop(1, "#04070c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (banner) {
      ctx.fillStyle = pro.teamColors[banner.team ?? m.a];
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      ctx.font = "900 150px 'Barlow Condensed', Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(banner.text, w / 2, h / 2);
    } else {
      for (const [i, team] of [m.a, m.b].entries()) {
        const x = i ? w * 0.75 : w * 0.25;
        ctx.fillStyle = pro.teamColors[team];
        ctx.fillRect(x - 200, 60, 400, 90);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "800 64px 'Barlow Condensed', Arial";
        ctx.fillText(clubs[team][0], x, 106);
        ctx.font = "900 190px 'Barlow Condensed', Arial";
        ctx.fillText(String(m.score[i]), x, 270);
        if (m.poss === i) {
          ctx.fillStyle = "#ffd34d";
          ctx.beginPath();
          ctx.arc(x, 395, 14, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = "#9fb3c8";
      ctx.font = "700 46px 'Barlow Condensed', Arial";
      ctx.textAlign = "center";
      const q = m.quarter > 4 ? "OT" : `Q${m.quarter}`,
        clock = `${Math.floor(m.clock / 60)}:${String(m.clock % 60).padStart(2, "0")}`;
      ctx.fillText(`${q}  ${clock}`, w / 2, 200);
      ctx.fillStyle = "#fff";
      ctx.font = "800 40px 'Barlow Condensed', Arial";
      ctx.fillText(`${["", "1ST", "2ND", "3RD", "4TH"][m.down] || ""} & ${m.toGo}`, w / 2, 260);
    }
    texture.needsUpdate = true;
  }
}

function buildLights(s, pro) {
  const { THREE } = pro,
    tex = glowTexture(THREE);
  // Glows on the existing corner towers and along the roof truss.
  const spots = [];
  for (const x of [-65, 65]) for (const z of [-50, 50]) for (let k = -1; k <= 1; k++) spots.push([x + k * 2.6, 32.4, z, 9]);
  for (const side of [-1, 1]) for (let x = -84; x <= 84; x += 12) spots.push([x, 40.2, side * 72, 6]);
  for (const [x, y, z, size] of spots) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xfff3dc, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(size);
    s.scene.add(sprite);
    pro.glows.push(sprite);
  }
  // Two key stadium lights for night games; intensity follows time of day.
  pro.floods = [-1, 1].map((side) => {
    const light = new THREE.DirectionalLight(0xfff4e2, 0);
    light.position.set(side * 40, 60, side * -30);
    s.scene.add(light);
    return light;
  });
}

function buildParticles(s, pro) {
  const { THREE } = pro,
    n = 700,
    pos = new Float32Array(n * 3),
    col = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  pro.confetti = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.45, vertexColors: true, transparent: true, depthWrite: false }));
  pro.confetti.visible = false;
  pro.confettiVel = new Float32Array(n * 3);
  s.scene.add(pro.confetti);
  // Flashbulbs: a handful of crowd seats that sparkle, more on big moments.
  const flashes = new THREE.BufferGeometry(),
    fp = new Float32Array(160 * 3);
  flashes.setAttribute("position", new THREE.BufferAttribute(fp, 3));
  pro.flashes = new THREE.Points(flashes, new THREE.PointsMaterial({ size: 1.1, map: glowTexture(THREE), color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  s.scene.add(pro.flashes);
}

function burstConfetti(s, team) {
  const pro = s.__pro,
    { THREE } = pro,
    pos = pro.confetti.geometry.attributes.position.array,
    col = pro.confetti.geometry.attributes.color.array,
    palette = [new THREE.Color(pro.teamColors[team]), new THREE.Color("#ffffff"), new THREE.Color("#ffd34d")],
    x = s.focus.x;
  for (let i = 0; i < pos.length / 3; i++) {
    pos.set([x + (Math.random() - 0.5) * 30, 30 + Math.random() * 10, (Math.random() - 0.5) * 50], i * 3);
    pro.confettiVel.set([(Math.random() - 0.5) * 3, -2 - Math.random() * 3, (Math.random() - 0.5) * 3], i * 3);
    const c = palette[i % 3];
    col.set([c.r, c.g, c.b], i * 3);
  }
  pro.confetti.geometry.attributes.color.needsUpdate = true;
  pro.confetti.visible = true;
  pro.confettiUntil = performance.now() + 9000;
}

/* --------------------------------------------------------------- atmosphere */

function applyTime(s, m, dt) {
  const pro = s.__pro,
    { THREE } = pro,
    rain = m?.weather === "Rain",
    name = timeOfDay(m),
    target = { ...TIMES[name], ...(rain ? RAIN : {}) };
  if (!pro.mix) pro.mix = { ...target, top: new THREE.Color(target.top), horizon: new THREE.Color(target.horizon), ground: new THREE.Color(target.ground), fog: new THREE.Color(target.fog), sun: new THREE.Color(target.sun) };
  const k = Math.min(1, dt * 0.6),
    mix = pro.mix;
  for (const key of ["top", "horizon", "ground", "fog", "sun"]) mix[key].lerp(new THREE.Color(target[key]), k);
  for (const key of ["sunI", "hemi", "exposure", "glow"]) mix[key] += (target[key] - mix[key]) * k;
  pro.skyUniforms.top.value.copy(mix.top);
  pro.skyUniforms.horizon.value.copy(mix.horizon);
  pro.skyUniforms.ground.value.copy(mix.ground);
  s.scene.fog.color.copy(mix.fog);
  s.sun.color.copy(mix.sun);
  s.sun.intensity = mix.sunI * (rain ? 0.55 : 1);
  if (pro.hemi) pro.hemi.intensity = mix.hemi;
  s.renderer.toneMappingExposure = mix.exposure;
  pro.floods.forEach((l) => (l.intensity = mix.glow * 1.6));
  for (const g of pro.glows) g.material.opacity = 0.25 + mix.glow * 0.75;
  // Re-bake the environment only when the period changes.
  const envKey = name + rain;
  if (pro.envKey !== envKey && (!pro.envAt || performance.now() - pro.envAt > 2500)) {
    pro.envKey = envKey;
    pro.envAt = performance.now();
    pro.env?.dispose();
    pro.env = pro.pmrem.fromScene(pro.envScene, 0.04).texture;
    s.scene.environment = pro.env;
  }
}

/* ------------------------------------------------------------------- loop */

function proLoop(G, baseLoop) {
  return function () {
    if (this.renderer.software || !this.__pro) return baseLoop.call(this);
    this.frame = requestAnimationFrame(() => this.loop());
    if (!this.host?.isConnected || document.hidden) {
      this.lastTick = performance.now();
      return;
    }
    const pro = this.__pro,
      { THREE } = pro,
      now = performance.now(),
      delta = Math.min(0.12, (now - (this.lastTick || now)) / 1000);
    this.lastTick = now;
    this.updateAction(delta);
    const a = this.action,
      m = this.match,
      t = a ? a.elapsed / a.duration : 0,
      replay = G.replaying();
    // Crowd energy swells through big plays.
    const big = a && /TOUCHDOWN|INTERCEPTED/.test(a.last?.text || ""),
      energy = a ? (big && t > 0.8 ? 1.4 : a.pass && t > a.release ? 0.75 : 0.45) : 0.25;
    pro.crowdUniforms.uEnergy.value += (energy - pro.crowdUniforms.uEnergy.value) * Math.min(1, delta * 3);
    pro.crowdUniforms.uTime.value = now / 1000;
    if (a?.touchdown && t > 0.86 && !a.__confetti && !replay) {
      a.__confetti = true;
      burstConfetti(this, m?.poss === 0 ? m.a : m.b);
      paintBoards(this, m, { text: "TOUCHDOWN", team: m?.poss === 0 ? m.a : m.b });
    } else if (!a?.touchdown || t < 0.86) paintBoards(this, a?.after && t > 0.95 ? a.after : m || {});
    if (pro.confetti.visible) {
      const p = pro.confetti.geometry.attributes.position.array,
        v = pro.confettiVel;
      for (let i = 0; i < p.length; i += 3) {
        p[i] += v[i] * delta + Math.sin(now * 0.002 + i) * 0.02;
        p[i + 1] = Math.max(0.1, p[i + 1] + v[i + 1] * delta);
        p[i + 2] += v[i + 2] * delta;
      }
      pro.confetti.geometry.attributes.position.needsUpdate = true;
      if (now > pro.confettiUntil) pro.confetti.visible = false;
    }
    if (now - (pro.flashTick || 0) > 90) {
      pro.flashTick = now;
      const fp = pro.flashes.geometry.attributes.position.array,
        rate = 0.15 + pro.crowdUniforms.uEnergy.value * 0.5;
      for (let i = 0; i < fp.length / 3; i++) {
        const seat = pro.seats[(Math.random() * pro.seats.length) | 0];
        if (Math.random() < rate) fp.set([seat[0], seat[1] + 0.9, seat[2]], i * 3);
        else fp.set([0, -50, 0], i * 3);
      }
      pro.flashes.geometry.attributes.position.needsUpdate = true;
      pro.flashes.material.opacity = 0.35 + pro.mix?.glow * 0.5;
    }
    pro.ribbon.texture.offset.x = (now * 0.00004) % 1;
    applyTime(this, m, delta);
    if (this.rain) {
      this.rain.visible = this.scene.userData.weather === "Rain";
      this.rain.position.y = -((now * 0.003) % 3);
    }
    const f = this.focus;
    if (!Number.isFinite(f.x + f.y + f.z)) f.set(0, 1, 0);
    f.x = Math.max(-58, Math.min(58, f.x));
    f.z = Math.max(-24, Math.min(24, f.z));
    const dir = m?.poss === 1 ? -1 : 1,
      mode = G.camera();
    if (mode === "Director") {
      const shot = directorShot(this, a, { replay, now, dir });
      pro.shot = shot.name;
      this.camera.position.lerp(new THREE.Vector3(...shot.pos), shot.lerp);
      this.target.lerp(new THREE.Vector3(...shot.look), Math.min(1, shot.lerp * 1.6));
      this.camera.fov += (shot.fov - this.camera.fov) * 0.06;
      this.camera.updateProjectionMatrix();
    } else {
      if (Math.abs(this.camera.fov - 47) > 0.1) {
        this.camera.fov += (47 - this.camera.fov) * 0.1;
        this.camera.updateProjectionMatrix();
      }
      const desired = new THREE.Vector3();
      if (mode === "Broadcast") desired.set(f.x + dir * 8, 19, f.z + 31);
      else if (mode === "End zone") desired.set(f.x - dir * 24, 12, f.z + 3);
      else if (mode === "Player cam") desired.set(f.x - dir * 9, 5.5, f.z + 12);
      else if (mode === "Tactical") desired.set(f.x, 62, f.z + 0.1);
      else desired.set(f.x + Math.cos(this.orbit.angle) * this.orbit.radius, this.orbit.height, f.z + Math.sin(this.orbit.angle) * this.orbit.radius);
      this.camera.position.lerp(desired, 0.1);
      this.target.lerp(new THREE.Vector3(f.x, 1.2, f.z), 0.13);
    }
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
  };
}

/* ---------------------------------------------------------------- install */

export function installStadiumPro() {
  const G = window.GridironStadium;
  if (!G || G.Stadium.prototype.__proInstalled) return false;
  const P = G.Stadium.prototype;
  P.__proInstalled = true;
  window.GridironStadiumPro = { timeOfDay, directorShot };
  const baseSetup = P.setup,
    baseLoop = P.loop;
  P.setup = function (m) {
    if (!this.__pro && !this.renderer.software) {
      try {
        enhance(this, G);
      } catch (e) {
        console.warn("Stadium Pro unavailable", e);
        this.__pro = null;
      }
    }
    baseSetup.call(this, m);
    if (this.__pro) {
      const key = m.a + ":" + m.b;
      if (this.__pro.teamKey !== key) {
        this.__pro.teamKey = key;
        paintCrowd(this, m);
        paintRibbon(this, m);
      }
      // stadium.js resets the clear colour per play; the sky dome covers it.
      this.renderer.setClearColor(0x000000);
    }
  };
  P.loop = proLoop(G, baseLoop);
  let preferred = null;
  try {
    preferred = localStorage.getItem("gridiron-camera");
  } catch {}
  if (!preferred || preferred === "Director") G.setCamera("Director");
  const setCam = window.setStadiumCamera;
  window.setStadiumCamera = (v) => {
    try {
      localStorage.setItem("gridiron-camera", v);
    } catch {}
    setCam?.(v);
  };
  return true;
}
