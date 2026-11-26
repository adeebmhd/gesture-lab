// Gesture Lab — hand gestures + facial expressions, tracked locally in the browser.
// Models: MediaPipe HandLandmarker + FaceLandmarker (tasks-vision).

const VISION_VERSION = "0.10.14";
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}`;
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const trail = document.getElementById("trail");
const tctx = trail.getContext("2d");
const stageInner = document.getElementById("stageInner");
const stageEmpty = document.getElementById("stageEmpty");
const emptyText = document.getElementById("emptyText");
const newTabLink = document.getElementById("newTabLink");
const cameraBtn = document.getElementById("cameraBtn");
const mirrorBtn = document.getElementById("mirrorBtn");
const snapBtn = document.getElementById("snapBtn");
const snapBtn2 = document.getElementById("snapBtn2");
const drawBtn = document.getElementById("drawBtn");
const meshBtn = document.getElementById("meshBtn");
const clearBtn = document.getElementById("clearBtn");
const statusPill = document.getElementById("statusPill");
const statusText = document.getElementById("statusText");
const fpsPill = document.getElementById("fpsPill");
const moodPill = document.getElementById("moodPill");
const gestureBadge = document.getElementById("gestureBadge");
const badgeEmoji = document.getElementById("badgeEmoji");
const badgeName = document.getElementById("badgeName");
const gestureEmoji = document.getElementById("gestureEmoji");
const gestureName = document.getElementById("gestureName");
const gestureSub = document.getElementById("gestureSub");
const pinchFill = document.getElementById("pinchFill");
const pinchValue = document.getElementById("pinchValue");
const historyEl = document.getElementById("history");
const faceEmoji = document.getElementById("faceEmoji");
const faceName = document.getElementById("faceName");
const faceSub = document.getElementById("faceSub");
const handsValue = document.getElementById("handsValue");
const faceValue = document.getElementById("faceValue");
const confValue = document.getElementById("confValue");
const fingerChips = [...document.querySelectorAll(".finger")];
const gestureLegend = document.getElementById("legend");
const faceLegend = document.getElementById("faceLegend");
const aurora = document.getElementById("aurora");
const bars = {
  smile: document.getElementById("barSmile"),
  jaw: document.getElementById("barJaw"),
  blink: document.getElementById("barBlink"),
  kiss: document.getElementById("barKiss"),
};

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];
const LEFT_BROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const RIGHT_BROW = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const LIPS_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const NOSE_LINE = [168, 6, 197, 195, 5, 4, 1, 2];

const HAND_COLORS = ["#43e7f5", "#9b7bff"];

const GESTURE_LEGEND = [
  ["✊", "Fist"],
  ["🖐️", "Open palm"],
  ["✌️", "Peace"],
  ["☝️", "Pointing"],
  ["👍", "Thumbs up"],
  ["👎", "Thumbs down"],
  ["👌", "OK sign"],
  ["🤏", "Pinch"],
  ["🤘", "Rock on"],
  ["🤙", "Call me"],
  ["🤟", "I love you"],
  ["🔫", "Finger gun"],
];

const FACE_LEGEND = [
  ["😄", "Big smile"],
  ["🙂", "Smile"],
  ["😮", "Surprised"],
  ["😉", "Winking"],
  ["😑", "Eyes closed"],
  ["😗", "Kiss"],
  ["😠", "Angry"],
  ["😛", "Tongue out"],
];

const FUN_GESTURES = new Set(["Peace", "Thumbs up", "Rock on", "I love you", "OK sign", "Call me"]);

const state = {
  running: false,
  loading: false,
  handLandmarker: null,
  faceLandmarker: null,
  stream: null,
  raf: null,
  lastVideoTime: -1,
  frames: 0,
  fpsStamp: 0,
  handHistory: [],
  faceHistory: [],
  currentGesture: null,
  currentFace: null,
  airDraw: false,
  faceMesh: true,
  drawing: false,
  fistFrames: 0,
  lastBurst: 0,
  particles: [],
  trailHue: 180,
};

/* ----------------------------------- UI ---------------------------------- */

function setStatus(text, tone = "") {
  statusText.textContent = text;
  statusPill.classList.toggle("active", tone === "active");
  statusPill.classList.toggle("warn", tone === "warn");
}

function inIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function buildLegend(el, entries) {
  el.innerHTML = "";
  for (const [emoji, name] of entries) {
    const li = document.createElement("li");
    li.dataset.name = name;
    li.innerHTML = `<span class="legend-emoji">${emoji}</span><span>${name}</span>`;
    el.appendChild(li);
  }
}
buildLegend(gestureLegend, GESTURE_LEGEND);
buildLegend(faceLegend, FACE_LEGEND);

function highlight(el, name) {
  el.querySelectorAll("li").forEach((li) => li.classList.toggle("active", li.dataset.name === name));
}

function pushHistory(emoji, name) {
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.innerHTML = `<span>${emoji}</span><span>${name}</span>`;
  historyEl.prepend(chip);
  while (historyEl.children.length > 4) historyEl.lastElementChild.remove();
}

const AURAS = {
  happy: ["rgba(255, 196, 87, 0.22)", "rgba(255, 124, 156, 0.22)", "rgba(255, 231, 153, 0.1)"],
  surprised: ["rgba(155, 123, 255, 0.3)", "rgba(67, 231, 245, 0.22)", "rgba(155, 123, 255, 0.1)"],
  angry: ["rgba(255, 92, 92, 0.26)", "rgba(255, 124, 156, 0.2)", "rgba(255, 92, 92, 0.08)"],
  kiss: ["rgba(255, 124, 156, 0.26)", "rgba(155, 123, 255, 0.18)", "rgba(255, 124, 156, 0.08)"],
  calm: ["rgba(67, 231, 245, 0.18)", "rgba(155, 123, 255, 0.22)", "rgba(182, 255, 107, 0.08)"],
};

function setAura(mood) {
  const [a, b, c] = AURAS[mood] || AURAS.calm;
  aurora.style.setProperty("--aura-1", a);
  aurora.style.setProperty("--aura-2", b);
  aurora.style.setProperty("--aura-3", c);
}

function resetReadout() {
  state.handHistory = [];
  state.faceHistory = [];
  state.currentGesture = null;
  state.currentFace = null;
  gestureBadge.hidden = true;
  gestureEmoji.textContent = "🖐️";
  gestureName.textContent = "No hand yet";
  gestureSub.textContent = "Show a hand to the camera";
  faceEmoji.textContent = "😐";
  faceName.textContent = "No face yet";
  faceSub.textContent = "Look towards the camera";
  moodPill.textContent = "😐 Neutral";
  pinchFill.style.width = "0%";
  pinchValue.textContent = "0%";
  handsValue.textContent = "0";
  faceValue.textContent = "0";
  confValue.textContent = "—";
  historyEl.innerHTML = "";
  fingerChips.forEach((chip) => chip.classList.remove("up"));
  Object.values(bars).forEach((bar) => (bar.style.width = "0%"));
  gestureLegend.querySelectorAll("li").forEach((li) => li.classList.remove("active"));
  faceLegend.querySelectorAll("li").forEach((li) => li.classList.remove("active"));
  setAura("calm");
}

/* ------------------------------ Hand analysis ----------------------------- */

function analyzeHand(landmarks, aspect) {
  const dist = (a, b) =>
    Math.hypot((landmarks[a].x - landmarks[b].x) * aspect, landmarks[a].y - landmarks[b].y);

  const wrist = 0;
  const palmWidth = Math.max(dist(5, 17), 1e-4);
  const extended = [
    dist(4, 5) > dist(2, 5) * 1.2,
    dist(8, wrist) > dist(6, wrist) * 1.08,
    dist(12, wrist) > dist(10, wrist) * 1.08,
    dist(16, wrist) > dist(14, wrist) * 1.08,
    dist(20, wrist) > dist(18, wrist) * 1.08,
  ];

  return {
    extended,
    pinch: dist(4, 8) / palmWidth,
    count: extended.filter(Boolean).length,
  };
}

function classifyHand(landmarks, aspect) {
  const a = analyzeHand(landmarks, aspect);
  const ext = a.extended;
  const key = ext.map((v) => (v ? 1 : 0)).join("");
  const pinchTight = a.pinch < 0.32;
  let gesture;

  if (pinchTight && ext[2] && ext[3] && ext[4]) {
    gesture = { emoji: "👌", name: "OK sign" };
  } else if (pinchTight && a.count <= 2) {
    gesture = { emoji: "🤏", name: "Pinch" };
  } else {
    const table = {
      "00000": ["✊", "Fist"],
      "11111": ["🖐️", "Open palm"],
      "01111": ["🖐️", "Four fingers"],
      "11100": ["✋", "Three fingers"],
      "01100": ["✌️", "Peace"],
      "01000": ["☝️", "Pointing"],
      "01001": ["🤘", "Rock on"],
      "11001": ["🤟", "I love you"],
      "11000": ["🔫", "Finger gun"],
      "10001": ["🤙", "Call me"],
    };

    if (key === "10000") {
      const up = landmarks[4].y < landmarks[0].y;
      gesture = up ? { emoji: "👍", name: "Thumbs up" } : { emoji: "👎", name: "Thumbs down" };
    } else if (table[key]) {
      gesture = { emoji: table[key][0], name: table[key][1] };
    } else {
      gesture = { emoji: "🖐️", name: `${a.count} finger${a.count === 1 ? "" : "s"} up` };
    }
  }

  return { ...gesture, ...a };
}

function smoothName(historyRef, candidate, maxLen) {
  const history = historyRef;
  history.push(candidate);
  if (history.length > maxLen) history.shift();

  const tally = new Map();
  let best = candidate;
  let bestVotes = 0;
  for (const name of history) {
    const votes = (tally.get(name) || 0) + 1;
    tally.set(name, votes);
    if (votes > bestVotes) {
      bestVotes = votes;
      best = name;
    }
  }
  return bestVotes >= 3 ? best : candidate;
}

/* ----------------------------- Face analysis ------------------------------ */

function readBlendshapes(categories) {
  const m = {};
  for (const c of categories) m[c.categoryName] = c.score;
  const pair = (a, b) => ((m[a] || 0) + (m[b] || 0)) / 2;
  return {
    smile: pair("mouthSmileLeft", "mouthSmileRight"),
    blinkLeft: m.eyeBlinkLeft || 0,
    blinkRight: m.eyeBlinkRight || 0,
    blink: pair("eyeBlinkLeft", "eyeBlinkRight"),
    jaw: m.jawOpen || 0,
    pucker: m.mouthPucker || 0,
    browDown: pair("browDownLeft", "browDownRight"),
    browUp: m.browInnerUp || 0,
    cheek: m.cheekPuff || 0,
    tongue: m.tongueOut || 0,
  };
}

function classifyFace(shapes) {
  const m = readBlendshapes(shapes);

  if (m.tongue > 0.32) return { emoji: "😛", name: "Tongue out", mood: "calm", ...m };
  if (m.blinkLeft > 0.5 && m.blinkRight < 0.25) return { emoji: "😉", name: "Winking", mood: "kiss", ...m };
  if (m.blinkRight > 0.5 && m.blinkLeft < 0.25) return { emoji: "😉", name: "Winking", mood: "kiss", ...m };
  if (m.blink > 0.55) return { emoji: "😑", name: "Eyes closed", mood: "calm", ...m };
  if (m.jaw > 0.45 && m.browUp > 0.2) return { emoji: "😮", name: "Surprised", mood: "surprised", ...m };
  if (m.smile > 0.6) return { emoji: "😄", name: "Big smile", mood: "happy", ...m };
  if (m.smile > 0.32) return { emoji: "🙂", name: "Smile", mood: "happy", ...m };
  if (m.pucker > 0.42) return { emoji: "😗", name: "Kiss", mood: "kiss", ...m };
  if (m.browDown > 0.5) return { emoji: "😠", name: "Angry", mood: "angry", ...m };
  if (m.cheek > 0.35) return { emoji: "😳", name: "Cheeks puffed", mood: "surprised", ...m };
  return { emoji: "😐", name: "Neutral", mood: "calm", ...m };
}

/* --------------------------------- Canvas -------------------------------- */

let view = { vw: 4, vh: 3, scale: 1, ox: 0, oy: 0 };

function resizeCanvas() {
  const rect = stageInner.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const c of [overlay, trail]) {
    c.width = Math.max(1, Math.round(rect.width * dpr));
    c.height = Math.max(1, Math.round(rect.height * dpr));
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateView(rect.width, rect.height);
}

function updateView(cw, ch) {
  const vw = video.videoWidth || 4;
  const vh = video.videoHeight || 3;
  const scale = Math.min(cw / vw, ch / vh);
  view = { vw, vh, scale, ox: (cw - vw * scale) / 2, oy: (ch - vh * scale) / 2 };
}

function toCanvas(point) {
  return [view.ox + point.x * view.vw * view.scale, view.oy + point.y * view.vh * view.scale];
}

function clearTrail() {
  tctx.save();
  tctx.setTransform(1, 0, 0, 1, 0, 0);
  tctx.clearRect(0, 0, trail.width, trail.height);
  tctx.restore();
}

function drawFaceMesh(landmarks) {
  const pts = landmarks.map(toCanvas);
  const drawPath = (indices, color, alpha, width, closed) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    indices.forEach((idx, i) => {
      const [x, y] = pts[idx];
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (closed) ctx.closePath();
    ctx.stroke();
    ctx.restore();
  };

  drawPath(FACE_OVAL, "#9b7bff", 0.35, 1.4, true);
  drawPath(LEFT_EYE, "#43e7f5", 0.6, 1.6, true);
  drawPath(RIGHT_EYE, "#43e7f5", 0.6, 1.6, true);
  drawPath(LEFT_BROW, "#ff7c9c", 0.4, 1.4, false);
  drawPath(RIGHT_BROW, "#ff7c9c", 0.4, 1.4, false);
  drawPath(LIPS_OUTER, "#43e7f5", 0.45, 1.6, true);
  drawPath(NOSE_LINE, "#dfe4ff", 0.22, 1.2, false);

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.7;
  for (const idx of [33, 263, 1, 61, 291, 199]) {
    const [x, y] = pts[idx];
    ctx.beginPath();
    ctx.arc(x, y, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHand(landmarks, index) {
  const color = HAND_COLORS[index % HAND_COLORS.length];
  const pts = landmarks.map(toCanvas);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.moveTo(pts[a][0], pts[a][1]);
    ctx.lineTo(pts[b][0], pts[b][1]);
  }
  ctx.stroke();

  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.arc(
    pts[9][0],
    pts[9][1],
    Math.max(12, 0.35 * Math.hypot(pts[17][0] - pts[5][0], pts[17][1] - pts[5][1])),
    0,
    Math.PI * 2
  );
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 12;
  pts.forEach(([x, y], i) => {
    const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
    const isWrist = i === 0;
    ctx.beginPath();
    ctx.arc(x, y, isTip ? 5.5 : isWrist ? 6 : 3.2, 0, Math.PI * 2);
    ctx.fillStyle = isTip ? "#ffffff" : color;
    ctx.fill();
    if (isTip) {
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  });
  ctx.restore();
}

/* ------------------------------- Air drawing ------------------------------ */

let lastDrawPoint = null;

function airDrawStep(landmarks, hand) {
  const [x, y] = toCanvas(landmarks[8]);
  const drawing = state.airDraw && hand.pinch < 0.32;

  if (drawing) {
    if (lastDrawPoint) {
      state.trailHue = (state.trailHue + 1.6) % 360;
      tctx.save();
      tctx.strokeStyle = `hsl(${state.trailHue} 90% 62%)`;
      tctx.lineWidth = 7;
      tctx.lineCap = "round";
      tctx.lineJoin = "round";
      tctx.shadowColor = `hsl(${state.trailHue} 90% 62%)`;
      tctx.shadowBlur = 14;
      tctx.beginPath();
      tctx.moveTo(lastDrawPoint[0], lastDrawPoint[1]);
      tctx.lineTo(x, y);
      tctx.stroke();
      tctx.restore();

      // Cursor ring so people see exactly where the ink lands.
      ctx.save();
      ctx.strokeStyle = `hsl(${state.trailHue} 90% 70%)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    lastDrawPoint = [x, y];
  } else {
    lastDrawPoint = null;
  }
}

