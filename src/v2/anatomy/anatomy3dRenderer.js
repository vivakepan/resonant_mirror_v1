import * as THREE from '../../../node_modules/three/build/three.module.js';

/** Thin inner-lumen radii used by the sagittal close-up. */
export function tubeTractDimensions() {
  return Object.freeze({
    skullRing: 0.014,
    tractRadius: 0.068,
    foldRadius: 0.022,
    noseLength: 0.42,
    maxRadius: 0.092,
  });
}

export function nextSkullZoom(current, deltaY) {
  const factor = deltaY > 0 ? 0.91 : 1.1;
  return Math.max(0.42, Math.min(4.2, current * factor));
}

export class Anatomy3DRenderer {
  constructor(canvas, {
    mode = 'skull',
  } = {}) {
    this.canvas = canvas;
    this.mode = mode;
    this.zoom = 1;
    this.baseDistance = 5.6;
    this.lookAt = new THREE.Vector3(0.12, -0.08, 0.18);
    this.viewDir = new THREE.Vector3(0.94, 0.08, 0.32).normalize();
    this.airflowParticles = [];
    this.fieldParticles = [];
    this.eyelids = [];
    this.irises = [];
    this.dims = tubeTractDimensions();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.08, 40);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.addLights();
    this.buildRealisticSkull();
    this.buildFieldCurrents();
    this.applyCamera();
    this.bindInteraction();
    canvas.classList.add('three-ready');
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xf3efe4, 0x101018, 1.05));
    const key = new THREE.DirectionalLight(0xfff4e4, 2.05);
    key.position.set(5, 2.8, 1.6);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x9ad7ff, 0.45);
    fill.position.set(-3, 1.4, 2.2);
    this.scene.add(fill);
    const rim = new THREE.PointLight(0x49d9ff, 8, 20);
    rim.position.set(0.8, 0.6, -3.4);
    this.scene.add(rim);
  }

  buildRealisticSkull() {
    const bone = boneMat(0xe7dfd0, 0.96);
    const innerBone = boneMat(0xcbb8a4, 0.9, 0x3a2a22);
    const nasal = chamberMat(0x4bdcf6, 0.38, 0x0d6174);
    const oral = chamberMat(0x79e39b, 0.36, 0x174d2d);
    const pharynx = chamberMat(0xffa56f, 0.38, 0x63301e);
    const larynx = chamberMat(0xff816d, 0.44, 0x6f1f1c);
    const sinus = chamberMat(0x7fe7ff, 0.3, 0x1a5c6e);
    const fold = boneMat(0xf3d0c4, 0.96, 0x7a4038);
    const r = this.dims;

    this.root.add(extrudeSagittal(SKULL_OUTLINE, 0.62, bone, 0.05));
    this.root.add(extrudeSagittal(MANDIBLE_OUTLINE, 0.48, bone, 0.04));

    this.headHalo = ring(1.34, 1.48, 0.012, chamberMat(0x5cdfff, 0.14, 0x2ebbe8));
    this.headHalo.rotation.y = Math.PI / 2;
    this.headHalo.position.set(0.08, 0.22, -0.04);
    this.root.add(this.headHalo);

    this.root.add(addEyeball(this, 1, 0.4, 0.18, 0.86));

    const zygoma = tube([
      new THREE.Vector3(0.28, 0.14, 0.72),
      new THREE.Vector3(0.55, 0.02, 0.42),
      new THREE.Vector3(0.42, -0.12, 0.04),
    ], 0.032, bone);
    this.root.add(zygoma);

    const canal = tube([
      new THREE.Vector3(0.58, -0.04, 0.02),
      new THREE.Vector3(0.38, -0.04, -0.18),
    ], 0.036, innerBone);
    this.root.add(canal);

    const frontal = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 16), sinus);
    frontal.scale.set(0.7, 0.55, 1.15);
    frontal.position.set(0.08, 0.72, 0.42);
    this.root.add(frontal);

    const sphenoid = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), sinus);
    sphenoid.scale.set(0.7, 0.7, 1.1);
    sphenoid.position.set(0.08, 0.08, 0.02);
    this.root.add(sphenoid);

    const ethmoid = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.3), sinus);
    ethmoid.position.set(0.08, 0.26, 0.38);
    this.root.add(ethmoid);

    const maxillary = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), sinus);
    maxillary.scale.set(0.85, 0.9, 1.05);
    maxillary.position.set(0.22, -0.22, 0.48);
    this.root.add(maxillary);

    const septum = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.4, 0.52), innerBone);
    septum.position.set(0.02, 0.14, 0.58);
    this.root.add(septum);

    this.nasalChamber = tube([
      new THREE.Vector3(0.04, 0.34, 0.92),
      new THREE.Vector3(0.04, 0.16, 0.66),
      new THREE.Vector3(0.04, -0.02, 0.42),
      new THREE.Vector3(0.04, -0.1, 0.16),
    ], r.tractRadius * 0.9, nasal);
    this.root.add(this.nasalChamber);

    for (let shelf = 0; shelf < 3; shelf++) {
      const y = 0.24 - shelf * 0.11;
      this.root.add(tube([
        new THREE.Vector3(0.05, y, 0.84),
        new THREE.Vector3(0.12, y - 0.02, 0.6),
        new THREE.Vector3(0.07, y + 0.01, 0.4),
      ], 0.016, innerBone));
    }

    this.oralChamber = tube([
      new THREE.Vector3(0.04, -0.36, 0.9),
      new THREE.Vector3(0.04, -0.46, 0.52),
      new THREE.Vector3(0.04, -0.48, 0.16),
      new THREE.Vector3(0.04, -0.38, -0.02),
    ], r.tractRadius * 1.18, oral);
    this.root.add(this.oralChamber);

    this.root.add(tube([
      new THREE.Vector3(0.04, -0.3, 0.86),
      new THREE.Vector3(0.04, -0.28, 0.44),
      new THREE.Vector3(0.04, -0.18, 0.12),
    ], 0.028, innerBone));

    this.pharynxChamber = tube([
      new THREE.Vector3(0.04, 0.1, 0.18),
      new THREE.Vector3(0.04, -0.26, 0.04),
      new THREE.Vector3(0.04, -0.76, 0.02),
      new THREE.Vector3(0.04, -1.18, 0.06),
    ], r.tractRadius * 1.08, pharynx);
    this.root.add(this.pharynxChamber);

    this.larynxTube = tube([
      new THREE.Vector3(0.04, -1.14, 0.06),
      new THREE.Vector3(0.04, -1.44, 0.1),
      new THREE.Vector3(0.04, -1.78, 0.14),
    ], r.tractRadius * 0.74, larynx);
    this.root.add(this.larynxTube);

    this.leftFold = tube([
      new THREE.Vector3(-0.1, -1.42, 0.16),
      new THREE.Vector3(-0.01, -1.44, 0.06),
      new THREE.Vector3(0, -1.46, -0.04),
    ], r.foldRadius, fold);
    this.rightFold = tube([
      new THREE.Vector3(0.16, -1.42, 0.16),
      new THREE.Vector3(0.08, -1.44, 0.06),
      new THREE.Vector3(0.06, -1.46, -0.04),
    ], r.foldRadius, fold);
    this.root.add(this.leftFold);
    this.root.add(this.rightFold);

    this.airflowCurves = [
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.02, 0.24, 0.98),
        new THREE.Vector3(0.03, -0.06, 0.5),
        new THREE.Vector3(0.04, -0.4, 0.1),
        new THREE.Vector3(0.04, -1.04, 0.06),
        new THREE.Vector3(0.04, -1.72, 0.14),
      ]),
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.06, 0.24, 0.98),
        new THREE.Vector3(0.05, -0.06, 0.5),
        new THREE.Vector3(0.04, -0.4, 0.1),
        new THREE.Vector3(0.04, -1.04, 0.06),
        new THREE.Vector3(0.04, -1.72, 0.14),
      ]),
    ];
    addParticlesOnCurves(this.root, this.airflowParticles, this.airflowCurves, 42, 0.011);
  }

  buildFieldCurrents() {
    this.fieldCurves = [
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-2.4, 1.6, 1.4),
        new THREE.Vector3(-1.6, 0.4, 0.2),
        new THREE.Vector3(-1.8, -1.1, -0.8),
        new THREE.Vector3(-2.2, -2.0, 0.6),
      ]),
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(2.6, 1.8, 0.8),
        new THREE.Vector3(2.1, 0.2, -0.4),
        new THREE.Vector3(2.4, -1.3, 0.5),
        new THREE.Vector3(2.0, -2.1, 1.4),
      ]),
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.2, 2.3, -1.6),
        new THREE.Vector3(0.8, 1.7, -2.0),
        new THREE.Vector3(1.6, 0.4, -1.7),
        new THREE.Vector3(0.4, -0.8, -2.1),
      ]),
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-2.0, -2.2, 1.8),
        new THREE.Vector3(-0.2, -2.4, 1.1),
        new THREE.Vector3(1.5, -2.2, 0.4),
        new THREE.Vector3(2.4, -1.8, -0.6),
      ]),
    ];
    addParticlesOnCurves(this.scene, this.fieldParticles, this.fieldCurves, 36, 0.016);
  }

  applyCamera() {
    const distance = this.baseDistance / this.zoom;
    this.camera.position.copy(this.lookAt).addScaledVector(this.viewDir, distance);
    this.camera.lookAt(this.lookAt);
    this.camera.updateProjectionMatrix();
  }

  update(plan, timeMs, { skullState = null } = {}) {
    this.resize();
    const pose = plan?.simulatedBreath?.pose || {};
    const flowRate = Math.max(0.12, pose.flowRate ?? 0);
    const flowDirection = pose.flowDirection ?? -1;

    const headAmount = skullState?.headAmount ?? plan?.inferredRegistration?.skullRim ?? 0;
    this.headHalo.material.opacity = headAmount > 0.04
      ? 0.16 + headAmount * 0.45 + 0.08 * Math.sin(timeMs * 0.004)
      : 0.07;

    const flutter = 0.01 + 0.018 * flowRate * Math.sin(timeMs * 0.018);
    this.leftFold.position.x = -flutter;
    this.rightFold.position.x = flutter;

    const gaze = Math.sin(timeMs * 0.00062) * 0.12;
    for (const iris of this.irises) {
      iris.rotation.y = gaze;
    }
    const cycle = timeMs % 4200;
    const lid = cycle < 90 ? cycle / 90 : cycle < 150 ? 1 - (cycle - 90) / 60 : 0;
    for (const eyelid of this.eyelids) {
      eyelid.scale.y = 0.08 + lid * 0.92;
      eyelid.visible = lid > 0.04;
    }

    animateParticles(this.airflowParticles, this.airflowCurves, timeMs, flowDirection, flowRate, 0.00016);
    animateParticles(this.fieldParticles, this.fieldCurves, timeMs, flowDirection, Math.max(0.35, flowRate), 0.00011);

    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const width = Math.max(1, Math.round(this.canvas.clientWidth));
    const height = Math.max(1, Math.round(this.canvas.clientHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.applyCamera();
    }
  }

  bindInteraction() {
    this.canvas.style.cursor = 'zoom-in';
    const host = this.canvas.closest('dialog') || this.canvas;
    host.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.zoom = nextSkullZoom(this.zoom, event.deltaY);
      this.applyCamera();
    }, { passive: false });
  }
}

