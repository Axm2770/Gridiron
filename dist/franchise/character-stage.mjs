import * as THREE from "../vendor/three.module.js";
import { SoftwareRenderer } from "./software-scene.mjs";
import { DEFAULT_APPEARANCE } from "./coach-profile.mjs";
import { identitySeed } from "./newgens.mjs";
const palette = ["#e6b998", "#cf956e", "#b77b51", "#895737", "#623d2b"];
const color = (value, fallback) =>
  /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
const mat = (v, roughness = 0.75) =>
  new THREE.MeshStandardMaterial({ color: v, roughness, metalness: 0.03 });
function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const box = (parent, w, h, d, material, x = 0, y = 0, z = 0) =>
  mesh(new THREE.BoxGeometry(w, h, d), material, parent, x, y, z);
const sphere = (parent, xr, yr, zr, material, x = 0, y = 0, z = 0) => {
  const m = mesh(
    new THREE.SphereGeometry(1, 14, 10),
    material,
    parent,
    x,
    y,
    z,
  );
  m.scale.set(xr, yr, zr);
  return m;
};
const tube = (parent, r1, r2, h, material, x = 0, y = 0, z = 0) =>
  mesh(new THREE.CylinderGeometry(r1, r2, h, 12), material, parent, x, y, z);
export function appearanceFor(p = {}) {
  const n = identitySeed(p.id || p.name || "coach");
  return {
    ...DEFAULT_APPEARANCE,
    skin: p.face?.skin || palette[n % 5],
    hair: p.face?.hair || "#25211c",
    hairStyle: ["Short", "Curly", "Bald"][n % 3],
    beard: p.face?.beard ? "Stubble" : "None",
    jacket: "#234861",
    build: ["Lean", "Athletic", "Broad"][n % 3],
    ...p.appearance,
  };
}
export function createCharacter(
  input = {},
  { player = false, seated = false } = {},
) {
  const a = { ...DEFAULT_APPEARANCE, ...input },
    group = new THREE.Group(),
    skin = mat(color(a.skin, "#b77b51")),
    cloth = mat(color(a.jacket, "#204c68")),
    pants = mat(a.outfit === "Suit" ? "#202b36" : "#263642"),
    shoe = mat("#0e1821", 0.35),
    hair = mat(color(a.hair, "#24201c")),
    white = mat("#d5e1e4"),
    dark = mat("#17232d"),
    lip = mat("#8b5547"),
    width = a.build === "Broad" ? 1.14 : a.build === "Lean" ? 0.88 : 1;
  group.userData.athlete = true;
  group.scale.set(width, a.height / 183, 1);
  const pelvis = new THREE.Group();
  pelvis.position.y = seated ? 0.79 : 1.05;
  group.add(pelvis);
  const trunk = new THREE.Group();
  trunk.position.y = 0.12;
  pelvis.add(trunk);
  const torso = tube(trunk, 0.29, 0.23, 0.63, cloth, 0, 0.29, 0);
  torso.scale.z = 0.69;
  sphere(trunk, 0.34, 0.15, 0.2, cloth, 0, 0.56, 0);
  tube(trunk, 0.07, 0.09, 0.16, skin, 0, 0.68, 0);
  const head = new THREE.Group();
  head.position.y = 0.85;
  head.scale.setScalar(0.86);
  trunk.add(head);
  const skull = mesh(new THREE.SphereGeometry(1, 24, 16), skin, head);
  skull.scale.set(0.155, 0.215, 0.165);
  for (const side of [-1, 1]) {
    sphere(head, 0.032, 0.061, 0.032, skin, side * 0.155, -0.025, 0);
    sphere(head, 0.029, 0.013, 0.013, white, side * 0.064, 0.018, 0.166);
    sphere(head, 0.012, 0.013, 0.009, dark, side * 0.064, 0.018, 0.178);
    sphere(head, 0.005, 0.005, 0.004, white, side * 0.061, 0.023, 0.185);
    const brow = box(
      head,
      0.064,
      0.012,
      0.016,
      hair,
      side * 0.064,
      0.052,
      0.164,
    );
    brow.rotation.z = side * -0.08;
  }
  sphere(head, 0.021, 0.039, 0.04, skin, 0, -0.027, 0.168);
  sphere(head, 0.033, 0.019, 0.02, skin, 0, -0.048, 0.175);
  sphere(head, 0.045, 0.008, 0.012, lip, 0, -0.091, 0.165);
  sphere(head, 0.038, 0.006, 0.013, skin, 0, -0.102, 0.165);
  if (a.hairStyle !== "Bald") {
    const cap = sphere(head, 0.161, 0.102, 0.166, hair, 0, 0.15, -0.01);
    cap.rotation.x = -0.1;
    box(head, 0.025, 0.11, 0.045, hair, -0.144, 0.06, -0.015);
    box(head, 0.025, 0.11, 0.045, hair, 0.144, 0.06, -0.015);
    if (a.hairStyle === "Curly")
      for (let i = 0; i < 14; i++)
        sphere(
          head,
          0.04,
          0.035,
          0.04,
          hair,
          Math.sin(i * 2.4) * 0.12,
          0.19 + Math.cos(i) * 0.015,
          Math.cos(i * 2.4) * 0.105,
        );
  }
  if (a.beard !== "None") {
    const beard = mesh(
      new THREE.SphereGeometry(
        1,
        16,
        10,
        0,
        Math.PI,
        Math.PI * 0.57,
        Math.PI * 0.39,
      ),
      hair,
      head,
    );
    beard.scale.set(0.158, a.beard === "Full" ? 0.238 : 0.218, 0.169);
  }

  if (a.glasses) {
    const frame = mat("#1b242b", 0.3);
    for (const side of [-1, 1]) {
      const ring = mesh(
        new THREE.TorusGeometry(0.042, 0.006, 5, 14),
        frame,
        head,
        side * 0.065,
        0.02,
        0.17,
      );
      ring.scale.y = 0.7;
      box(head, 0.05, 0.009, 0.01, frame, side * 0.13, 0.024, 0.135);
    }
    box(head, 0.05, 0.006, 0.008, frame, 0, 0.02, 0.173);
  }
  if (a.headset) {
    const band = mesh(
      new THREE.TorusGeometry(0.177, 0.012, 6, 20, Math.PI),
      dark,
      head,
    );
    band.rotation.z = 0;
    band.position.y = 0.04;
    for (const side of [-1, 1])
      sphere(head, 0.025, 0.057, 0.046, dark, side * 0.18, -0.02, 0);
    const mic = box(head, 0.012, 0.012, 0.18, dark, 0.175, -0.1, 0.08);
    mic.rotation.y = -0.4;
    sphere(head, 0.017, 0.017, 0.02, dark, 0.12, -0.1, 0.163);
  }
  if (a.outfit === "Polo" || a.outfit === "Suit") {
    for (const side of [-1, 1]) {
      const collar = box(
        trunk,
        0.11,
        0.095,
        0.025,
        a.outfit === "Suit" ? white : cloth,
        side * 0.063,
        0.58,
        0.215,
      );
      collar.rotation.z = side * 0.35;
    }
  }
  if (a.outfit === "Suit") {
    const tie = box(trunk, 0.035, 0.32, 0.015, mat("#708d9c"), 0, 0.37, 0.219);
    tie.rotation.x = -0.05;
  } else if (a.outfit === "Tracksuit")
    box(trunk, 0.008, 0.55, 0.01, white, 0, 0.3, 0.211);
  const arms = [],
    forearms = [],
    legs = [];
  for (const side of [-1, 1]) {
    const upper = new THREE.Group();
    upper.position.set(side * 0.32, 0.53, 0);
    trunk.add(upper);
    sphere(upper, 0.105, 0.12, 0.11, cloth);
    tube(upper, 0.083, 0.063, 0.27, cloth, 0, -0.16, 0);
    const elbow = new THREE.Group();
    elbow.position.y = -0.285;
    upper.add(elbow);
    tube(
      elbow,
      0.062,
      0.044,
      0.25,
      a.outfit === "Polo" ? skin : cloth,
      0,
      -0.12,
      0,
    );
    sphere(elbow, 0.045, 0.065, 0.028, skin, 0, -0.27, 0);
    arms.push(upper);
    forearms.push(elbow);
    const leg = new THREE.Group();
    leg.position.set(side * 0.135, -0.05, 0);
    pelvis.add(leg);
    tube(leg, 0.11, 0.085, 0.43, pants, 0, -0.2, 0);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    leg.add(knee);
    tube(knee, 0.081, 0.062, 0.43, pants, 0, -0.2, 0);
    sphere(knee, 0.084, 0.07, 0.15, shoe, 0, -0.43, 0.064);
    legs.push(leg);
    if (seated) {
      leg.rotation.x = -Math.PI / 2;
      knee.rotation.x = Math.PI / 2;
      upper.rotation.x = -0.48;
      elbow.rotation.x = -0.9;
    }
  }
  return {
    group,
    pelvis,
    trunk,
    head,
    arms,
    forearms,
    legs,
    seated,
    appearance: a,
  };
}
function animateCharacter(rig, time, phase = 0, speaking = false) {
  const { head, trunk, arms, forearms } = rig;
  trunk.rotation.z = Math.sin(time * 0.75 + phase) * 0.012;
  head.rotation.y = Math.sin(time * 0.5 + phase) * 0.045;
  head.rotation.x = Math.sin(time * 0.8 + phase) * 0.02;
  for (let i = 0; i < 2; i++) {
    arms[i].rotation.z = (i ? 1 : -1) * (0.08 + Math.sin(time + phase) * 0.012);
    if (rig.seated) {
      arms[i].rotation.x =
        -0.48 - (speaking ? Math.sin(time * 0.7 + phase) * 0.07 : 0);
      forearms[i].rotation.x =
        -0.9 + (speaking ? Math.sin(time * 0.9 + phase) * 0.14 : 0);
    }
    if (!rig.seated) {
      arms[i].rotation.x = speaking
        ? -0.3 - Math.sin(time * 0.9) * 0.14
        : -0.05;
      forearms[i].rotation.x = speaking
        ? -0.7 + Math.sin(time * 1.1 + phase) * 0.12
        : -0.13;
    }
  }
}
export class CharacterStage {
  constructor(
    host,
    {
      appearance,
      scene = "creator",
      coach,
      player,
      extras = [],
      shot = 0,
      reducedMotion = globalThis.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches,
    } = {},
  ) {
    this.host = host;
    this.kind = scene;
    this.shot = shot;
    this.motion =
      !reducedMotion &&
      !globalThis.document?.body.classList.contains("reduce-motion");
    this.rigs = [];
    this.closed = false;
    this.orbit = 0.18;
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "low-power",
      });
    } catch {
      this.renderer = new SoftwareRenderer();
    }
    this.renderer.setPixelRatio(
      Math.min(globalThis.devicePixelRatio || 1, 1.5),
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.setClearColor("#15202c");
    this.renderer.domElement.setAttribute("role", "img");
    this.renderer.domElement.setAttribute(
      "aria-label",
      scene === "creator"
        ? "Interactive 3D head coach avatar"
        : "Animated 3D " + scene + " conversation",
    );
    host.replaceChildren(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#15202c");
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
    this.scene.add(new THREE.HemisphereLight("#c8dce9", "#574538", 2.3));
    const key = new THREE.DirectionalLight("#fff0d8", 3.5);
    key.position.set(-3, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, {
      left: -7,
      right: 7,
      top: 7,
      bottom: -4,
    });
    this.scene.add(key);
    const fill = new THREE.DirectionalLight("#83b8dd", 1.7);
    fill.position.set(4, 3, -2);
    this.scene.add(fill);
    this.buildRoom(scene);
    if (scene === "creator") {
      const rig = createCharacter(appearance);
      this.rigs.push(rig);
      this.scene.add(rig.group);
      this.camera.position.set(2.2, 1.6, 4.9);
      this.target = new THREE.Vector3(0, 1.05, 0);
    } else {
      const press = scene === "press",
        seated = scene === "office" || scene === "film",
        c = createCharacter(
          { ...coach, headset: scene === "locker" ? coach?.headset : false },
          { seated },
        ),
        p = createCharacter(
          { ...player, headset: false },
          { player: true, seated },
        );
      this.rigs.push(c);
      this.scene.add(c.group);
      if (press) {
        c.group.position.set(0, 0, -0.35);
        this.target = new THREE.Vector3(0, 1.25, -0.3);
        this.camera.fov = 29;
        this.camera.position.set(0.8, 1.65, 4.3);
      } else {
        c.group.position.set(-0.95, 0, 0);
        c.group.rotation.y = 0.55;
        p.group.position.set(1, 0, -0.35);
        p.group.rotation.y = -0.55;
        this.scene.add(p.group);
        this.rigs.push(p);
        this.target = new THREE.Vector3(
          shot ? 0.7 : 0,
          shot ? 1.3 : 1.15,
          shot ? -0.15 : 0,
        );
        this.camera.fov = 29;
        this.camera.position.set(
          shot ? 1.9 : 0.1,
          shot ? 1.45 : 1.65,
          shot ? 2.7 : 4.4,
        );
        for (let i = 0; i < extras.length && i < 2; i++) {
          const r = createCharacter(extras[i], { player: true, seated: true });
          r.group.position.set(-0.1 + i * 0.8, 0, -1.7);
          this.rigs.push(r);
          this.scene.add(r.group);
        }
      }
    }
    this.camera.lookAt(this.target);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.tick = this.tick.bind(this);
    this.frame = requestAnimationFrame(this.tick);
    this.last = 0;
    this.abort = new AbortController();
    if (scene === "creator") {
      let down = false,
        lastX = 0;
      host.addEventListener(
        "pointerdown",
        (e) => {
          down = true;
          lastX = e.clientX;
          host.setPointerCapture?.(e.pointerId);
        },
        { signal: this.abort.signal },
      );
      host.addEventListener(
        "pointermove",
        (e) => {
          if (down) {
            this.rotate((e.clientX - lastX) * 0.01);
            lastX = e.clientX;
          }
        },
        { signal: this.abort.signal },
      );
      host.addEventListener("pointerup", () => (down = false), {
        signal: this.abort.signal,
      });
    }
  }
  buildRoom(kind) {
    const scene = this.scene,
      floor = mat("#29343d"),
      wall = mat("#273b4a"),
      accent = mat("#719a9d"),
      wood = mat("#665145"),
      dark = mat("#121f2a"),
      metal = mat("#8c9da5", 0.35),
      white = mat("#b6c7d0");
    box(scene, 14, 0.12, 12, floor, 0, -0.07, 0);
    if (kind === "creator") {
      const podium = tube(
        scene,
        1.05,
        1.12,
        0.08,
        mat("#36535a"),
        0,
        -0.015,
        0,
      );
      box(scene, 4.5, 3.5, 0.2, wall, 0, 1.5, -2);
      for (let i = 0; i < 5; i++)
        box(scene, 0.015, 3.4, 0.03, accent, -2 + i, 1.5, -1.88);
      return;
    }
    box(scene, 14, 4, 0.18, wall, 0, 1.9, -2.6);
    box(scene, 0.2, 4, 10, wall, -6, 1.9, 0);
    for (let i = 0; i < 5; i++)
      box(scene, 1.8, 0.04, 0.06, white, -4 + i * 2, 3.4, -2.42);
    if (kind === "locker") {
      for (let i = 0; i < 8; i++) {
        box(scene, 0.76, 2.15, 0.35, dark, -3.5 + i, 1.1, -2.35);
        box(scene, 0.65, 0.045, 0.4, wood, -3.5 + i, 1.75, -2.18);
        box(
          scene,
          0.22,
          0.45,
          0.05,
          mat(i % 2 ? "#526d85" : "#224e69"),
          -3.5 + i,
          1.42,
          -2.13,
        );
      }
      box(scene, 5, 0.11, 0.65, wood, 0, 0.52, -1.62);
      for (let x of [-2, 2]) box(scene, 0.08, 0.5, 0.45, metal, x, 0.25, -1.62);
    }
    if (kind === "office" || kind === "film") {
      box(scene, 2.2, 0.14, 1.1, wood, 0, 0.85, 0.28);
      for (let x of [-0.9, 0.9]) box(scene, 0.1, 0.8, 0.8, metal, x, 0.4, 0.28);
      for (let x of [-0.95, 1]) {
        box(scene, 0.57, 0.1, 0.55, dark, x, 0.52, -0.1);
        box(scene, 0.57, 0.65, 0.1, dark, x, 0.82, -0.38);
      }
      if (kind === "office") {
        box(scene, 2.2, 1.65, 0.06, mat("#7ea6b3"), -2.6, 2, -2.42);
        for (let x of [-3.6, -2.6, -1.6])
          box(scene, 0.04, 1.65, 0.08, white, x, 2, -2.36);
        for (let i = 0; i < 6; i++)
          box(
            scene,
            0.22,
            0.3 + (i % 3) * 0.15,
            0.04,
            mat("#466879"),
            -3.5 + i * 0.34,
            1.3 + (i % 3) * 0.07,
            -2.31,
          );
        for (let y of [1, 1.9, 2.8])
          box(scene, 1.8, 0.06, 0.6, wood, 2.8, y, -2.25);
        for (let i = 0; i < 7; i++)
          box(
            scene,
            0.12,
            0.35,
            0.2,
            mat(["#8b6e4a", "#516b7c", "#918264"][i % 3]),
            2.1 + i * 0.2,
            1.2,
            -2.2,
          );
        const laptop = box(scene, 0.55, 0.34, 0.035, dark, 0, 1.08, 0.2);
        laptop.rotation.x = -0.18;
      } else {
        box(scene, 2.9, 1.65, 0.1, dark, 0, 2.13, -2.36);
        box(scene, 2.7, 1.45, 0.03, mat("#244e49"), 0, 2.13, -2.28);
        for (let x of [-1, -0.5, 0, 0.5, 1])
          box(scene, 0.015, 1.3, 0.025, accent, x, 2.13, -2.25);
        for (let x of [-0.9, 0, 0.9])
          sphere(scene, 0.05, 0.05, 0.025, white, x, 1.8, -2.22);
      }
    }
    if (kind === "press") {
      const backdrop = mat("#1c3c57");
      box(scene, 7, 3, 0.08, backdrop, 0, 1.7, -2.4);
      for (let x = -3; x <= 3; x++)
        for (let y of [0.8, 1.55, 2.3]) {
          box(scene, 0.25, 0.06, 0.025, accent, x, y, -2.32);
          box(scene, 0.08, 0.16, 0.025, white, x - 0.16, y + 0.06, -2.32);
        }
      box(scene, 1.3, 1, 0.7, wood, 0, 0.5, 0.15);
      box(scene, 1.5, 0.08, 0.8, dark, 0, 1.04, 0.15);
      const mic = tube(scene, 0.012, 0.012, 0.38, dark, 0.25, 1.25, 0.3);
      mic.rotation.x = -0.3;
      sphere(scene, 0.035, 0.035, 0.06, dark, 0.25, 1.42, 0.24);
    }
  }
  resize() {
    if (this.closed) return;
    const w = Math.max(1, this.host.clientWidth),
      h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  rotate(delta) {
    this.orbit += delta;
    if (this.rigs[0]) this.rigs[0].group.rotation.y = this.orbit;
  }
  tick(now) {
    if (this.closed) return;
    if (!this.host.isConnected) {
      this.dispose();
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
    if (
      document.hidden ||
      now - this.last < (this.renderer.software ? 180 : 40)
    )
      return;
    this.last = now;
    const t = this.motion ? now / 1000 : 0;
    for (let i = 0; i < this.rigs.length; i++)
      animateCharacter(this.rigs[i], t, i * 1.7, i === 0);
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.abort?.abort();
    const geometries = new Set(),
      materials = new Set();
    this.scene.traverse((m) => {
      if (m.geometry) geometries.add(m.geometry);
      if (m.material)
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) =>
          materials.add(x),
        );
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    this.renderer.dispose?.();
    this.renderer.domElement.remove();
  }
}
