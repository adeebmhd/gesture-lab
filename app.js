// Gesture Lab — real-time hand tracking with MediaPipe HandLandmarker.
// Everything runs locally in the browser: the webcam feed is never uploaded.

const VISION_VERSION = "0.10.14";
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const stageInner = document.getElementById("stageInner");
const stageEmpty = document.getElementById("stageEmpty");
const emptyText = document.getElementById("emptyText");
const newTabLink = document.getElementById("newTabLink");
const cameraBtn = document.getElementById("cameraBtn");
const mirrorBtn = document.getElementById("mirrorBtn");
const statusPill = document.getElementById("statusPill");
const statusText = document.getElementById("statusText");
const fpsPill = document.getElementById("fpsPill");
const gestureBadge = document.getElementById("gestureBadge");
const badgeEmoji = document.getElementById("badgeEmoji");
const badgeName = document.getElementById("badgeName");
const gestureEmoji = document.getElementById("gestureEmoji");
const gestureName = document.getElementById("gestureName");
const gestureSub = document.getElementById("gestureSub");
const pinchFill = document.getElementById("pinchFill");
const pinchValue = document.getElementById("pinchValue");
const handsValue = document.getElementById("handsValue");
const fingerValue = document.getElementById("fingerValue");
const confValue = document.getElementById("confValue");
const fingerChips = [...document.querySelectorAll(".finger")];
const legendEl = document.getElementById("legend");

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const HAND_COLORS = ["#43e7f5", "#9b7bff"];

const LEGEND = [
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

const state = {
  running: false,
  loading: false,
  landmarker: null,
  stream: null,
  raf: null,
  lastVideoTime: -1,
  frames: 0,
  fpsStamp: 0,
  history: [],
  currentGesture: null,
};

/* ---------------------------------- UI ---------------------------------- */

function setStatus(text, tone = "") {
  statusText.textContent = text;
  statusPill.classList.toggle("active", tone === "active");
  statusPill.classList.toggle("warn", tone === "warn");
}

function setEmptyMessage(html) {
  emptyText.innerHTML = html;
}

function inIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function renderLegend() {
  legendEl.innerHTML = "";
  for (const [emoji, name] of LEGEND) {
    const li = document.createElement("li");
    li.dataset.name = name;
    li.innerHTML = `<span class="legend-emoji">${emoji}</span><span>${name}</span>`;
    legendEl.appendChild(li);
  }
}
renderLegend();

function resetReadout() {
  state.history = [];
  state.currentGesture = null;
  gestureBadge.hidden = true;
  gestureEmoji.textContent = "🖐️";
  gestureName.textContent = "No hand yet";
  gestureSub.textContent = "Show a hand to the camera";
  pinchFill.style.width = "0%";
  pinchValue.textContent = "0%";
  handsValue.textContent = "0";
  fingerValue.textContent = "0";
  confValue.textContent = "—";
  fingerChips.forEach((chip) => chip.classList.remove("up"));
  legendEl.querySelectorAll("li").forEach((li) => li.classList.remove("active"));
}

/* ---------------------------- Hand analysis ----------------------------- */

function analyzeHand(landmarks, aspect) {
  // Distances measured in height-normalised units so x/y are comparable.
  const dist = (a, b) =>
    Math.hypot((landmarks[a].x - landmarks[b].x) * aspect, landmarks[a].y - landmarks[b].y);

  const wrist = 0;
  const palmWidth = Math.max(dist(5, 17), 1e-4);

  const extended = [
    dist(4, 5) > dist(2, 5) * 1.2, // thumb: tip pulled away from the index knuckle
    dist(8, wrist) > dist(6, wrist) * 1.08,
    dist(12, wrist) > dist(10, wrist) * 1.08,
    dist(16, wrist) > dist(14, wrist) * 1.08,
    dist(20, wrist) > dist(18, wrist) * 1.08,
  ];

  const pinchRatio = dist(4, 8) / palmWidth;

  return { extended, pinch: pinchRatio, count: extended.filter(Boolean).length };
}

function classify(landmarks, aspect) {
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
      const thumbUp = landmarks[4].y < landmarks[0].y;
      gesture = thumbUp
        ? { emoji: "👍", name: "Thumbs up" }
        : { emoji: "👎", name: "Thumbs down" };
    } else if (table[key]) {
      gesture = { emoji: table[key][0], name: table[key][1] };
    } else {
      gesture = { emoji: "🖐️", name: `${a.count} finger${a.count === 1 ? "" : "s"} up` };
    }
  }

  return { ...gesture, ...a };
}

