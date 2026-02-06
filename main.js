/* eslint-disable no-unused-vars */
// Journey viewer: full-window, modern pixel art (Gather Town style)
// Arrow keys: walk along path. E: reveal checkpoint.

(() => {
  // Bump this when you replace photos so browsers load the new image (e.g. after updating skating.jpeg)
  const IMAGE_CACHE_BUST = "?v=2";

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
  const valentineAskModal = document.getElementById("valentineAskModal");
  const valentineYesBtn = document.getElementById("valentineYesBtn");
  const valentineCloseBtn = document.getElementById("valentineCloseBtn");
  const valentinePlayArea = document.getElementById("valentinePlayArea");
  const valentineRightModal = document.getElementById("valentineRightModal");
  const valentineRightOkBtn = document.getElementById("valentineRightOkBtn");
  const journeyBanner = document.getElementById("journeyBanner");
  const journeyBannerTitle = document.getElementById("journeyBannerTitle");
  const islandEndOverlay = document.getElementById("islandEndOverlay");
  const islandEndOkBtn = document.getElementById("islandEndOkBtn");
  const gateOverlay = document.getElementById("gateOverlay");
  const gateScreen = document.getElementById("gateScreen");
  const gateGoAway = document.getElementById("gateGoAway");
  const gateYesBtn = document.getElementById("gateYesBtn");
  const gateNoBtn = document.getElementById("gateNoBtn");

  // Pixel-art resolution (scaled to fill window; crisp pixels)
  const LOG_W = 480;
  const LOG_H = 270;
  const TILE = 8;
  const COLS = Math.floor(LOG_W / TILE);
  const ROWS = Math.floor(LOG_H / TILE);
  // Second-map island layout (ellipse)
  const ISLAND_CENTER_X = LOG_W / 2;
  const ISLAND_CENTER_Y = LOG_H * 0.62;
  const ISLAND_HALF_W = LOG_W * 0.33; // wider island
  const ISLAND_HALF_H = LOG_H * 0.24; // taller island
  // Simple path across the island from the left edge to the resort on the right
  const ISLAND_PATH_START_X = ISLAND_CENTER_X - ISLAND_HALF_W * 0.98;
  const ISLAND_PATH_START_Y = ISLAND_CENTER_Y + ISLAND_HALF_H * 0.02;
  const ISLAND_RESORT_X = ISLAND_CENTER_X + ISLAND_HALF_W * 0.58;
  const ISLAND_RESORT_Y = ISLAND_CENTER_Y - ISLAND_HALF_H * 0.2;
  const ISLAND_PATH_DOOR_OFFSET = 24;

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

  function isOnIsland(x, y) {
    const dx = (x - ISLAND_CENTER_X) / ISLAND_HALF_W;
    const dy = (y - ISLAND_CENTER_Y) / ISLAND_HALF_H;
    const r2 = dx * dx + dy * dy;
    // Matches the edge where tiles switch to water in the second map
    return r2 <= 1.15;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpPt(a, b, t) {
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  }

  /** Build cumulative lengths for the main map polyline */
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

  // ----- Island path (1D path on second map) -----
  const ISLAND_PATH_SAMPLES = 70;
  const islandPathPts = [];
  let islandTotalLen = 0;
  const islandSegLens = [];
  const islandCum = [0];

  // Path starts at the right edge of the ferry (ferry center: -25, -25 from path start; ferry width 100)
  const islandStart = {
    x: ISLAND_PATH_START_X - 25 + 50,
    y: ISLAND_PATH_START_Y - 25,
  };
  const islandEnd = { x: ISLAND_RESORT_X - ISLAND_PATH_DOOR_OFFSET, y: ISLAND_RESORT_Y };
  const dipY = Math.max(islandStart.y, islandEnd.y) + ISLAND_HALF_H * 1.15;
  const islandControl = {
    x: islandStart.x + (islandEnd.x - islandStart.x) * 0.5,
    y: dipY,
  };
  const ISLAND_PATH_T_MAX = 0.9;
  for (let i = 0; i <= ISLAND_PATH_SAMPLES; i++) {
    const tNorm = i / ISLAND_PATH_SAMPLES;
    const t = tNorm * ISLAND_PATH_T_MAX;
    const oneMinusT = 1 - t;
    const b = oneMinusT * oneMinusT;
    const c = 2 * oneMinusT * t;
    const d = t * t;
    const base = {
      x: b * islandStart.x + c * islandControl.x + d * islandEnd.x,
      y: b * islandStart.y + c * islandControl.y + d * islandEnd.y,
    };
    const T = tNorm * TWO_PI;
    const wobbleX = 10 * Math.sin(T * 1.2) + 5 * Math.sin(T * 2.1 + 0.8);
    const wobbleY = 4 * Math.sin(T * 0.9 + 0.5);
    const pt = {
      x: base.x + wobbleX,
      y: base.y + wobbleY,
    };
    islandPathPts.push(pt);
  }
  // End path with a horizontal segment so it doesn't tilt awkwardly
  const lastSample = islandPathPts[islandPathPts.length - 1];
  islandPathPts[islandPathPts.length - 1] = { x: islandEnd.x, y: lastSample.y };

  for (let i = 0; i < islandPathPts.length - 1; i++) {
    const L = dist(islandPathPts[i], islandPathPts[i + 1]);
    islandSegLens.push(L);
    islandTotalLen += L;
    islandCum.push(islandTotalLen);
  }

  function islandPosAtS(s) {
    const ss = clamp(s, 0, islandTotalLen);
    let i = 0;
    while (i < islandSegLens.length && islandCum[i + 1] < ss) i++;
    const segStart = islandPathPts[i];
    const segEnd = islandPathPts[i + 1];
    const segS = ss - islandCum[i];
    const t = islandSegLens[i] === 0 ? 0 : segS / islandSegLens[i];
    return lerpPt(segStart, segEnd, t);
  }

  function islandTangentAtS(s) {
    const ss = clamp(s, 0, islandTotalLen);
    let i = 0;
    while (i < islandSegLens.length && islandCum[i + 1] < ss) i++;
    const a = islandPathPts[i];
    const b = islandPathPts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  // ----- Checkpoints -----
  // Put placeholders now; you can add as many as you want later.
  // Each checkpoint uses "s" (distance along path).
  const loremIpsum = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";
  const cp1Text = "I fell in love the first time I saw you at Trees, but our walk on Sunset Beach is when it really hit me. I felt so connected to you, and I knew you were everything I'd ever been looking for...";
  const cp2Text = "This is the day we chose each other. The whole day felt like a dream, the kind you don’t want to wake up from. The weather was perfect, the views were unreal… but somehow none of it compared to you. I kept catching myself staring, not even on purpose, just because I couldn’t believe I was really there with you. That’s the day our journey actually began, and I still don’t know how anything is supposed to top how perfect it felt.";
  const cp3Text = "This is the first time you came over to \"our\" home, and the first time we cooked something together. I don't usually enjoy cooking, but with you even that felt exciting. It made me realize how much I love spending time with you. We could be doing absolutely nothing and I'd still love every minute of it.";
  const cp4Text = "This was the first time in my life I was sad about going on a vacation. You had work the next day but you still came at 6am to drop me at the airport, and that meant so much to me. I'll never forget that. When we got to the airport and I realized I could miss my flight, surprisingly I was almost glad. I wouldn't have to spend a week away from you. The old me would never have imagined being capable of feeling that way about someone. But there I was, feeling it for you.";
  const cp5Text = "I don't think words can do justice to how I felt during this trip, but let me try. IT WAS MAGICAL!!! I literally felt like I was living in a movie with the co-star from my fantasies. I've never been on a trip I enjoyed more than this one. Waking up with you there, exploring together, just being with you in a new place… it felt like something I'd only ever dreamed about, and suddenly it was real. I didn't want it to end.";
  const cp6Text = "Best holiday season ever! We did so many things it was insane! Wouldn't change a thing, maybe besides that pizza 😂";
  const cp7Text = "This was probably the first New Year where I didn't really see the fireworks, but I was more mesmerized than ever. I mean, can't blame me, look at that face 😳 I'm sure 2026 is gonna be the luckiest year of my life so far, given I got to start it with you. First of many New Years, inshallah.";
  const cp8Text = "It's not like you hadn't already checked all my boxes, and on top of that you love trying out adventurous things too!! Come on Nafeesa, I only have one heart, how many times are you gonna steal it?! It honestly feels like Allah handcrafted you just for me, and I'm so, so glad to have you in my life ❤️";
  const checkpoints = [
    { id: "cp-1", title: "The Day I Fell in Love", date: "Oct 29 2025", tag: "Sunset Beach", text: cp1Text, images: ["./photos/beach.jpeg"], s: totalLen * 0.10 },
    { id: "cp-2", title: "The Most Memorable Day of My Life (So Far)", date: "Nov 2 2025", tag: "Bowen Island", text: cp2Text, images: ["./photos/bowen.jpeg"], s: totalLen * 0.22 },
    { id: "cp-3", title: "👩‍🍳Our First Cooking Sesh👨‍🍳", date: "Nov 8 2025", tag: "Home", text: cp3Text, images: ["./photos/cook.jpeg"], s: totalLen * 0.34 },
    { id: "cp-4", title: "The First Time We Had to Say Goodbye 😢", date: "Dec 11 2025", tag: "YVR Airport", text: cp4Text, images: ["./photos/airport.jpeg"], s: totalLen * 0.46 },
    { id: "cp-5", title: "Our First Getaway", date: "Dec 25 2025", tag: "Sunshine Coast", text: cp5Text, images: ["./photos/getaway2.jpeg", "./photos/getaway.jpeg"], s: totalLen * 0.58 },
    { id: "cp-6", title: "Our First Christmas Together", date: "Dec 26 2025", tag: "Capilano", text: cp6Text, images: ["./photos/christmas0.jpeg", "./photos/christmas.jpeg"], s: totalLen * 0.70 },
    { id: "cp-7", title: "Our First New Year Together", date: "Dec 31 2025", tag: "Porteau Cove", text: cp7Text, images: ["./photos/newyear.jpeg", "./photos/newyear2.jpeg"], s: totalLen * 0.82 },
    {
      id: "cp-8",
      title: "Our Adventures",
      date: "Jan 2026",
      tag: "Whistler",
      imageTags: ["Whistler", "Cypress Mt", "Seymour Mt", "Robson", "Hive"],
      text: cp8Text,
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

  musicBtn.addEventListener("click", () => {
    const gateDismissed = gateOverlay && gateOverlay.classList.contains("is-dismissed");
    if (gateDismissed) tryStartMusic();
    setMusic(!audio.on);
  });
  setMusic(true);

  let musicStartedByMovement = false;
  function tryStartMusic() {
    if (!audio.on || musicStartedByMovement) return;
    musicStartedByMovement = true;
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

  // ----- Overlay -----
  let overlayOpen = false;
  let valentineOverlayOpen = false;
  let islandEndPopupOpen = false;
  let islandEndPopupShown = false;
  let wasAtEndLastFrame = false;
  let secondMapUnlocked = false;
  let inSecondMap = false;
  const secondMapPos = { x: LOG_W / 2, y: LOG_H / 2 + 10 };
  let islandS = 0;
  let currentIslandTangent = { x: 1, y: 0 };
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

    // Cp1: slightly wider text with small gap; cp2: full wide text
    if (cpCard) {
      cpCard.classList.toggle("checkpointCard--wideTextCp1", cp.id === "cp-1");
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
      cpImg.src = images[carouselIndex] + IMAGE_CACHE_BUST;
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
      cpImg.src = images[0] + IMAGE_CACHE_BUST;
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
    document.body.style.overflow = (valentineOverlayOpen || islandEndPopupOpen) ? "hidden" : "";
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
    // reset which valentine modal is visible inside the overlay
    if (valentineAskModal) {
      valentineAskModal.hidden = false;
      valentineAskModal.style.display = "flex";
    }
    if (valentineRightModal) {
      valentineRightModal.hidden = true;
      valentineRightModal.style.display = "none";
    }
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
    document.body.style.overflow = (overlayOpen || islandEndPopupOpen) ? "hidden" : "";
    try { canvas.focus(); } catch (_) {}
  }

  function openIslandEndPopup() {
    islandEndPopupOpen = true;
    if (islandEndOverlay) {
      islandEndOverlay.classList.add("is-open");
      islandEndOverlay.hidden = false;
    }
    document.body.style.overflow = "hidden";
    if (islandEndOkBtn) islandEndOkBtn.focus();
  }

  function closeIslandEndPopup() {
    islandEndPopupOpen = false;
    if (islandEndOverlay) {
      islandEndOverlay.classList.remove("is-open");
      islandEndOverlay.hidden = true;
    }
    document.body.style.overflow = (overlayOpen || valentineOverlayOpen) ? "hidden" : "";
    try { canvas.focus(); } catch (_) {}
  }

  if (gateYesBtn) {
    gateYesBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (gateOverlay) gateOverlay.classList.add("is-dismissed");
    });
  }
  if (gateNoBtn) {
    gateNoBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (gateScreen) gateScreen.hidden = true;
      if (gateGoAway) gateGoAway.hidden = false;
    });
  }

  okBtn.addEventListener("click", (e) => { e.preventDefault(); closeOverlay(); });
  closeOverlayBtn.addEventListener("click", (e) => { e.preventDefault(); closeOverlay(); });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay();
  });
  if (valentineYesBtn) {
    valentineYesBtn.addEventListener("click", (e) => {
      e.preventDefault();
      // swap from the ask modal to the "right choice" panel
      if (valentineAskModal) {
        valentineAskModal.hidden = true;
        valentineAskModal.style.display = "none";
      }
      if (valentineRightModal) {
        valentineRightModal.hidden = false;
        valentineRightModal.style.display = "flex";
        if (valentineRightOkBtn) valentineRightOkBtn.focus();
      } else {
        closeValentinePopup();
      }
    });
  }
  if (valentineRightOkBtn) {
    valentineRightOkBtn.addEventListener("click", (e) => {
      e.preventDefault();
      closeValentinePopup();
      // Unlock and move into the second (island) map
      secondMapUnlocked = true;
      inSecondMap = true;
      islandS = 0;
      const p = islandPosAtS(islandS);
      secondMapPos.x = p.x;
      secondMapPos.y = p.y;
    });
  }
  if (valentineCloseBtn) {
    valentineCloseBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); moveValentineNotYetButton(); });
    valentineCloseBtn.addEventListener("mouseenter", () => moveValentineNotYetButton());
  }
  valentineOverlay.addEventListener("click", (e) => {
    if (e.target === valentineOverlay) closeValentinePopup();
  });
  if (islandEndOkBtn) {
    islandEndOkBtn.addEventListener("click", (e) => { e.preventDefault(); closeIslandEndPopup(); });
  }
  if (islandEndOverlay) {
    islandEndOverlay.addEventListener("click", (e) => {
      if (e.target === islandEndOverlay) closeIslandEndPopup();
    });
  }
  // Esc always closes (capture so it runs before anything else)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && (overlayOpen || valentineOverlayOpen || islandEndPopupOpen)) {
      e.preventDefault();
      e.stopPropagation();
      if (islandEndPopupOpen) closeIslandEndPopup();
      else if (valentineOverlayOpen) closeValentinePopup();
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
    if (overlayOpen || valentineOverlayOpen || islandEndPopupOpen) {
      if (e.key === "Escape") {
        if (islandEndPopupOpen) closeIslandEndPopup();
        else if (valentineOverlayOpen) closeValentinePopup();
        else closeOverlay();
      }
      return;
    }

    if (e.key in KEYMAP) {
      const gateDismissed = gateOverlay && gateOverlay.classList.contains("is-dismissed");
      if (gateDismissed) tryStartMusic();
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

  function drawBridgeMarker() {
    if (!bridgeImg.complete || !bridgeImg.naturalWidth) return;
    const cp6 = checkpoints.find((c) => c.id === "cp-6");
    if (!cp6 || !cp6.pos) return;
    const base = cp6.pos;
    const baseW = 72;
    const scale = baseW / bridgeImg.naturalWidth;
    const w = baseW;
    const h = bridgeImg.naturalHeight * scale;
    const offsetX = -52; // to the left of cp6
    const offsetY = 40;
    const cx = base.x + offsetX;
    const cy = base.y + offsetY;
    ctx.drawImage(bridgeImg, cx - w / 2, cy - h, w, h);
  }

  function drawCoveMarker() {
    if (!coveImg.complete || !coveImg.naturalWidth) return;
    const cp7 = checkpoints.find((c) => c.id === "cp-7");
    if (!cp7 || !cp7.pos) return;
    const base = cp7.pos;
    const baseW = 72;
    const scale = baseW / coveImg.naturalWidth;
    const w = baseW;
    const h = coveImg.naturalHeight * scale;
    const offsetX = 50; // to the right of cp7
    const offsetY = 50;
    const cx = base.x + offsetX;
    const cy = base.y + offsetY;
    ctx.drawImage(coveImg, cx - w / 2, cy - h, w, h);
  }

  function drawBuildingMarker() {
    if (!buildingImg.complete || !buildingImg.naturalWidth) return;
    const cp3 = checkpoints.find((c) => c.id === "cp-3");
    if (!cp3 || !cp3.pos) return;
    const base = cp3.pos;
    const baseW = 52;
    const scale = baseW / buildingImg.naturalWidth;
    const w = baseW;
    const h = buildingImg.naturalHeight * scale;
    const offsetY = 10; // just above cp3
    const cx = base.x;
    const cy = base.y - offsetY;
    ctx.drawImage(buildingImg, cx - w / 2, cy - h, w, h);
  }

  const ISLAND_ROAD = {
    edge: "#3d4a3d",
    surface: "#5a6258",
    surfaceLight: "#6d766a",
    centerLine: "#8a8f7a",
  };

  function drawIslandPath() {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const path = new Path2D();
    path.moveTo(islandPathPts[0].x, islandPathPts[0].y);
    for (let i = 1; i < islandPathPts.length; i++) {
      path.lineTo(islandPathPts[i].x, islandPathPts[i].y);
    }

    // Road edge (dark border)
    ctx.strokeStyle = ISLAND_ROAD.edge;
    ctx.lineWidth = 22;
    ctx.stroke(path);

    // Road surface
    ctx.strokeStyle = ISLAND_ROAD.surface;
    ctx.lineWidth = 16;
    ctx.stroke(path);

    // Center line (dashed)
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = ISLAND_ROAD.centerLine;
    ctx.lineWidth = 2;
    ctx.stroke(path);
    ctx.setLineDash([]);

    ctx.restore();
  }

  function drawFerryOnIsland() {
    if (!ferryImg.complete || !ferryImg.naturalWidth) return;
    const baseW = 100;
    const scale = baseW / ferryImg.naturalWidth;
    const w = baseW;
    const h = ferryImg.naturalHeight * scale;
    const cx = ISLAND_PATH_START_X - 25;
    const cy = ISLAND_PATH_START_Y - 25;
    const tiltRad = 0; // slight counter-clockwise tilt
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tiltRad);
    ctx.drawImage(ferryImg, -w / 2, -h, w, h);
    ctx.restore();
  }

  function drawCarOnIsland() {
    if (!carImg.complete || !carImg.naturalWidth) return;
    const baseW = 42;
    const scale = baseW / carImg.naturalWidth;
    const w = baseW;
    const h = carImg.naturalHeight * scale;
    const cx = secondMapPos.x;
    const cy = secondMapPos.y;
    const bob2 = 1.5 * Math.sin(player.bob);
    const tan2 = currentIslandTangent;
    // Tilt upward slightly when path is going up (U shape)
    const fullAngle = Math.atan2(tan2.y, tan2.x);
    const angle = tan2.y < 0 ? clamp(fullAngle, -0.4, 0) : 0;
    ctx.save();
    ctx.translate(cx, cy + bob2);
    ctx.rotate(angle);
    ctx.drawImage(carImg, -w / 2, -h, w, h);
    ctx.restore();
  }

  function drawResortOnIsland() {
    if (!resortImg.complete || !resortImg.naturalWidth) return;
    const baseW = 160;
    const scale = baseW / resortImg.naturalWidth;
    const w = baseW;
    const h = resortImg.naturalHeight * scale;
    const cx = ISLAND_RESORT_X - 20;
    const cy = ISLAND_RESORT_Y + 50;
    ctx.drawImage(resortImg, cx - w / 2, cy - h, w, h);
  }

  function drawCheckpoint(cp, isNear, number) {
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

    const isGolden = cp.id === "cp-2";
    const pulseGlow = isGolden ? "#d4a84b" : "#e87898";
    const pulse = isGolden
      ? 0.22 + 0.2 * Math.sin(Date.now() * 0.0028)
      : 0.15 + 0.12 * Math.sin(Date.now() * 0.002);
    const glowSpread = isGolden ? 1.42 : 1.35;
    ctx.save();
    ctx.globalAlpha = pulse;
    heartPixels.forEach(([dx, dy]) => {
      const gx = x + Math.round(dx * base * glowSpread);
      const gy = y + Math.round(dy * base * glowSpread);
      const gs = 4;
      pxRect(gx - 1, gy - 1, gs, gs, pulseGlow);
    });
    ctx.restore();

    const heartColor = isGolden
      ? (isNear ? COLORS.checkpointLight : COLORS.checkpoint)
      : (isNear ? "#f06070" : "#c83048");
    const size = base;
    heartPixels.forEach(([dx, dy]) => {
      const sx = x + Math.round(dx * base * scale);
      const sy = y + Math.round(dy * base * scale);
      pxRect(sx, sy, size, size, heartColor);
    });
    if (number != null) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(number), x, y);
    }
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
  const spriteZeechoSuit = new Image();
  const spriteNafeesaDress = new Image();
  const treesCafeImg = new Image();
  const tentImg = new Image();
  const planeImg = new Image();
  const bridgeImg = new Image();
  const ferryImg = new Image();
  const coveImg = new Image();
  const buildingImg = new Image();
  const resortImg = new Image();
  const imgVersion = "?v=" + Date.now();
  spriteZeecho.src = "zeecho-pixel.png" + imgVersion;
  spriteNafeesa.src = "nafeesa-pixel.png" + imgVersion;
  spriteZeechoSuit.src = "zeeco-suit.png" + imgVersion;
  spriteNafeesaDress.src = "nafeesa-dress.png" + imgVersion;
  treesCafeImg.src = "trees-cafe.png" + imgVersion;
  tentImg.src = "photos/tent.png" + imgVersion;
  planeImg.src = "plane.png" + imgVersion;
  bridgeImg.src = "bridge.png" + imgVersion;
  ferryImg.src = "photos/ferry.png" + imgVersion;
  coveImg.src = "cove.png" + imgVersion;
  buildingImg.src = "building.png" + imgVersion;
  resortImg.src = "resort.png" + imgVersion;
  const carImg = new Image();
  carImg.src = "photos/car.png" + imgVersion;

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
  const HEART_RAIN_ISLAND_MAX = 95;
  const HEART_RAIN_ISLAND_SPAWN_INTERVAL = 0.055;
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
    let maxParticles, spawnInterval;
    if (inSecondMap) {
      maxParticles = HEART_RAIN_ISLAND_MAX;
      spawnInterval = HEART_RAIN_ISLAND_SPAWN_INTERVAL;
    } else {
      const rainIntensity = totalCheckpoints === 0 ? 0 : passedCount / totalCheckpoints;
      maxParticles = Math.round(HEART_RAIN_MAX * rainIntensity);
      spawnInterval = passedCount > 0
        ? HEART_RAIN_SPAWN_INTERVAL * (totalCheckpoints / passedCount)
        : 999;
    }

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
    if (!inSecondMap && heartRainParticles.length > maxParticles) {
      heartRainParticles.splice(maxParticles);
    }
  }
  function drawHeartRain() {
    const totalCheckpoints = checkpoints.length;
    const passedCount = passedCheckpointIds.size;
    const rainIntensity = totalCheckpoints === 0 ? 0 : passedCount / totalCheckpoints;
    const intensityBoost = inSecondMap ? 1.1 : (0.5 + rainIntensity);
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
  function drawHeartPixel(cx, cy, color) {
    // simple 6x5 pixel heart
    const x = Math.round(cx);
    const y = Math.round(cy);
    ctx.fillStyle = color;
    pxRect(x - 1, y - 3, 2, 2, color);
    pxRect(x + 1, y - 3, 2, 2, color);
    pxRect(x - 2, y - 2, 4, 3, color);
    pxRect(x + 0, y - 2, 4, 3, color);
    pxRect(x - 1, y + 1, 4, 1, color);
    pxRect(x, y + 2, 2, 1, color);
  }

  // ----- Island extras: fish + clouds -----
  const ISLAND_FISH_COUNT = 7;
  const ISLAND_CLOUD_COUNT = 7;

  function drawPixelFish(cx, cy, dir) {
    // tiny 5x3-ish fish, dir = 1 (right) or -1 (left)
    const x = Math.round(cx);
    const y = Math.round(cy);
    const body = "#f0e4b8";
    const fin = "#e0b868";
    const eye = "#2a2838";
    const s = dir >= 0 ? 1 : -1;

    // body
    pxRect(x - 2 * s, y - 1, 4, 2, body);
    // tail
    pxRect(x + 2 * s, y - 1, 1 * s, 1, fin);
    pxRect(x + 2 * s, y, 1 * s, 1, fin);
    // eye
    pxRect(x - 1 * s, y, 1, 1, eye);
  }

  function drawPixelCloud(cx, cy, scale) {
    const x = Math.round(cx);
    const y = Math.round(cy);
    const c = "#f5f0ff";
    const r = Math.max(5, Math.round(8 * scale)); // bigger, softer cloud
    // middle puff
    pxRect(x - r, y - r, r * 2, r, c);
    // top-left puff
    pxRect(x - r - 4, y - r - 2, r, r, c);
    // top-right puff
    pxRect(x + 2, y - r - 3, r, r + 1, c);
    // bottom puff
    pxRect(x - r - 2, y - 1, r * 2 + 4, r, c);
  }

  function drawIslandFish() {
    const t = frameNow / 900;
    for (let i = 0; i < ISLAND_FISH_COUNT; i++) {
      const phase = i / ISLAND_FISH_COUNT;
      const ang = phase * Math.PI * 2 + t * 0.9;
      const radius = Math.max(ISLAND_HALF_W, ISLAND_HALF_H) * 1.05;
      const baseX = ISLAND_CENTER_X + Math.cos(ang) * radius;
      const baseY = ISLAND_CENTER_Y + Math.sin(ang) * radius * 0.55;
      // vertical hop
      const jump = Math.sin(t * 3 + i * 1.7);
      const y = baseY - Math.max(0, jump) * 10;
      const dir = Math.cos(ang) >= 0 ? 1 : -1;
      // only draw when "above" the water a bit so it feels like a jump
      if (jump > 0.15) {
        drawPixelFish(baseX, y, dir);
      }
    }
  }

  function drawIslandClouds() {
    const t = frameNow / 40000;
    for (let i = 0; i < ISLAND_CLOUD_COUNT; i++) {
      // two staggered rows of large clouds sliding gently across the sky
      const row = i % 2;
      const baseX = 40 + (i * (LOG_W - 80)) / (ISLAND_CLOUD_COUNT - 1);
      const drift = (t * LOG_W * 0.4 + i * 30) % (LOG_W + 120) - 60;
      const x = (baseX + drift + LOG_W + 120) % (LOG_W + 120) - 20;
      const y = row === 0 ? 34 + (i % 3) * 4 : 58 + (i % 3) * 3;
      const scale = 1.1 + 0.18 * Math.sin(frameNow / 2200 + i * 0.7);
      drawPixelCloud(x, y, scale);
    }
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

    if (inSecondMap) {
      // Same 1D path-style movement as map 1, but along the island path
      if (move !== 0) {
        islandS = clamp(islandS + move * player.speed * dt, 0, islandTotalLen);
        player.walkT += dt * 6;
        player.bob += dt * 10;
        const tan2 = islandTangentAtS(islandS);
        player.facing = { x: tan2.x * move, y: tan2.y * move };
      }
      const islandPos = islandPosAtS(islandS);
      secondMapPos.x = islandPos.x;
      secondMapPos.y = islandPos.y;
      currentIslandTangent = islandTangentAtS(islandS);

      if (islandS >= islandTotalLen - 8 && !islandEndPopupShown && !islandEndPopupOpen) {
        islandEndPopupShown = true;
        openIslandEndPopup();
      }
      if (islandS < islandTotalLen - 60) {
        islandEndPopupShown = false;
      }

      // Only return to main map when they deliberately walk back to the start (pressing down at the beginning)
      if (islandS <= 4 && move < 0) {
        inSecondMap = false;
        islandEndPopupShown = false;
        player.s = totalLen - 10;
      }
    } else {
      const tan = tangentAtS(player.s);

      if (move !== 0) {
        player.s = clamp(player.s + move * player.speed * dt, 0, totalLen);
        player.walkT += dt * 6;
        player.bob += dt * 10;
        player.facing = { x: tan.x * move, y: tan.y * move };
      }
    }

    // Find nearest checkpoint for prompt
    // For the very start of the journey, have them walk in from the top of the map
    // toward Trees Café, then continue along the path.
    const meetS = totalLen * 0.04;
    let p;
    if (!inSecondMap) {
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
    } else {
      p = { x: secondMapPos.x, y: secondMapPos.y };
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
    if (atEnd && !wasAtEndLastFrame && !valentineOverlayOpen) {
      if (!secondMapUnlocked) {
        // First time reaching the end: show valentine ask popup
        openValentinePopup();
      } else {
        // After unlock, walking to the end jumps you back into the second map
        inSecondMap = true;
        islandS = 0;
        const p2 = islandPosAtS(islandS);
        secondMapPos.x = p2.x;
        secondMapPos.y = p2.y;
      }
    }
    wasAtEndLastFrame = atEnd;
  }

  function render() {
    if (journeyBanner && journeyBannerTitle) {
      if (inSecondMap) {
        journeyBanner.classList.remove("hud__banner--bottom");
        journeyBanner.classList.add("hud__banner--center-top");
        journeyBannerTitle.textContent = "Valentines Day";
      } else {
        journeyBanner.classList.remove("hud__banner--center-top");
        journeyBanner.classList.add("hud__banner--bottom");
        journeyBannerTitle.textContent = "Our Journey So Far";
      }
    }

    const cw = canvas.width;
    const ch = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.scale(cw / LOG_W, ch / LOG_H);

    ctx.fillStyle = COLORS.sky;
    ctx.fillRect(0, 0, LOG_W, LOG_H);

    if (inSecondMap) {
      // Future map: full-screen tile stage with a small island (more water, same pixel style)
      seed = 20260205;
      for (let ty = 0; ty < ROWS; ty++) {
        for (let tx = 0; tx < COLS; tx++) {
          const cx = (tx + 0.5) * TILE;
          const cy = (ty + 0.5) * TILE;
          const dx = (cx - ISLAND_CENTER_X) / ISLAND_HALF_W;
          const dy = (cy - ISLAND_CENTER_Y) / ISLAND_HALF_H;
          const r2 = dx * dx + dy * dy;
          let tileType;
          if (r2 > 1.15) {
            // open water
            tileType = 1;
          } else {
            // island (grass + occasional flowers)
            const noise = (tx * 37 + ty * 11) % 5;
            if (r2 > 1) {
              // thin "shore" band, still grass but a bit sparser
              tileType = 0;
            } else if (noise === 0) {
              tileType = 2;
            } else if (noise === 1) {
              tileType = 3;
            } else if (noise === 2) {
              tileType = 4;
            } else {
              tileType = 0;
            }
          }
          drawTile(tx, ty, tileType);
        }
      }

      // Small pixel clouds in the sky above the island
      drawIslandClouds();

      // Island path + ferry on the left, resort on the right
      drawIslandPath();
      drawFerryOnIsland();
      drawResortOnIsland();

      drawHeartRain();

      // Draw car on island (replaces Zeeshan & Nafeesa sprites)
      drawCarOnIsland();

      ctx.restore();
      return;
    }

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
    drawBridgeMarker();
    drawCoveMarker();
    drawBuildingMarker();
    drawSign(pathPts[pathPts.length - 1].x + 8, pathPts[pathPts.length - 1].y - 14, "Feb 2026");

    const p = posAtS(player.s);
    checkpoints.forEach((cp, i) => {
      const near = nearestCheckpoint && nearestCheckpoint.id === cp.id;
      drawCheckpoint(cp, near, i + 1);
    });

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
    if (!overlayOpen && !valentineOverlayOpen && !islandEndPopupOpen) update(dt);
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