/* -------------------------------- Confetti -------------------------------- */

const CONFETTI_COLORS = ["#43e7f5", "#9b7bff", "#b6ff6b", "#ff7c9c", "#ffd166"];

function burstAt(landmarks) {
  const [x, y] = toCanvas(landmarks[9]);
  for (let i = 0; i < 46; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.6 + Math.random() * 4.4;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1,
      size: 2 + Math.random() * 4,
      color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
      spin: (Math.random() - 0.5) * 0.3,
      rot: Math.random() * Math.PI,
    });
  }
  if (state.particles.length > 260) state.particles.splice(0, state.particles.length - 260);
}

function stepParticles() {
  if (!state.particles.length) return;
  state.particles = state.particles.filter((p) => p.life > 0);
  for (const p of state.particles) {
    p.vy += 0.14;
    p.vx *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.spin;
    p.life -= 0.012;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6);
    ctx.restore();
  }
}

/* --------------------------------- Models -------------------------------- */

async function loadModels() {
  if (state.handLandmarker && state.faceLandmarker) return;
  const vision = await import(`${CDN}/vision_bundle.mjs`);
  const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);

  const build = async (delegate) => {
    const hand = await vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    const face = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    });
    return { hand, face };
  };

  try {
    const models = await build("GPU");
    state.handLandmarker = models.hand;
    state.faceLandmarker = models.face;
  } catch (gpuError) {
    console.warn("GPU delegate unavailable, falling back to CPU.", gpuError);
    const models = await build("CPU");
    state.handLandmarker = models.hand;
    state.faceLandmarker = models.face;
  }
}