// Keep the label steady: only switch once a gesture wins the recent vote.
function smoothGesture(candidate) {
  const history = state.history;
  history.push(candidate.name);
  if (history.length > 6) history.shift();

  const tally = new Map();
  let best = candidate.name;
  let bestVotes = 0;
  for (const name of history) {
    const votes = (tally.get(name) || 0) + 1;
    tally.set(name, votes);
    if (votes > bestVotes) {
      bestVotes = votes;
      best = name;
    }
  }

  if (!state.currentGesture || state.currentGesture.name === best) {
    state.currentGesture = { ...candidate, name: best };
    if (best !== candidate.name) {
      const match = LEGEND.find(([, n]) => n === best);
      if (match) state.currentGesture.emoji = match[0];
    }
  } else if (bestVotes >= 3) {
    const match = LEGEND.find(([, n]) => n === best);
    state.currentGesture = { ...candidate, name: best, emoji: match ? match[0] : candidate.emoji };
  }

  return state.currentGesture;
}

/* --------------------------------- Draw --------------------------------- */

let view = { vw: 0, vh: 0, scale: 1, ox: 0, oy: 0 };

function resizeCanvas() {
  const rect = stageInner.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateView(rect.width, rect.height);
}

// "object-fit: contain" mapping so the overlay lines up with the video exactly.
function updateView(cw, ch) {
  const vw = video.videoWidth || 4;
  const vh = video.videoHeight || 3;
  const scale = Math.min(cw / vw, ch / vh);
  view = {
    vw,
    vh,
    scale,
    ox: (cw - vw * scale) / 2,
    oy: (ch - vh * scale) / 2,
  };
}

function toCanvas(point, cw, ch) {
  return [view.ox + point.x * view.vw * view.scale, view.oy + point.y * view.vh * view.scale];
}

function draw(results) {
  const rect = stageInner.getBoundingClientRect();
  const cw = rect.width;
  const ch = rect.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  const hands = results ? results.landmarks || [] : [];
  const cwSafe = cw || 1;
  const chSafe = ch || 1;

  hands.forEach((landmarks, handIndex) => {
    const color = HAND_COLORS[handIndex % HAND_COLORS.length];
    const pts = landmarks.map((p) => toCanvas(p, cwSafe, chSafe));

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

    // Palm ring for a bit of depth.
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(pts[9][0], pts[9][1], Math.max(12, 0.35 * Math.hypot(pts[17][0] - pts[5][0], pts[17][1] - pts[5][1])), 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 12;
    landmarks.forEach((_, i) => {
      const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
      const isWrist = i === 0;
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], isTip ? 5.5 : isWrist ? 6 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = isTip ? "#ffffff" : color;
      ctx.fill();
      if (isTip) {
        ctx.beginPath();
        ctx.arc(pts[i][0], pts[i][1], 9, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });
    ctx.restore();
  });

  if (!hands.length) {
    renderNoHand();
  }
}

/* ------------------------------ Readouts -------------------------------- */

let lastPainted = { emoji: "", name: "", sub: "", fingers: "", conf: "" };

function paintReadout(hand) {
  const emoji = hand.emoji;
  const name = hand.name;

  if (emoji !== lastPainted.emoji) {
    gestureEmoji.textContent = emoji;
    gestureEmoji.classList.add("pop");
    setTimeout(() => gestureEmoji.classList.remove("pop"), 160);
    badgeEmoji.textContent = emoji;
  }
  if (name !== lastPainted.name) {
    gestureName.textContent = name;
    badgeName.textContent = name;
    legendEl.querySelectorAll("li").forEach((li) => {
      li.classList.toggle("active", li.dataset.name === name);
    });
  }
  gestureBadge.hidden = false;

  gestureSub.textContent = `${hand.count} finger${hand.count === 1 ? "" : "s"} up · palm facing the camera`;

  fingerChips.forEach((chip, i) => chip.classList.toggle("up", hand.extended[i]));

  const pinchPct = Math.round(Math.max(0, Math.min(1, 1 - hand.pinch)) * 100);
  pinchFill.style.width = `${pinchPct}%`;
  pinchValue.textContent = `${pinchPct}%`;

  fingerValue.textContent = String(hand.count);
  lastPainted = { emoji, name, sub: gestureSub.textContent, fingers: "", conf: "" };
}

function paintConfidence(score) {
  const pct = `${Math.round(score * 100)}%`;
  if (pct !== lastPainted.conf) {
    confValue.textContent = pct;
    lastPainted.conf = pct;
  }
}

function renderNoHand() {
  handsValue.textContent = "0";
  confValue.textContent = "—";
  fingerValue.textContent = "0";
  fingerChips.forEach((chip) => chip.classList.remove("up"));
  pinchFill.style.width = "0%";
  pinchValue.textContent = "0%";
  gestureBadge.hidden = true;
  gestureEmoji.textContent = "🖐️";
  gestureName.textContent = "No hand yet";
  gestureSub.textContent = "Show a hand to the camera";
  legendEl.querySelectorAll("li").forEach((li) => li.classList.remove("active"));
  state.history = [];
  state.currentGesture = null;
}

/* -------------------------------- Model -------------------------------- */

async function loadLandmarker() {
  if (state.landmarker) return state.landmarker;

  const vision = await import(`${CDN}/vision_bundle.mjs`);
  const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
  const options = {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };

  try {
    state.landmarker = await vision.HandLandmarker.createFromOptions(fileset, options);
  } catch (gpuError) {
    console.warn("GPU delegate unavailable, falling back to CPU.", gpuError);
    state.landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
    });
  }
  return state.landmarker;
}