const SKULL_OUTLINE = [
  [0.52, 1.08],
  [0.22, 1.32],
  [-0.18, 1.36],
  [-0.62, 1.18],
  [-0.98, 0.78],
  [-1.12, 0.28],
  [-1.02, -0.12],
  [-0.72, -0.28],
  [-0.38, -0.24],
  [-0.08, -0.12],
  [0.18, -0.22],
  [0.58, -0.3],
  [0.92, -0.26],
  [1.02, 0.02],
  [0.86, 0.22],
  [0.7, 0.42],
  [0.78, 0.62],
  [0.58, 0.86],
];

const MANDIBLE_OUTLINE = [
  [0.9, -0.34],
  [0.98, -0.52],
  [0.72, -0.92],
  [0.38, -1.08],
  [0.12, -0.98],
  [0.18, -0.62],
  [0.42, -0.44],
  [0.7, -0.36],
];

function extrudeSagittal(pairs, depth, material, bevel = 0.04) {
  const shape = new THREE.Shape();
  pairs.forEach(([z, y], index) => {
    if (index === 0) shape.moveTo(z, y);
    else shape.lineTo(z, y);
  });
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.y = Math.PI / 2;
  mesh.position.x = -depth * 0.15;
  return mesh;
}

function addEyeball(renderer, side, x, y, z) {
  const group = new THREE.Group();
  group.position.set(x, y, z);

  const sclera = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 28, 20),
    new THREE.MeshStandardMaterial({ color: 0xf3eee6, roughness: 0.28, metalness: 0.04 }),
  );
  group.add(sclera);

  const iris = new THREE.Mesh(
    new THREE.SphereGeometry(0.072, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0x2f6d6a, emissive: 0x163a3c, roughness: 0.35 }),
  );
  iris.position.z = 0.11;
  group.add(iris);
  renderer.irises.push(iris);

  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(0.032, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0x07080c, roughness: 0.2 }),
  );
  pupil.position.z = 0.155;
  iris.add(pupil);

  const shine = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  shine.position.set(-0.03, 0.04, 0.17);
  group.add(shine);

  const lidGeo = new THREE.SphereGeometry(0.168, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const lidMat = new THREE.MeshStandardMaterial({ color: 0x3a2c2e, roughness: 0.7 });
  const upper = new THREE.Mesh(lidGeo, lidMat);
  upper.rotation.x = Math.PI;
  upper.position.y = 0.02;
  const lower = new THREE.Mesh(lidGeo, lidMat);
  lower.position.y = -0.02;
  group.add(upper);
  group.add(lower);
  renderer.eyelids.push(upper, lower);

  return group;
}