/* ---------------------------------- Loop --------------------------------- */

function tick(now) {
  if (!state.running) return;
  state.raf = requestAnimationFrame(tick);

  if (video.readyState < 2 || !state.handLandmarker || video.currentTime === state.lastVideoTime) return;
  state.lastVideoTime = video.currentTime;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.restore();

  let handResult = null;
  let faceResult = null;
  try {
    handResult = state.handLandmarker.detectForVideo(video, now);
  } catch (err) {
    console.warn("Hand frame skipped:", err);
  }
  try {
    faceResult = state.faceLandmarker.detectForVideo(video, now);
  } catch (err) {
    console.warn("Face frame skipped:", err);
  }

  const hands = handResult?.landmarks || [];
  const faces = faceResult?.faceLandmarks || [];
  handsValue.textContent = String(hands.length);
  faceValue.textContent = String(faces.length);

  // Face first so hands draw on top.
  if (faces.length && state.faceMesh) drawFaceMesh(faces[0]);

  if (faces.length && faceResult?.faceBlendshapes?.[0]) {
    const raw = classifyFace(faceResult.faceBlendshapes[0].categories);
    const stableName = smoothName(state.faceHistory, raw.name, 4);
    const shown = stableName === raw.name ? raw : { ...raw, name: stableName };
    paintFace(shown);
  } else {
    paintNoFace();
  }

  if (hands.length) {
    const aspect = (video.videoWidth || 4) / (video.videoHeight || 3);
    const hand = hands[0];
    const raw = classifyHand(hand, aspect);
    const stableName = smoothName(state.handHistory, raw.name, 6);
    const shown = stableName === raw.name ? raw : { ...raw, name: stableName };

    paintHand(shown, hands.length);
    drawHand(hand, 0);
    if (hands[1]) drawHand(hands[1], 1);
    airDrawStep(hand, raw);

    if (state.currentGesture?.name !== shown.name) {
      pushHistory(shown.emoji, shown.name);
      const t = performance.now();
      if (FUN_GESTURES.has(shown.name) && t - state.lastBurst > 900) {
        burstAt(hand);
        state.lastBurst = t;
      }
      state.currentGesture = { name: shown.name, emoji: shown.emoji };
    }

    // Hold a fist to wipe the drawing.
    if (raw.count === 0) {
      state.fistFrames += 1;
      if (state.airDraw && state.fistFrames === 18) clearTrail();
    } else {
      state.fistFrames = 0;
    }

    const score = handResult?.handedness?.[0]?.[0]?.score;
    if (typeof score === "number") confValue.textContent = `${Math.round(score * 100)}%`;
  } else {
    paintNoHand();
  }

  stepParticles();

  state.frames += 1;
  if (!state.fpsStamp) state.fpsStamp = now;
  const elapsed = now - state.fpsStamp;
  if (elapsed >= 500) {
    fpsPill.textContent = `${Math.round((state.frames * 1000) / elapsed)} fps`;
    state.frames = 0;
    state.fpsStamp = now;
  }
}