/* --------------------------------- Loop -------------------------------- */

function tick(now) {
  if (!state.running) return;
  state.raf = requestAnimationFrame(tick);

  if (video.readyState >= 2 && state.landmarker && video.currentTime !== state.lastVideoTime) {
    state.lastVideoTime = video.currentTime;
    let results = null;
    try {
      results = state.landmarker.detectForVideo(video, now);
    } catch (err) {
      console.warn("Hand detection frame skipped:", err);
    }

    if (results) {
      draw(results);
      const hands = results.landmarks || [];
      handsValue.textContent = String(hands.length);

      if (hands.length) {
        const aspect = (video.videoWidth || 4) / (video.videoHeight || 3);
        const raw = classify(hands[0], aspect);
        const smoothed = smoothGesture(raw);
        paintReadout(smoothed);

        const score = results.handedness?.[0]?.[0]?.score;
        if (typeof score === "number") paintConfidence(score);
      }
    }

    state.frames += 1;
    if (!state.fpsStamp) state.fpsStamp = now;
    const elapsed = now - state.fpsStamp;
    if (elapsed >= 500) {
      const fps = Math.round((state.frames * 1000) / elapsed);
      fpsPill.textContent = `${fps} fps`;
      state.frames = 0;
      state.fpsStamp = now;
    }
  }
}

/* ------------------------------- Controls ------------------------------ */

function applyMirror() {
  const on = mirrorBtn.getAttribute("aria-pressed") === "true";
  video.classList.toggle("mirrored", on);
  canvas.classList.toggle("mirrored", on);
  mirrorBtn.textContent = `Mirror: ${on ? "on" : "off"}`;
}

mirrorBtn.addEventListener("click", () => {
  const on = mirrorBtn.getAttribute("aria-pressed") === "true";
  mirrorBtn.setAttribute("aria-pressed", String(!on));
  applyMirror();
});

function stopCamera(message = "Camera is off. Press <strong>Start camera</strong> and allow access to begin.") {
  state.running = false;
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = null;
  state.lastVideoTime = -1;
  state.fpsStamp = 0;
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }
  video.classList.remove("live");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  stageEmpty.classList.remove("hidden");
  setEmptyMessage(message);
  setStatus("Idle");
  fpsPill.textContent = "0 fps";
  cameraBtn.textContent = "Start camera";
  cameraBtn.classList.remove("stop");
  resetReadout();
}

async function startCamera() {
  if (state.running || state.loading) return;
  state.loading = true;
  cameraBtn.disabled = true;
  stageEmpty.classList.add("hidden");
  newTabLink.classList.add("hidden");
  setStatus("Loading hand model…", "warn");

  try {
    await loadLandmarker();
  } catch (err) {
    console.error(err);
    state.loading = false;
    cameraBtn.disabled = false;
    stageEmpty.classList.remove("hidden");
    setEmptyMessage(
      "The hand-tracking model could not load. Check your internet connection and reload the page."
    );
    setStatus("Model unavailable", "warn");
    return;
  }

  setStatus("Requesting camera…", "warn");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });

    state.stream = stream;
    video.srcObject = stream;
    await video.play();

    resizeCanvas();
    updateView(stageInner.clientWidth, stageInner.clientHeight);

    state.running = true;
    state.loading = false;
    cameraBtn.disabled = false;
    cameraBtn.textContent = "Stop camera";
    cameraBtn.classList.add("stop");
    video.classList.add("live");
    stageEmpty.classList.add("hidden");
    setStatus("Tracking live", "active");
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
      setEmptyMessage(
        inIframe()
          ? "The camera was blocked inside this preview panel. Open the page in a new tab, then allow camera access."
          : "Camera access was blocked. Allow the camera for this site in your browser, then try again."
      );
      newTabLink.classList.remove("hidden");
      setStatus("Camera blocked", "warn");
    } else if (err && err.name === "NotFoundError") {
      setEmptyMessage("No camera was found on this device.");
      setStatus("No camera", "warn");
    } else {
      setEmptyMessage("The camera could not start. Close other apps using it and try again.");
      setStatus("Camera error", "warn");
    }
  }
}

cameraBtn.addEventListener("click", () => {
  if (state.running) {
    stopCamera();
  } else {
    startCamera();
  }
});

window.addEventListener("resize", () => {
  if (state.running) resizeCanvas();
});

window.addEventListener("beforeunload", () => {
  if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
});

applyMirror();
resetReadout();

if (!navigator.mediaDevices?.getUserMedia) {
  setEmptyMessage("This browser does not support webcam access. Try Chrome, Edge, Firefox or Safari.");
  cameraBtn.disabled = true;
}
