import * as THREE from "../vendor/three.module.js";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export class SoftwareRenderer {
  constructor() {
    this.domElement = document.createElement("canvas");
    this.ctx = this.domElement.getContext("2d");
    this.shadowMap = {};
    this.capabilities = { getMaxAnisotropy: () => 1 };
    this.ratio = 1;
    this.software = true;
    this.background = "#8caec1";
  }
  setPixelRatio(v) {
    this.ratio = Math.min(v, 1.25);
  }
  setClearColor(v) {
    this.background = "#" + new THREE.Color(v).getHexString();
  }
  setSize(w, h) {
    this.w = w;
    this.h = h;
    this.domElement.width = w * this.ratio;
    this.domElement.height = h * this.ratio;
  }
  project(v, camera) {
    let p = v.clone().applyMatrix4(camera.matrixWorldInverse);
    if (p.z > -0.2) return null;
    let q = v.clone().project(camera);
    return { x: ((q.x + 1) * this.w) / 2, y: ((1 - q.y) * this.h) / 2, z: p.z };
  }
  triangleImage(image, points, uv) {
    let c = this.ctx,
      [p0, p1, p2] = points,
      [t0, t1, t2] = uv;
    let det =
      t0.x * (t1.y - t2.y) + t1.x * (t2.y - t0.y) + t2.x * (t0.y - t1.y);
    if (Math.abs(det) < 0.001) return;
    let solve = (key) => [
      (p0[key] * (t1.y - t2.y) +
        p1[key] * (t2.y - t0.y) +
        p2[key] * (t0.y - t1.y)) /
        det,
      (p0[key] * (t2.x - t1.x) +
        p1[key] * (t0.x - t2.x) +
        p2[key] * (t1.x - t0.x)) /
        det,
      (p0[key] * (t1.x * t2.y - t2.x * t1.y) +
        p1[key] * (t2.x * t0.y - t0.x * t2.y) +
        p2[key] * (t0.x * t1.y - t1.x * t0.y)) /
        det,
    ];
    let a = solve("x"),
      b = solve("y");
    c.save();
    c.beginPath();
    c.moveTo(p0.x, p0.y);
    c.lineTo(p1.x, p1.y);
    c.lineTo(p2.x, p2.y);
    c.closePath();
    c.clip();
    c.transform(a[0], b[0], a[1], b[1], a[2], b[2]);
    c.drawImage(image, 0, 0);
    c.restore();
  }
  render(scene, camera) {
    let c = this.ctx;
    if (!this.w) return;
    c.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    let grad = c.createLinearGradient(0, 0, 0, this.h);
    grad.addColorStop(0, "#1b2835");
    grad.addColorStop(1, "#101922");
    c.fillStyle = grad;
    c.fillRect(0, 0, this.w, this.h);
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    this.cache ??= new WeakMap();
    let faces = [],
      dots = [],
      field,
      view = camera.matrixWorldInverse,
      projection = camera.projectionMatrix;
    const shades = new Map();
    scene.traverse((obj) => {
      if (!obj.isMesh || !obj.visible) return;
      if (obj.material?.map?.image?.width === 2048) {
        field = obj;
        return;
      }
      if (obj.isInstancedMesh) {
        if (obj.userData.fanHeads) return;
        let matrix = new THREE.Matrix4(),
          color = new THREE.Color();
        for (let i = 0; i < obj.count; i += 2) {
          obj.getMatrixAt(i, matrix);
          let p = new THREE.Vector3()
              .setFromMatrixPosition(matrix)
              .applyMatrix4(obj.matrixWorld),
            q = this.project(p, camera);
          if (
            q &&
            q.x > -5 &&
            q.x < this.w + 5 &&
            q.y > -5 &&
            q.y < this.h + 5
          ) {
            obj.getColorAt(i, color);
            dots.push({
              ...q,
              color: "#" + color.getHexString(),
              r: clamp(180 / -q.z, 1, 3),
            });
          }
        }
        return;
      }
      if (obj.material?.transparent || obj.material?.map) return;
      let center = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
      if (center.y < -0.5) return;
      let geo = obj.geometry,
        material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (!material?.color) return;
      let cache = this.cache.get(geo);
      if (!cache) {
        let data = geo.attributes.position.array,
          idx = geo.index?.array,
          tri = [];
        for (let j = 0; j < (idx ? idx.length : data.length / 3); j += 3) {
          let ids = [0, 1, 2].map((k) => (idx ? idx[j + k] : j + k)),
            a = new THREE.Vector3().fromArray(data, ids[0] * 3),
            b = new THREE.Vector3().fromArray(data, ids[1] * 3),
            d = new THREE.Vector3().fromArray(data, ids[2] * 3),
            n = b.sub(a).cross(d.sub(a)).normalize();
          tri.push({ ids, n });
        }
        cache = { data, tri };
        this.cache.set(geo, cache);
      }
      let mv = new THREE.Matrix4().multiplyMatrices(view, obj.matrixWorld),
        mvp = new THREE.Matrix4().multiplyMatrices(projection, mv).elements,
        ve = mv.elements,
        normal = new THREE.Matrix3().getNormalMatrix(obj.matrixWorld).elements,
        points = [];
      for (let j = 0; j < cache.data.length; j += 3) {
        let x = cache.data[j],
          y = cache.data[j + 1],
          z = cache.data[j + 2],
          w = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15],
          depth = ve[2] * x + ve[6] * y + ve[10] * z + ve[14];
        points.push(
          w <= 0.1
            ? null
            : {
                x:
                  ((mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12]) / w + 1) *
                  this.w *
                  0.5,
                y:
                  (1 - (mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13]) / w) *
                  this.h *
                  0.5,
                z: depth,
              },
        );
      }
      for (let tri of cache.tri) {
        let pts = tri.ids.map((i) => points[i]);
        if (pts.some((p) => !p)) continue;
        let cross =
          (pts[1].x - pts[0].x) * (pts[2].y - pts[0].y) -
          (pts[1].y - pts[0].y) * (pts[2].x - pts[0].x);
        if (material.side !== THREE.DoubleSide && cross >= 0) continue;
        if (
          pts.every((p) => p.x < 0) ||
          pts.every((p) => p.x > this.w) ||
          pts.every((p) => p.y < 0) ||
          pts.every((p) => p.y > this.h)
        )
          continue;
        let n = tri.n,
          nx = normal[0] * n.x + normal[3] * n.y + normal[6] * n.z,
          ny = normal[1] * n.x + normal[4] * n.y + normal[7] * n.z,
          nz = normal[2] * n.x + normal[5] * n.y + normal[8] * n.z,
          length = Math.hypot(nx, ny, nz) || 1,
          light =
            Math.round(
              (0.56 +
                0.44 *
                  Math.max(0, (-0.39 * nx + 0.78 * ny + 0.49 * nz) / length)) *
                12,
            ) / 12;
        let shadeKey = material.color.getHex() + ":" + light;
        if (!shades.has(shadeKey))
          shades.set(
            shadeKey,
            "#" + material.color.clone().multiplyScalar(light).getHexString(),
          );
        faces.push({
          pts,
          z: (pts[0].z + pts[1].z + pts[2].z) / 3,
          color: shades.get(shadeKey),
        });
      }
    });
    if (field) {
      let img = field.material.map.image;
      for (let xi = 0; xi < 10; xi++)
        for (let zi = 0; zi < 5; zi++) {
          let corners = [
              [xi, zi],
              [xi + 1, zi],
              [xi + 1, zi + 1],
              [xi, zi + 1],
            ],
            uv = corners.map(([x, z]) => ({
              x: (x / 10) * img.width,
              y: (z / 5) * img.height,
            })),
            ps = corners.map(([x, z]) =>
              this.project(
                new THREE.Vector3(
                  -60 + x * 12,
                  0.08,
                  -26.665 + (z * 53.33) / 5,
                ),
                camera,
              ),
            );
          for (let ids of [
            [0, 1, 2],
            [0, 2, 3],
          ])
            if (ids.every((i) => ps[i]))
              this.triangleImage(
                img,
                ids.map((i) => ps[i]),
                ids.map((i) => uv[i]),
              );
        }
    }
    for (let obj of scene.children) {
      if (!obj.userData.athlete) continue;
      let q = this.project(
        new THREE.Vector3(obj.position.x, 0.12, obj.position.z),
        camera,
      );
      if (q) {
        c.fillStyle = "#10251b44";
        c.beginPath();
        c.ellipse(
          q.x,
          q.y,
          clamp(400 / -q.z, 2, 20),
          clamp(160 / -q.z, 1, 7),
          0,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    }
    faces.sort((a, b) => a.z - b.z);
    for (let f of faces) {
      c.fillStyle = f.color;
      c.beginPath();
      c.moveTo(f.pts[0].x, f.pts[0].y);
      c.lineTo(f.pts[1].x, f.pts[1].y);
      c.lineTo(f.pts[2].x, f.pts[2].y);
      c.closePath();
      c.fill();
      c.lineWidth = 0.4;
      c.strokeStyle = f.color;
      c.stroke();
    }
    for (let obj of scene.children) {
      if (obj.userData.jerseyNumber == null) continue;
      let q = this.project(
        new THREE.Vector3(obj.position.x, 1.55, obj.position.z),
        camera,
      );
      if (q) {
        c.font = "bold " + clamp(370 / -q.z, 5, 13) + "px Arial";
        c.textAlign = "center";
        c.fillStyle = "#f4f5ed";
        c.strokeStyle = "#1e3541";
        c.lineWidth = 1.5;
        c.strokeText(String(obj.userData.jerseyNumber), q.x, q.y);
        c.fillText(String(obj.userData.jerseyNumber), q.x, q.y);
      }
    }
    if (scene.userData.weather === "Rain") {
      c.strokeStyle = "#d4e4ef66";
      c.lineWidth = 1;
      let tick = performance.now() * 0.25;
      c.beginPath();
      for (let i = 0; i < 65; i++) {
        let x = (i * 83 + tick * 0.3) % this.w,
          y = (i * 137 + tick) % this.h;
        c.moveTo(x, y);
        c.lineTo(x - 3, y + 14);
      }
      c.stroke();
    }
    for (let p of dots) {
      c.fillStyle = p.color;
      c.fillRect(p.x - p.r / 2, p.y - p.r, p.r, p.r * 1.5);
      c.beginPath();
      c.arc(p.x, p.y - p.r * 1.5, p.r * 0.42, 0, Math.PI * 2);
      c.fill();
    }
  }
}