/* -------------------------------- Painting -------------------------------- */

let lastHandPaint = { emoji: "", name: "", count: -1 };
let lastFacePaint = { emoji: "", name: "" };

function paintHand(hand, handCount) {
  if (hand.emoji !== lastHandPaint.emoji) {
    gestureEmoji.textContent = hand.emoji;
    gestureEmoji.classList.add("pop");
    setTimeout(() => gestureEmoji.classList.remove("pop"), 160);
    badgeEmoji.textContent = hand.emoji;
  }
  if (hand.name !== lastHandPaint.name) {
    gestureName.textContent = hand.name;
    badgeName.textContent = hand.name;
    highlight(gestureLegend, hand.name);
  }
  gestureBadge.hidden = false;
  gestureSub.textContent = `${hand.count} finger${hand.count === 1 ? "" : "s"} up · ${handCount} hand${handCount === 1 ? "" : "s"} in frame`;
  fingerChips.forEach((chip, i) => chip.classList.toggle("up", hand.extended[i]));

  const pct = Math.round(Math.max(0, Math.min(1, 1 - hand.pinch)) * 100);
  pinchFill.style.width = `${pct}%`;
  pinchValue.textContent = `${pct}%`;
  lastHandPaint = { emoji: hand.emoji, name: hand.name, count: hand.count };
}

