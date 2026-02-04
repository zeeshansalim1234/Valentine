/* eslint-disable no-unused-vars */
// Journey viewer: full-window, modern pixel art (Gather Town style)
// Arrow keys: walk along path. E: reveal checkpoint.

(() => {
  /** @type {HTMLCanvasElement} */
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });

  const overlay = document.getElementById("overlay");
  const closeOverlayBtn = document.getElementById("closeOverlayBtn");
  const okBtn = document.getElementById("okBtn");
  const cpDate = document.getElementById("cpDate");
  const cpTag = document.getElementById("cpTag");
  const cpImg = document.getElementById("cpImg");
  const cpText = document.getElementById("cpText");
  const cpCarouselPrev = document.getElementById("cpCarouselPrev");
  const cpCarouselNext = document.getElementById("cpCarouselNext");
  const cpCarouselDots = document.getElementById("cpCarouselDots");
  const cpCarouselWrap = document.querySelector(".checkpointCarousel");
  const cpCard = document.querySelector(".checkpointCard");
  const modalTitle = document.getElementById("modalTitle");
  const musicBtn = document.getElementById("musicBtn");
  const valentineOverlay = document.getElementById("valentineOverlay");
  const valentineYesBtn = document.getElementById("valentineYesBtn");
  const valentineCloseBtn = document.getElementById("valentineCloseBtn");
  const valentinePlayArea = document.getElementById("valentinePlayArea");

  // Pixel-art resolution (scaled to fill window; crisp pixels)
  const LOG_W = 480;
  const LOG_H = 270;
  const TILE = 8;
  const COLS = Math.floor(LOG_W / TILE);
  const ROWS = Math.floor(LOG_H / TILE);

  // Romantic pixel palette (soft greens, pinks, roses)
  const COLORS = {
    sky: "#2a3548",
    grass1: "#5a8a6a",
    grass2: "#4a7a5a",
    grass3: "#3d6b4d",
    flower1: "#e8b858",
    flower2: "#e0789a",
    flower3: "#d85878",
    flower4: "#c84868",
    rose: "#b83858",
    water1: "#4a6a82",
    water2: "#3d5a72",
    path: "#6d5344",
    pathLight: "#e088a0",
    pathEdge: "#5a4538",
    checkpoint: "#e8b858",
    checkpointLight: "#f0d078",
    signBg: "#6a6a82",
    signInk: "#e8e4f0",
    bubbleBg: "#2a2838",
    bubbleInk: "#e8e4f0",
  };

  const controls = {
    up: false,
    down: false,
    left: false,
    right: false,
    interact: false,
  };

  // ----- Winding path (organic, no self-crossing: sum of waves so it’s irregular) -----
  const PATH_SAMPLES = 120;
  const pathPts = [];
  const TWO_PI = Math.PI * 2;
  for (let i = 0; i <= PATH_SAMPLES; i++) {
    const t = i / PATH_SAMPLES;
    let x = 45 + 390 * t;
    const y =
      135 +
      55 * Math.sin(t * TWO_PI * 2.3) +
      38 * Math.sin(t * TWO_PI * 3.7) +
      22 * Math.sin(t * TWO_PI * 5.1);

    // Gently bend the path left around where cp5 sits so there’s
    // a bit of free space on the right side of the map for an image asset.
    const bendCenter = 0.6;    // around cp5 (~58% along the path)
    const bendWidth = 0.18;    // how wide the bend region is
    const dx = Math.abs(t - bendCenter) / bendWidth;
    if (dx < 1) {
      const strength = (1 - dx) * (1 - dx); // smooth falloff
      x -= 42 * strength; // shift path left up to ~42px at the center
    }
    pathPts.push({
      x: Math.max(20, Math.min(LOG_W - 20, x)),
      y: Math.max(28, Math.min(LOG_H - 28, y)),
    });
  }

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpPt(a, b, t) {
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  }

  /** Build cumulative lengths for the polyline */
  const segLens = [];
  const cum = [0];
  let totalLen = 0;
  for (let i = 0; i < pathPts.length - 1; i++) {
    const L = dist(pathPts[i], pathPts[i + 1]);
    segLens.push(L);
    totalLen += L;
    cum.push(totalLen);
  }

  function posAtS(s) {
    const ss = clamp(s, 0, totalLen);
    let i = 0;
    while (i < segLens.length && cum[i + 1] < ss) i++;
    const segStart = pathPts[i];
    const segEnd = pathPts[i + 1];
    const segS = ss - cum[i];
    const t = segLens[i] === 0 ? 0 : segS / segLens[i];
    return lerpPt(segStart, segEnd, t);
  }

  function tangentAtS(s) {
    const ss = clamp(s, 0, totalLen);
    let i = 0;
    while (i < segLens.length && cum[i + 1] < ss) i++;
    const a = pathPts[i];
    const b = pathPts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len, segIndex: i };
  }

  // ----- Checkpoints -----
  // Put placeholders now; you can add as many as you want later.
  // Each checkpoint uses "s" (distance along path).
  const loremIpsum = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";
  const checkpoints = [
    { id: "cp-1", title: "The Day I Fell in Love", date: "Oct 29 2025", tag: "Sunset Beach", text: loremIpsum, images: ["./photos/beach.jpeg"], s: totalLen * 0.10 },
    { id: "cp-2", title: "The Most Memorable Day of My Life (So Far)", date: "Nov 2 2025", tag: "Bowen Island", text: loremIpsum, images: ["./photos/bowen.jpeg"], s: totalLen * 0.22 },
    { id: "cp-3", title: "👩‍🍳Our First Cooking Sesh👨‍🍳", date: "Nov 8 2025", tag: "Home", text: loremIpsum, images: ["./photos/cook.jpeg"], s: totalLen * 0.34 },
    { id: "cp-4", title: "The First Time We Had to Say Goodbye 😢", date: "Dec 11 2025", tag: "YVR Airport", text: loremIpsum, images: ["./photos/airport.jpeg"], s: totalLen * 0.46 },
    { id: "cp-5", title: "Our First Getaway", date: "Dec 25 2025", tag: "Sunshine Coast", text: loremIpsum, images: ["./photos/getaway.jpeg", "./photos/getaway2.jpeg"], s: totalLen * 0.58 },
    { id: "cp-6", title: "Our First Christmas Together", date: "Dec 26 2025", tag: "Capilano", text: loremIpsum, images: ["./photos/christmas0.jpeg", "./photos/christmas.jpeg"], s: totalLen * 0.70 },
    { id: "cp-7", title: "Our First New Year Together", date: "Dec 31 2025", tag: "Porteau Cove", text: loremIpsum, images: ["./photos/newyear.jpeg", "./photos/newyear2.jpeg"], s: totalLen * 0.82 },
    {
      id: "cp-8",
      title: "Our Adventures",
      date: "Jan 2026",
      tag: "Whistler",
      imageTags: ["Whistler", "Cypress Mt", "Seymour Mt", "Robson", "Hive"],
      text: loremIpsum,
      images: ["./photos/zipline.jpeg", "./photos/hiking.jpeg", "./photos/skiing.jpeg", "./photos/skating.jpeg", "./photos/wallclimbing.jpeg"],
      s: totalLen * 0.92,
    },
  ].map((cp) => ({ ...cp, pos: posAtS(cp.s) }));

  // ----- Tile map (modern pixel look) -----
  let seed = 1337;
  function rand() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  }
  const tileMap = [];
  for (let y = 0; y < ROWS; y++) {
    tileMap[y] = [];
    for (let x = 0; x < COLS; x++) {
      const edge = x < 2 || y < 2 || x > COLS - 3 || y > ROWS - 3;
      if (edge && rand() < 0.88) {
        tileMap[y][x] = 1;
        continue;
      }
      const r = rand();
      if (r < 0.18) tileMap[y][x] = 2;
      else if (r < 0.24) tileMap[y][x] = 3;
      else if (r < 0.26) tileMap[y][x] = 4;
      else tileMap[y][x] = 0;
    }
  }

  // ----- Resize: canvas fills window -----
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  window.addEventListener("resize", resize);
  resize();

  // ----- Player state (couple) -----
  const player = {
    s: 0,
    speed: 95, // px/sec along path
    bob: 0,
    walkT: 0,
    facing: { x: 1, y: 0 },
  };

  // ----- Audio: try music.mp3, else soft romantic chord loop -----
  const MUSIC_URL = "motion.mp3";
  let audio = {
    ctx: null,
    gain: null,
    track: null,
    timer: null,
    on: false,
    useTrack: false,
  };

  function startRomanticFallback() {
    audio.useTrack = false;
    if (!audio.ctx) {
      audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
      audio.gain = audio.ctx.createGain();
      audio.gain.gain.value = 0.12;
      audio.gain.connect(audio.ctx.destination);
    }
    audio.ctx.resume?.();
    const chordFreqs = [
      [261.63, 329.63, 392],
      [293.66, 369.99, 440],
      [329.63, 415.3, 493.88],
      [349.23, 440, 523.25],
      [392, 493.88, 587.33],
      [261.63, 329.63, 392],
    ];
    let chordIndex = 0;
    if (audio.timer) clearInterval(audio.timer);
    audio.timer = setInterval(() => {
      if (!audio.on || audio.useTrack) return;
      const chord = chordFreqs[chordIndex % chordFreqs.length];
        chord.forEach((freq) => {
          const osc = audio.ctx.createOscillator();
          const env = audio.ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
        env.gain.value = 0;
        osc.connect(env);
        env.connect(audio.gain);
        const t0 = audio.ctx.currentTime;
        env.gain.setValueAtTime(0, t0);
        env.gain.linearRampToValueAtTime(0.15, t0 + 0.08);
        env.gain.exponentialRampToValueAtTime(0.001, t0 + 1.2);
        osc.start(t0);
        osc.stop(t0 + 1.25);
      });
      chordIndex++;
    }, 520);
  }

  function setMusic(on) {
    audio.on = on;
    if (!on) {
      if (audio.track) {
        audio.track.pause();
        audio.track.currentTime = 0;
      }
      if (audio.timer) {
        clearInterval(audio.timer);
        audio.timer = null;
      }
      if (audio.gain) audio.gain.gain.value = 0;
      musicBtn.textContent = "Music: Off";
      musicBtn.setAttribute("aria-pressed", "false");
      return;
    }
    musicBtn.textContent = "Music: On";
    musicBtn.setAttribute("aria-pressed", "true");

    if (!audio.track) {
      audio.track = new Audio();
      audio.track.loop = true;
      audio.track.volume = 0.5;
      audio.track.addEventListener("canplaythrough", () => {
        if (audio.on && !audio.useTrack) {
          if (audio.timer) clearInterval(audio.timer);
          audio.timer = null;
          audio.useTrack = true;
          audio.track.play().catch(() => startRomanticFallback());
        }
      });
      audio.track.addEventListener("error", () => {
        audio.useTrack = false;
        startRomanticFallback();
      });
      audio.track.src = MUSIC_URL;
      audio.track.load();
    }

    if (audio.track.readyState >= 2) {
      audio.useTrack = true;
      audio.track.play().then(() => {}, () => startRomanticFallback());
    } else {
      const t = setTimeout(() => {
        if (!audio.useTrack && audio.on) startRomanticFallback();
      }, 800);
      audio.track.addEventListener("canplaythrough", () => clearTimeout(t), { once: true });
    }
  }

  musicBtn.addEventListener("click", () => setMusic(!audio.on));
  setMusic(true);

  function tryStartMusic() {
    if (!audio.on) return;
    if (audio.track) {
      audio.useTrack = true;
      if (audio.timer) {
        clearInterval(audio.timer);
        audio.timer = null;
      }
      audio.track.play().catch(() => {
        audio.useTrack = false;
        startRomanticFallback();
      });
    } else {
      startRomanticFallback();
    }
  }
  document.addEventListener("keydown", tryStartMusic, { once: true });
  document.addEventListener("click", tryStartMusic, { once: true });
  document.addEventListener("touchstart", tryStartMusic, { once: true });

  // ----- Overlay -----
  let overlayOpen = false;
  let valentineOverlayOpen = false;
  let wasAtEndLastFrame = false;
  let nearestCheckpoint = null;
  const passedCheckpointIds = new Set();

  function openCheckpoint(cp) {
    overlayOpen = true;
    nearestCheckpoint = cp;
    if (cp.title) {
      // Allow slightly larger emoji in titles like cp-3
      const safeTitle = cp.title.replace(/👩‍🍳👨‍🍳/g, '<span class="modalTitleEmoji">👩‍🍳👨‍🍳</span>');
      modalTitle.innerHTML = safeTitle;
    } else {
      modalTitle.textContent = "Checkpoint";
    }
    cpDate.textContent = cp.date || "";
    cpTag.textContent = cp.tag || "Memory";
    cpText.textContent = cp.text || "";

    // For checkpoint 2 only, make the text column even wider
    if (cpCard) {
      cpCard.classList.toggle("checkpointCard--wideText", cp.id === "cp-2");
    }

    const images = cp.images && cp.images.length ? cp.images : (cp.imageSrc ? [cp.imageSrc] : []);
    let carouselIndex = 0;

    function updateCarouselAspect() {
      if (!cpCarouselWrap || !cpImg.naturalWidth || !cpImg.naturalHeight) return;
      const w = cpImg.naturalWidth;
      const h = cpImg.naturalHeight;
      cpCarouselWrap.style.aspectRatio = `${w} / ${h}`;
    }
    cpImg.onload = updateCarouselAspect;

    function setCarouselIndex(i) {
      carouselIndex = (i + images.length) % images.length;
      cpImg.src = images[carouselIndex];
      cpImg.alt = `${cp.title || "Checkpoint"} photo ${carouselIndex + 1} of ${images.length}`;
      if (cp.id === "cp-8" && Array.isArray(cp.imageTags) && cp.imageTags.length >= images.length) {
        cpTag.textContent = cp.imageTags[carouselIndex] || cp.tag || "Memory";
      }
      if (cpCarouselDots) {
        const dots = cpCarouselDots.querySelectorAll(".carouselDots__dot");
        dots.forEach((d, k) => d.classList.toggle("is-active", k === carouselIndex));
      }
    }

    if (images.length > 0) {
      cpImg.src = images[0];
      cpImg.alt = `${cp.title || "Checkpoint"} photo 1 of ${images.length}`;
      if (cp.id === "cp-8" && Array.isArray(cp.imageTags) && cp.imageTags.length >= images.length) {
        cpTag.textContent = cp.imageTags[0] || cp.tag || "Memory";
      }
      if (cpCarouselWrap) {
        if (images.length > 1) {
          cpCarouselWrap.classList.remove("carouselSingle");
          if (cpCarouselDots) {
            cpCarouselDots.innerHTML = "";
            images.forEach((_, i) => {
              const dot = document.createElement("button");
              dot.type = "button";
              dot.className = "carouselDots__dot" + (i === 0 ? " is-active" : "");
              dot.setAttribute("aria-label", `Image ${i + 1}`);
              dot.addEventListener("click", () => setCarouselIndex(i));
              cpCarouselDots.appendChild(dot);
            });
          }
          if (cpCarouselPrev) cpCarouselPrev.onclick = () => setCarouselIndex(carouselIndex - 1);
          if (cpCarouselNext) cpCarouselNext.onclick = () => setCarouselIndex(carouselIndex + 1);
        } else {
          cpCarouselWrap.classList.add("carouselSingle");
        }
      }
      // Ensure aspect ratio matches current image once it's loaded (cached images may already be ready)
      updateCarouselAspect();
    } else {
      if (cpCarouselWrap) {
        cpCarouselWrap.classList.add("carouselSingle");
        cpCarouselWrap.style.aspectRatio = "";
      }
      const svg = encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#1b2b52"/>
              <stop offset="1" stop-color="#0b0f17"/>
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#g)"/>
          <g opacity="0.9">
            <text x="50%" y="46%" dominant-baseline="middle" text-anchor="middle"
              font-family="monospace" font-size="28" fill="#e9f0ff">Add a photo later</text>
            <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
              font-family="monospace" font-size="16" fill="#b7c6e6">Set images in main.js</text>
          </g>
        </svg>
      `);
      cpImg.src = `data:image/svg+xml;charset=utf-8,${svg}`;
      cpImg.alt = "Placeholder";
    }

    overlay.classList.add("is-open");
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    okBtn.focus();
  }

  function closeOverlay() {
    overlayOpen = false;
    overlay.classList.remove("is-open");
    overlay.hidden = true;
    document.body.style.overflow = valentineOverlayOpen ? "hidden" : "";
    try { canvas.focus(); } catch (_) {}
  }

  function moveValentineNotYetButton() {
    if (!valentineCloseBtn || !valentinePlayArea || !valentineYesBtn) return;
    const playRect = valentinePlayArea.getBoundingClientRect();
    const yesRect = valentineYesBtn.getBoundingClientRect();
    const yesLeft = yesRect.left - playRect.left;
    const yesTop = yesRect.top - playRect.top;
    const yesRight = yesLeft + valentineYesBtn.offsetWidth;
    const yesBottom = yesTop + valentineYesBtn.offsetHeight;
    const pad = 4;
    const w = valentinePlayArea.offsetWidth;
    const h = valentinePlayArea.offsetHeight;
    const bw = valentineCloseBtn.offsetWidth;
    const bh = valentineCloseBtn.offsetHeight;
    const maxX = Math.max(0, w - bw);
    const maxY = Math.max(0, h - bh);
    let left;
    let top;
    for (let tries = 0; tries < 30; tries++) {
      left = maxX > 0 ? Math.floor(Math.random() * (maxX + 1)) : 0;
      top = maxY > 0 ? Math.floor(Math.random() * (maxY + 1)) : 0;
      const noRight = left + bw;
      const noBottom = top + bh;
      const overlaps = left < yesRight + pad && noRight > yesLeft - pad && top < yesBottom + pad && noBottom > yesTop - pad;
      if (!overlaps) break;
    }
    valentineCloseBtn.style.transform = "none";
    valentineCloseBtn.style.left = left + "px";
    valentineCloseBtn.style.top = top + "px";
  }

  function openValentinePopup() {
    valentineOverlayOpen = true;
    valentineOverlay.classList.add("is-open");
    valentineOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      valentineCloseBtn.style.left = "";
      valentineCloseBtn.style.top = "";
      valentineCloseBtn.style.transform = "";
      (valentineYesBtn || valentineOverlay.querySelector(".btn--valentine-yes"))?.focus();
    });
  }

  function closeValentinePopup() {
    valentineOverlayOpen = false;
    valentineOverlay.classList.remove("is-open");
    valentineOverlay.hidden = true;
    document.body.style.overflow = overlayOpen ? "hidden" : "";
    try { canvas.focus(); } catch (_) {}
  }

  okBtn.addEventListener("click", (e) => { e.preventDefault(); closeOverlay(); });
  closeOverlayBtn.addEventListener("click", (e) => { e.preventDefault(); closeOverlay(); });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay();
  });
  if (valentineYesBtn) valentineYesBtn.addEventListener("click", (e) => { e.preventDefault(); closeValentinePopup(); });
  if (valentineCloseBtn) {
    valentineCloseBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); moveValentineNotYetButton(); });
    valentineCloseBtn.addEventListener("mouseenter", () => moveValentineNotYetButton());
  }
  valentineOverlay.addEventListener("click", (e) => {
    if (e.target === valentineOverlay) closeValentinePopup();
  });
  // Esc always closes (capture so it runs before anything else)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && (overlayOpen || valentineOverlayOpen)) {
      e.preventDefault();
      e.stopPropagation();
      if (valentineOverlayOpen) closeValentinePopup();
      else closeOverlay();
    }
  }, true);

  // ----- Input -----
  const KEYMAP = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right",
  };

  window.addEventListener("keydown", (e) => {
    if (overlayOpen || valentineOverlayOpen) {
      if (e.key === "Escape") (valentineOverlayOpen ? closeValentinePopup : closeOverlay)();
      return;
    }

    if (e.key in KEYMAP) {
      controls[KEYMAP[e.key]] = true;
      e.preventDefault();
    }
    if (e.key === "e" || e.key === "E") {
      controls.interact = true;
      e.preventDefault();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key in KEYMAP) {
      controls[KEYMAP[e.key]] = false;
      e.preventDefault();
    }
    if (e.key === "e" || e.key === "E") {
      controls.interact = false;
      e.preventDefault();
    }
  });

  // ----- Pixel drawing helpers -----
  function px(x) { return Math.round(x); }
  function pxRect(x, y, w, h, fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(px(x), px(y), px(w), px(h));
  }

  function drawTile(x, y, type) {
    const px_ = x * TILE;
    const py = y * TILE;
    if (type === 1) {
      const c = (x + y) % 2 === 0 ? COLORS.water1 : COLORS.water2;
      pxRect(px_, py, TILE, TILE, c);
      if (rand() < 0.15) pxRect(px_ + 2, py + 3, 2, 1, "#6a9ab022");
      return;
    }
    const g = (x * 11 + y * 7) % 5 < 2 ? COLORS.grass1 : (x + y) % 2 === 0 ? COLORS.grass2 : COLORS.grass3;
    pxRect(px_, py, TILE, TILE, g);
    if ((x + y) % 3 === 0) pxRect(px_ + 2, py + 3, 1, 2, "#3d5a4d");
    if (type === 2) {
      drawPixelFlower(px_ + 4, py + 4, COLORS.flower1, "#fff8e0");
    }
    if (type === 3) {
      drawPixelFlower(px_ + 4, py + 4, COLORS.flower2, COLORS.pathLight);
    }
    if (type === 4) {
      drawPixelFlower(px_ + 4, py + 4, COLORS.flower3, COLORS.flower4);
    }
  }

  function drawPixelFlower(cx, cy, petalColor, centerColor) {
    pxRect(cx - 1, cy - 2, 2, 1, petalColor);
    pxRect(cx - 2, cy - 1, 1, 2, petalColor);
    pxRect(cx + 1, cy - 1, 1, 2, petalColor);
    pxRect(cx - 1, cy + 1, 2, 1, petalColor);
    pxRect(cx - 1, cy - 1, 2, 2, centerColor);
  }

  function drawPath() {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = COLORS.pathEdge;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(pathPts[0].x, pathPts[0].y);
    for (let i = 1; i < pathPts.length; i++) ctx.lineTo(pathPts[i].x, pathPts[i].y);
    ctx.stroke();
    ctx.strokeStyle = COLORS.path;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();
  }

  function drawPathFlower(x, y, variant) {
    const X = px(x);
    const Y = px(y);
    const petal = variant === 0 ? COLORS.flower2 : COLORS.flower1;
    const center = variant === 0 ? COLORS.pathLight : "#fff8e0";
    drawPixelFlower(X, Y, petal, center);
  }

  function drawSign(x, y, label) {
    const X = px(x);
    const Y = px(y);
    ctx.font = "10px Outfit, sans-serif";
    const w = Math.max(36, ctx.measureText(label).width + 16);
    const h = 14;
    pxRect(X - w / 2, Y - h - 8, w, h, COLORS.signBg);
    pxRect(X - 2, Y - 6, 4, 8, "#4a4a5a");
    ctx.fillStyle = COLORS.signInk;
    ctx.font = "10px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, X, Y - h - 8 + h / 2);
  }

  function drawTreesCafeMarker() {
    if (!treesCafeImg.complete || !treesCafeImg.naturalWidth) return;
    // Place the cafe a little bit along the path, near the start
    const startSpot = posAtS(totalLen * 0.04);
    const baseW = 80;
    const scale = baseW / treesCafeImg.naturalWidth;
    const w = baseW;
    const h = treesCafeImg.naturalHeight * scale;
    const cx = startSpot.x;
    const cy = startSpot.y;
    // Draw the cafe image centered just above the path near the start
    ctx.drawImage(treesCafeImg, cx - w / 2, cy - h - 18, w, h);
    // Draw the Oct 2025 banner just to the upper‑right of Trees Cafe
    const cafeTopY = cy - h - 18;
    const signX = cx + w / 2 + 6;  // closer horizontally
    const signY = cafeTopY + 25   // a bit lower, closer to the photo
    drawSign(signX, signY, "Oct 2025");
  }

  function drawTentMarker() {
    if (!tentImg.complete || !tentImg.naturalWidth) return;
    const cp5 = checkpoints.find((c) => c.id === "cp-5");
    if (!cp5 || !cp5.pos) return;
    const base = cp5.pos;
    const baseW = 72;
    const scale = baseW / tentImg.naturalWidth;
    const w = baseW;
    const h = tentImg.naturalHeight * scale;
    const offsetX = 50; // to the right of cp5
    const offsetY = 50; // a bit lower so it doesn't overlap the path
    const cx = base.x + offsetX;
    const cy = base.y + offsetY;
    ctx.drawImage(tentImg, cx - w / 2, cy - h, w, h);
  }

  function drawPlaneMarker() {
    if (!planeImg.complete || !planeImg.naturalWidth) return;
    const cp4 = checkpoints.find((c) => c.id === "cp-4");
    if (!cp4 || !cp4.pos) return;
    const base = cp4.pos;
    const baseW = 72;
    const scale = baseW / planeImg.naturalWidth;
    const w = baseW;
    const h = planeImg.naturalHeight * scale;
    const offsetX = -50; // to the left of cp4
    const offsetY = 70;
    const cx = base.x + offsetX;
    const cy = base.y + offsetY;
    ctx.drawImage(planeImg, cx - w / 2, cy - h, w, h);
  }

  function drawCheckpoint(cp, isNear) {
    const x = px(cp.pos.x);
    const y = px(cp.pos.y);
    const heartPixels = [
      [0, -3], [-1, -3], [1, -3], [-2, -3], [2, -3],
      [-3, -2], [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2], [3, -2],
      [-3, -1], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [3, -1],
      [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0],
      [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1],
      [-1, 2], [0, 2], [1, 2],
      [0, 3],
    ];
    const base = 3;
    const scale = isNear ? 1 + 0.18 * Math.sin(Date.now() * 0.005) : 1;

    const pulse = 0.15 + 0.12 * Math.sin(Date.now() * 0.002);
    ctx.save();
    ctx.globalAlpha = pulse;
    heartPixels.forEach(([dx, dy]) => {
      const gx = x + Math.round(dx * base * 1.35);
      const gy = y + Math.round(dy * base * 1.35);
      const gs = 4;
      pxRect(gx - 1, gy - 1, gs, gs, "#e87898");
    });
    ctx.restore();

    const heartColor = isNear ? "#f06070" : "#c83048";
    const size = base;
    heartPixels.forEach(([dx, dy]) => {
      const sx = x + Math.round(dx * base * scale);
      const sy = y + Math.round(dy * base * scale);
      pxRect(sx, sy, size, size, heartColor);
    });
  }

  function drawSpeechBubble(x, y, text) {
    const X = px(x);
    const Y = px(y);
    const w = 44;
    const h = 14;
    pxRect(X - w / 2, Y - h - 12, w, h, COLORS.bubbleBg);
    pxRect(X - 3, Y - 8, 6, 6, COLORS.bubbleBg);
    ctx.fillStyle = COLORS.bubbleInk;
    ctx.font = "10px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, X, Y - h - 12 + h / 2);
  }

  function drawPerson(px_, py, palette, walkPhase, facing) {
    const x = px(px_);
    const y = px(py);
    const leg = walkPhase < 0.5 ? 0 : 1;
    const lo = leg ? 1 : -1;

    ctx.globalAlpha = 0.3;
    pxRect(x - 5, y - 1, 10, 2, "#000");
    ctx.globalAlpha = 1;

    pxRect(x - 3, y - 10, 2, 8, palette.pants);
    pxRect(x + 1, y - 10, 2, 8, palette.pants);
    pxRect(x - 3 + lo, y - 10, 2, 8, palette.pants2);
    pxRect(x + 1 - lo, y - 10, 2, 8, palette.pants2);
    pxRect(x - 3, y - 2, 2, 2, palette.shoes);
    pxRect(x + 1, y - 2, 2, 2, palette.shoes);

    pxRect(x - 4, y - 18, 8, 8, palette.shirt);
    pxRect(x - 4, y - 18, 8, 1, "#ffffff20");

    pxRect(x - 3, y - 24, 6, 6, palette.skin);
    pxRect(x - 3, y - 24, 6, 2, palette.hair);
    pxRect(x - 3, y - 22, 1, 2, palette.hair);
    pxRect(x + 2, y - 22, 1, 2, palette.hair);
    const ex = facing.x > 0.3 ? 1 : facing.x < -0.3 ? -1 : 0;
    pxRect(x - 2 + ex, y - 21, 1, 1, "#2a2838");
    pxRect(x + 1 + ex, y - 21, 1, 1, "#2a2838");
  }

  const palettes = {
    a: { skin: "#e0b898", hair: "#3d3028", shirt: "#78b0d8", pants: "#4a5568", pants2: "#3d4858", shoes: "#2a2838" },
    b: { skin: "#d8b090", hair: "#6b5070", shirt: "#e088a8", pants: "#4a5568", pants2: "#3d4858", shoes: "#2a2838" },
  };

  const spriteZeecho = new Image();
  const spriteNafeesa = new Image();
  const treesCafeImg = new Image();
  const tentImg = new Image();
  const planeImg = new Image();
  const imgVersion = "?v=" + Date.now();
  spriteZeecho.src = "zeecho-pixel.png" + imgVersion;
  spriteNafeesa.src = "nafeesa-pixel.png" + imgVersion;
  treesCafeImg.src = "trees-cafe.png" + imgVersion;
  tentImg.src = "photos/tent.png" + imgVersion;
  planeImg.src = "plane.png" + imgVersion;

  const SPRITE_HEIGHT = 38;

  function drawCharacterSprite(img, x, y, facing, bob, groundOffset, heightMultiplier) {
    if (!img || !img.complete || !img.naturalWidth) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return;
    const mult = heightMultiplier || 1;
    const scale = (SPRITE_HEIGHT * mult) / h;
    const drawW = w * scale;
    const drawH = h * scale;
    const X = px(x);
    const Y = px(y) + (groundOffset || 0);
    ctx.save();
    ctx.translate(X, Y + (bob || 0));
    if (facing && facing.x < -0.1) ctx.scale(-1, 1);
    ctx.drawImage(img, -drawW / 2, -drawH, drawW, drawH);
    ctx.restore();
  }

  // ----- Heart rain (falling hearts on the map) -----
  const heartRainParticles = [];
  const HEART_RAIN_MAX = 55;
  const HEART_RAIN_SPAWN_INTERVAL = 0.12;
  let heartRainAccum = 0;
  const smallHeartPixels = [
    [0, -2], [-1, -2], [1, -2],
    [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
    [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
    [-1, 1], [0, 1], [1, 1],
    [0, 2],
  ];
  function spawnHeartParticle() {
    const r = () => Math.random();
    heartRainParticles.push({
      x: r() * (LOG_W + 20) - 10,
      y: -8 - r() * 15,
      vy: 35 + r() * 45,
      vx: (r() - 0.5) * 12,
      size: 2,
      alpha: 0.72 + r() * 0.26,
      hue: r() < 0.33 ? "#f06080" : r() < 0.66 ? "#e84870" : "#ff88b0",
      phase: r() * Math.PI * 2,
    });
  }
  function updateHeartRain(dt) {
    const totalCheckpoints = checkpoints.length;
    const passedCount = passedCheckpointIds.size;
    const rainIntensity = totalCheckpoints === 0 ? 0 : passedCount / totalCheckpoints;
    const maxParticles = Math.round(HEART_RAIN_MAX * rainIntensity);
    const spawnInterval = passedCount > 0
      ? HEART_RAIN_SPAWN_INTERVAL * (totalCheckpoints / passedCount)
      : 999;

    heartRainAccum += dt;
    while (heartRainAccum >= spawnInterval && heartRainParticles.length < maxParticles) {
      heartRainAccum -= spawnInterval;
      spawnHeartParticle();
    }
    for (let i = heartRainParticles.length - 1; i >= 0; i--) {
      const p = heartRainParticles[i];
      p.y += p.vy * dt;
      p.x += p.vx * dt;
      if (p.y > LOG_H + 15) heartRainParticles.splice(i, 1);
    }
    if (passedCount === 0 && heartRainParticles.length > maxParticles) {
      heartRainParticles.splice(maxParticles);
    }
  }
  function drawHeartRain() {
    const totalCheckpoints = checkpoints.length;
    const passedCount = passedCheckpointIds.size;
    const rainIntensity = totalCheckpoints === 0 ? 0 : passedCount / totalCheckpoints;
    const intensityBoost = 0.5 + rainIntensity;
    const t = frameNow * 0.003;

    for (let i = 0; i < heartRainParticles.length; i++) {
      const p = heartRainParticles[i];
      const s = p.size | 0;
      const x0 = Math.round(p.x);
      const y0 = Math.round(p.y);
      const alpha = Math.min(1, p.alpha * intensityBoost * (0.92 + 0.08 * Math.sin(t + (p.phase || 0))));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.hue;
      for (let k = 0; k < smallHeartPixels.length; k++) {
        const dx = smallHeartPixels[k][0];
        const dy = smallHeartPixels[k][1];
        ctx.fillRect(x0 + dx * s, y0 + dy * s, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ----- Game loop -----
  let last = performance.now();
  let frameNow = last;

  function update(dt) {
    // Up / W = forward along path, Down / S = backward. Path turns under you.
    let move = 0;
    if (controls.up) move = 1;
    if (controls.down) move = -1;
    if (controls.up && controls.down) move = 0;

    const tan = tangentAtS(player.s);

    if (move !== 0) {
      player.s = clamp(player.s + move * player.speed * dt, 0, totalLen);
      player.walkT += dt * 6;
      player.bob += dt * 10;
      player.facing = { x: tan.x * move, y: tan.y * move };
    }

    // Find nearest checkpoint for prompt
    // For the very start of the journey, have them walk in from the top of the map
    // toward Trees Café, then continue along the path.
    const meetS = totalLen * 0.04;
    let p;
    if (player.s <= meetS) {
      const treesPos = posAtS(meetS);
      const spawnPos = { x: treesPos.x, y: 30 }; // high near the top of the map
      const tMeet = clamp(player.s / meetS, 0, 1);
      p = {
        x: lerp(spawnPos.x, treesPos.x, tMeet),
        y: lerp(spawnPos.y, treesPos.y, tMeet),
      };
    } else {
      p = posAtS(player.s);
    }
    let best = null;
    let bestD = Infinity;
    for (const cp of checkpoints) {
      const d = dist(p, cp.pos);
      if (d < bestD) {
        bestD = d;
        best = cp;
      }
    }
    const near = best && bestD < 18;
    nearestCheckpoint = near ? best : null;

    for (const cp of checkpoints) {
      if (player.s >= cp.s) passedCheckpointIds.add(cp.id);
      else passedCheckpointIds.delete(cp.id);
    }

    if (controls.interact && nearestCheckpoint && !overlayOpen) {
      // prevent repeated opens while key held
      controls.interact = false;
      openCheckpoint(nearestCheckpoint);
    }

    const atEnd = player.s >= totalLen - 3;
    if (atEnd && !wasAtEndLastFrame && !valentineOverlayOpen) openValentinePopup();
    wasAtEndLastFrame = atEnd;
  }

  function render() {
    const cw = canvas.width;
    const ch = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.scale(cw / LOG_W, ch / LOG_H);

    ctx.fillStyle = COLORS.sky;
    ctx.fillRect(0, 0, LOG_W, LOG_H);

    seed = 1337;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        drawTile(x, y, tileMap[y][x]);
      }
    }

    drawPath();
    for (let i = 0; i < 8; i++) {
      const t = 0.08 + (i / 8) * 0.82;
      const s = totalLen * t;
      const pos = posAtS(s);
      const tan = tangentAtS(s);
      const nx = -tan.y;
      const ny = tan.x;
      const off = 14;
      drawPathFlower(pos.x + nx * off, pos.y + ny * off, i % 2);
      drawPathFlower(pos.x - nx * (off + 6), pos.y - ny * (off + 6), (i + 1) % 2);
    }
    // Draw the Trees Cafe photo + Oct 2025 banner at the very start of the path
    drawTreesCafeMarker();
    drawTentMarker();
    drawPlaneMarker();
    drawSign(pathPts[pathPts.length - 1].x + 8, pathPts[pathPts.length - 1].y - 14, "Feb 2026");

    const p = posAtS(player.s);
    for (const cp of checkpoints) {
      const near = nearestCheckpoint && nearestCheckpoint.id === cp.id;
      drawCheckpoint(cp, near);
    }

    const tan = tangentAtS(player.s);
    const nx = -tan.y;
    const ny = tan.x;
    // Start far apart, come closer as you move toward the early part of the path
    const farSep = 22;
    const closeSep = 7;
    const approachEnd = totalLen * 0.12; // roughly around the first checkpoint / Oct 2025 area
    const approachT = clamp(player.s / approachEnd, 0, 1);
    const sep = farSep + (closeSep - farSep) * approachT;

    const phase = player.walkT % 1;
    const bob = 1.5 * Math.sin(player.bob);

    const zeechoPos = { x: p.x + nx * sep, y: p.y + ny * sep };
    const nafeesaPos = { x: p.x - nx * sep, y: p.y - ny * sep };
    const first = zeechoPos.y < nafeesaPos.y ? { pos: zeechoPos, who: "zeecho" } : { pos: nafeesaPos, who: "nafeesa" };
    const second = zeechoPos.y < nafeesaPos.y ? { pos: nafeesaPos, who: "nafeesa" } : { pos: zeechoPos, who: "zeecho" };

    const useSprites = spriteZeecho.complete && spriteNafeesa.complete && spriteZeecho.naturalWidth > 0 && spriteNafeesa.naturalWidth > 0;
    const nafeesaGroundOffset = 6;
    const nafeesaHeightMult = 1.07;
    if (useSprites) {
      drawCharacterSprite(
        first.who === "zeecho" ? spriteZeecho : spriteNafeesa,
        first.pos.x, first.pos.y, player.facing, bob,
        first.who === "nafeesa" ? nafeesaGroundOffset : 0,
        first.who === "nafeesa" ? nafeesaHeightMult : 1
      );
      drawCharacterSprite(
        second.who === "zeecho" ? spriteZeecho : spriteNafeesa,
        second.pos.x, second.pos.y, player.facing, bob,
        second.who === "nafeesa" ? nafeesaGroundOffset : 0,
        second.who === "nafeesa" ? nafeesaHeightMult : 1
      );
    } else {
      const firstPal = first.who === "zeecho" ? palettes.a : palettes.b;
      const secondPal = second.who === "zeecho" ? palettes.a : palettes.b;
      drawPerson(first.pos.x, first.pos.y, firstPal, phase, player.facing);
      drawPerson(second.pos.x, second.pos.y, secondPal, phase, player.facing);
    }

    if (nearestCheckpoint && !overlayOpen) {
      drawSpeechBubble(p.x, p.y - 44, "Press E");
    }

    drawHeartRain();

    const vig = ctx.createRadialGradient(
      LOG_W / 2, LOG_H / 2, 40,
      LOG_W / 2, LOG_H / 2, Math.max(LOG_W, LOG_H) * 0.6
    );
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.2)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, LOG_W, LOG_H);

    ctx.restore();
  }

  function frame(now) {
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    frameNow = now;
    updateHeartRain(dt);
    if (!overlayOpen && !valentineOverlayOpen) update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // Start
  requestAnimationFrame(frame);

  // Accessibility: allow Esc to close overlay even if focus is inside
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && (overlayOpen || valentineOverlayOpen)) (valentineOverlayOpen ? closeValentinePopup : closeOverlay)();
  });
})();