function addParticlesOnCurves(parent, bucket, curves, count, radius) {
  const material = chamberMat(0xaaf7ff, 0.9, 0x4fddea);
  for (let curveIndex = 0; curveIndex < curves.length; curveIndex++) {
    for (let i = 0; i < count; i++) {
      const particle = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), material.clone());
      particle.userData.curveIndex = curveIndex;
      particle.userData.offset = i / count;
      parent.add(particle);
      bucket.push(particle);
    }
  }
}

function animateParticles(particles, curves, timeMs, flowDirection, flowRate, speedBase) {
  const holding = Math.abs(flowDirection) < 0.12;
  const speed = speedBase * (0.45 + Math.max(holding ? 0.22 : 0, flowRate));
  for (let index = 0; index < particles.length; index++) {
    const particle = particles[index];
    const curve = curves[particle.userData.curveIndex];
    const localDir = holding ? (index % 2 === 0 ? 1 : -1) : (flowDirection < 0 ? -1 : 1);
    const raw = (timeMs * speed + particle.userData.offset) % 1;
    const t = localDir < 0 ? raw : 1 - raw;
    particle.position.copy(curve.getPointAt(t));
    const blink = 0.18 + 0.82 * Math.max(0, Math.sin(timeMs * 0.046 + particle.userData.offset * 18)) ** 8;
    particle.material.opacity = (0.22 + Math.max(0.18, flowRate) * 0.55) * blink;
    const scale = 0.7 + blink * 0.7;
    particle.scale.setScalar(scale);
  }
}

function ring(rx, ry, tubeRadius, meshMaterial) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, tubeRadius, 8, 48), meshMaterial);
  mesh.scale.set(rx, ry, 1);
  return mesh;
}

function tube(points, radius, meshMaterial) {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(18, points.length * 14), radius, 8, false),
    meshMaterial,
  );
}

function boneMat(color, opacity = 1, emissive = 0x2a241c) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.07,
    transparent: opacity < 1,
    opacity,
    metalness: 0.06,
    roughness: 0.64,
    side: THREE.DoubleSide,
  });
}

function chamberMat(color, opacity = 0.35, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    transparent: true,
    opacity,
    metalness: 0.04,
    roughness: 0.38,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}