function paintNoHand() {
  gestureBadge.hidden = true;
  gestureEmoji.textContent = "🖐️";
  gestureName.textContent = "No hand yet";
  gestureSub.textContent = "Show a hand to the camera";
  fingerChips.forEach((chip) => chip.classList.remove("up"));
  pinchFill.style.width = "0%";
  pinchValue.textContent = "0%";
  state.handHistory = [];
  state.currentGesture = null;
  lastHandPaint = { emoji: "", name: "", count: -1 };
}

function paintFace(face) {
  if (face.emoji !== lastFacePaint.emoji) {
    faceEmoji.textContent = face.emoji;
    faceEmoji.classList.add("pop");
    setTimeout(() => faceEmoji.classList.remove("pop"), 160);
  }
  if (face.name !== lastFacePaint.name) {
    faceName.textContent = face.name;
    highlight(faceLegend, face.name);
    moodPill.textContent = `${face.emoji} ${face.name}`;
  }
  faceSub.textContent = `smile ${Math.round(face.smile * 100)}% · jaw ${Math.round(face.jaw * 100)}%`;
  setAura(face.mood);

  bars.smile.style.width = `${Math.round(face.smile * 100)}%`;
  bars.jaw.style.width = `${Math.round(face.jaw * 100)}%`;
  bars.blink.style.width = `${Math.round(face.blink * 100)}%`;
  bars.kiss.style.width = `${Math.round(face.pucker * 100)}%`;
  lastFacePaint = { emoji: face.emoji, name: face.name };
}

function paintNoFace() {
  faceEmoji.textContent = "😐";
  faceName.textContent = "No face yet";
  faceSub.textContent = "Look towards the camera";
  moodPill.textContent = "😐 Neutral";
  Object.values(bars).forEach((bar) => (bar.style.width = "0%"));
  faceLegend.querySelectorAll("li").forEach((li) => li.classList.remove("active"));
  setAura("calm");
  state.faceHistory = [];
  lastFacePaint = { emoji: "", name: "" };
}

/* -------------------------------- Snapshot ------------------------------- */

function saveSnapshot() {
  const rect = stageInner.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const shot = document.createElement("canvas");
  shot.width = Math.round(rect.width * scale);
  shot.height = Math.round(rect.height * scale);
  const sctx = shot.getContext("2d");

  sctx.fillStyle = "#06070d";
  sctx.fillRect(0, 0, shot.width, shot.height);

  const vw = video.videoWidth || 4;
  const vh = video.videoHeight || 3;
  const fit = Math.min(shot.width / vw, shot.height / vh);
  const dx = (shot.width - vw * fit) / 2;
  const dy = (shot.height - vh * fit) / 2;

  sctx.save();
  if (mirrorBtn.getAttribute("aria-pressed") === "true") {
    sctx.translate(shot.width, 0);
    sctx.scale(-1, 1);
  }
  sctx.drawImage(video, dx, dy, vw * fit, vh * fit);
  sctx.restore();

  const sx = shot.width / rect.width;
  const sy = shot.height / rect.height;
  sctx.save();
  sctx.scale(sx, sy);
  sctx.drawImage(trail, 0, 0, rect.width, rect.height);
  sctx.drawImage(overlay, 0, 0, rect.width, rect.height);
  sctx.restore();

  sctx.fillStyle = "rgba(6,7,13,0.72)";
  sctx.fillRect(0, shot.height - 44, shot.width, 44);
  sctx.fillStyle = "#eef1ff";
  sctx.font = `${Math.round(14 * scale)}px Inter, system-ui, sans-serif`;
  sctx.fillText(
    `Gesture Lab · ${gestureName.textContent} · ${faceName.textContent}`,
    18 * scale,
    shot.height - 15 * scale
  );

  const link = document.createElement("a");
  link.download = `gesture-lab-${Date.now()}.png`;
  link.href = shot.toDataURL("image/png");
  link.click();
}

/* -------------------------------- Controls ------------------------------- */

function applyMirror() {
  const on = mirrorBtn.getAttribute("aria-pressed") === "true";
  video.classList.toggle("mirrored", on);
  overlay.classList.toggle("mirrored", on);
  trail.classList.toggle("mirrored", on);
  mirrorBtn.textContent = `Mirror: ${on ? "on" : "off"}`;
}

function toggleAirDraw() {
  state.airDraw = !state.airDraw;
  drawBtn.setAttribute("aria-pressed", String(state.airDraw));
  drawBtn.textContent = `Air draw: ${state.airDraw ? "on" : "off"}`;
  if (!state.airDraw) lastDrawPoint = null;
}

function setSnapshotEnabled(on) {
  snapBtn.disabled = !on;
  snapBtn2.disabled = !on;
}

function stopCamera(message = "Camera is off. Press <strong>Start camera</strong> and allow access to begin.") {
  state.running = false;
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = null;
  state.lastVideoTime = -1;
  state.fpsStamp = 0;
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }
  video.classList.remove("live");
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  clearTrail();
  state.particles = [];
  stageEmpty.classList.remove("hidden");
  emptyText.innerHTML = message;
  setStatus("Idle");
  fpsPill.textContent = "0 fps";
  cameraBtn.textContent = "Start camera";
  cameraBtn.classList.remove("stop");
  setSnapshotEnabled(false);
  resetReadout();
}

async function startCamera() {
  if (state.running || state.loading) return;
  state.loading = true;
  cameraBtn.disabled = true;
  stageEmpty.classList.add("hidden");
  newTabLink.classList.add("hidden");
  setStatus("Loading models…", "warn");

  try {
    await loadModels();
  } catch (err) {
    console.error(err);
    state.loading = false;
    cameraBtn.disabled = false;
    stageEmpty.classList.remove("hidden");
    emptyText.textContent =
      "The vision models could not load. Check your internet connection and reload the page.";
    setStatus("Models unavailable", "warn");
    return;
  }

  setStatus("Requesting camera…", "warn");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    state.stream = stream;
    video.srcObject = stream;
    await video.play();

    resizeCanvas();
    state.running = true;
    state.loading = false;
    cameraBtn.disabled = false;
    cameraBtn.textContent = "Stop camera";
    cameraBtn.classList.add("stop");
    video.classList.add("live");
    stageEmpty.classList.add("hidden");
    setStatus("Tracking live", "active");
    setSnapshotEnabled(true);
    state.lastVideoTime = -1;
    state.fpsStamp = 0;
    state.frames = 0;
    state.raf = requestAnimationFrame(tick);
  } catch (err) {
    console.error(err);
    state.loading = false;
    cameraBtn.disabled = false;
    stageEmpty.classList.remove("hidden");

    const blocked = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
    if (blocked) {
      emptyText.textContent = inIframe()
        ? "The camera was blocked inside this preview panel. Open the page in a new tab, then allow camera access."
        : "Camera access was blocked. Allow the camera for this site in your browser, then try again.";
      newTabLink.classList.remove("hidden");
      setStatus("Camera blocked", "warn");
    } else if (err && err.name === "NotFoundError") {
      emptyText.textContent = "No camera was found on this device.";
      setStatus("No camera", "warn");
    } else {
      emptyText.textContent = "The camera could not start. Close other apps using it and try again.";
      setStatus("Camera error", "warn");
    }
  }
}

cameraBtn.addEventListener("click", () => (state.running ? stopCamera() : startCamera()));

mirrorBtn.addEventListener("click", () => {
  mirrorBtn.setAttribute("aria-pressed", String(mirrorBtn.getAttribute("aria-pressed") !== "true"));
  applyMirror();
});

drawBtn.addEventListener("click", toggleAirDraw);
clearBtn.addEventListener("click", clearTrail);

meshBtn.addEventListener("click", () => {
  state.faceMesh = !state.faceMesh;
  meshBtn.setAttribute("aria-pressed", String(state.faceMesh));
  meshBtn.textContent = `Face mesh: ${state.faceMesh ? "on" : "off"}`;
});

for (const btn of [snapBtn, snapBtn2]) {
  btn.addEventListener("click", () => {
    if (state.running) saveSnapshot();
  });
}

window.addEventListener("resize", () => {
  if (state.running) resizeCanvas();
});

window.addEventListener("beforeunload", () => {
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
});

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === "m") mirrorBtn.click();
  else if (key === "s") {
    if (state.running) saveSnapshot();
  } else if (key === "d") toggleAirDraw();
});

applyMirror();
resetReadout();

if (!navigator.mediaDevices?.getUserMedia) {
  emptyText.textContent = "This browser does not support webcam access. Try Chrome, Edge, Firefox or Safari.";
  cameraBtn.disabled = true;
}
