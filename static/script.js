/*
  CipherCore – Frontend Logic
  ---------------------------
  This script:
  1) Reads the textarea + dropdown values
  2) Sends them to POST /analyze as JSON
  3) Renders the returned label/score/reason/action in the UI
  4) Applies a color theme to the result card based on the label

  Extra UX polish:
  - Loading spinner + status pill
  - Animated reveal + severity meter
  - Icon switching (Safe/Suspicious/Dangerous)
  - Lightweight animated particle background (canvas)
  - Button ripple effect
  - Optional "Red Flags Detected" (simple keyword scan)
*/

// Grab the elements we need once (simple + fast)
const messageInput = document.getElementById("messageInput");
const sourceSelect = document.getElementById("sourceSelect");
const analyzeBtn = document.getElementById("analyzeBtn");

const resultCard = document.getElementById("resultCard");
const resultLabel = document.getElementById("resultLabel");
const resultScore = document.getElementById("resultScore");
const resultReason = document.getElementById("resultReason");
const resultAction = document.getElementById("resultAction");
const meterFill = document.getElementById("meterFill");

const statusPill = document.getElementById("statusPill");
const btnText = document.getElementById("btnText");
const btnSpinner = document.getElementById("btnSpinner");

const iconSafe = document.getElementById("iconSafe");
const iconSuspicious = document.getElementById("iconSuspicious");
const iconDangerous = document.getElementById("iconDangerous");

const flagsSection = document.getElementById("flagsSection");
const flagsList = document.getElementById("flagsList");

// Optional heuristic keywords for the "Red Flags" chips.
// (This does NOT replace the AI analysis; it just adds a nice UX touch.)
const RED_FLAG_KEYWORDS = [
  "kill", "hurt", "threat", "die", "attack", "rape", "stalk",
  "follow", "watching", "track", "leak", "dox", "blackmail",
  "meet me", "send pics", "nudes", "address", "weapon",
];

function setStatus(text) {
  if (!statusPill) return;
  statusPill.textContent = text;
}

function setLoading(isLoading) {
  analyzeBtn.disabled = isLoading;

  if (btnSpinner) btnSpinner.classList.toggle("hidden", !isLoading);
  if (btnText) btnText.textContent = isLoading ? "Analyzing" : "Analyze";

  setStatus(isLoading ? "Analyzing…" : "Ready");
}

function setIcon(label) {
  // Hide all icons first
  [iconSafe, iconSuspicious, iconDangerous].forEach((el) => el && el.classList.add("hidden"));

  const l = (label || "").toLowerCase();
  if (l === "safe" && iconSafe) iconSafe.classList.remove("hidden");
  else if (l === "suspicious" && iconSuspicious) iconSuspicious.classList.remove("hidden");
  else if (l === "dangerous" && iconDangerous) iconDangerous.classList.remove("hidden");
}

function renderRedFlags(messageText) {
  if (!flagsSection || !flagsList) return;

  const t = (messageText || "").toLowerCase();
  const hits = RED_FLAG_KEYWORDS.filter((kw) => t.includes(kw));

  // Clear old
  flagsList.innerHTML = "";

  if (hits.length === 0) {
    flagsSection.classList.add("hidden");
    return;
  }

  // Create little chips
  hits.slice(0, 10).forEach((kw) => {
    const chip = document.createElement("div");
    chip.className = "flag";
    chip.textContent = kw;
    flagsList.appendChild(chip);
  });

  flagsSection.classList.remove("hidden");
}

/**
 * Update the result UI.
 */
function renderResult(data) {
  resultLabel.textContent = data.label ?? "—";
  resultScore.textContent = String(data.score ?? 0);
  resultReason.textContent = data.reason ?? "—";
  resultAction.textContent = data.action ?? "—";

  // Remove any previous status class, then add the new one
  resultCard.classList.remove("safe", "suspicious", "dangerous", "hidden", "show");

  const label = (data.label || "").toLowerCase();
  if (label === "safe") resultCard.classList.add("safe");
  else if (label === "suspicious") resultCard.classList.add("suspicious");
  else if (label === "dangerous") resultCard.classList.add("dangerous");

  // Icon + severity meter
  setIcon(data.label);
  const score = Math.max(0, Math.min(100, Number(data.score) || 0));
  if (meterFill) meterFill.style.width = `${score}%`;

  // Trigger reveal animation every time (remove then re-add)
  // eslint-disable-next-line no-unused-expressions
  resultCard.offsetHeight; // force reflow
  resultCard.classList.add("show");
}

/**
 * Show a small error message in the result card.
 */
function renderError(message) {
  renderResult({
    label: "Suspicious",
    score: 50,
    reason: message,
    action: "Try again. If the issue persists, check the server logs.",
  });
}

async function analyzeMessage() {
  const message = messageInput.value.trim();
  const source = sourceSelect.value;

  if (!message) {
    renderError("Please enter a message to analyze.");
    return;
  }

  // Optional UX: show red flags (heuristic) based on the input message
  renderRedFlags(message);

  // UI: disable button while request is running
  setLoading(true);

  try {
    const res = await fetch("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, source }),
    });

    // If the server returns a non-2xx status, treat it as an error
    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }

    const data = await res.json();
    renderResult(data);
  } catch (err) {
    renderError(err.message || "Unknown error.");
  } finally {
    setLoading(false);
  }
}

// Run analysis when button is clicked
analyzeBtn.addEventListener("click", analyzeMessage);

// Optional: allow Ctrl+Enter / Cmd+Enter to analyze quickly
messageInput.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    analyzeMessage();
  }
});

// Button ripple effect (simple + lightweight)
analyzeBtn.addEventListener("click", (e) => {
  const rect = analyzeBtn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = e.clientX - rect.left - size / 2;
  const y = e.clientY - rect.top - size / 2;

  const ripple = document.createElement("span");
  ripple.className = "ripple";
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;

  analyzeBtn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 550);
});

/* -------------------------------------------------------------------------- */
/*  Animated background particles (Canvas)                                     */
/* -------------------------------------------------------------------------- */

function startParticles() {
  const canvas = document.getElementById("bgCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let w = 0;
  let h = 0;
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  function resize() {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const particleCount = () => (window.innerWidth < 640 ? 45 : 75);
  let particles = [];

  function resetParticles() {
    const n = particleCount();
    particles = new Array(n).fill(0).map(() => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.6 + Math.random() * 1.8,
      vx: -0.25 + Math.random() * 0.5,
      vy: -0.22 + Math.random() * 0.44,
      a: 0.12 + Math.random() * 0.25,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    // Soft vignette
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.6);
    grad.addColorStop(0, "rgba(255,255,255,0.02)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Particles
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;

      // Wrap around edges
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      if (p.y < -10) p.y = h + 10;
      if (p.y > h + 10) p.y = -10;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(110, 231, 255, ${p.a})`;
      ctx.fill();
    }

    // Very subtle connecting lines (only nearby points)
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i];
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          const alpha = (1 - dist / 120) * 0.08;
          ctx.strokeStyle = `rgba(255, 79, 216, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(draw);
  }

  resize();
  resetParticles();
  draw();

  window.addEventListener("resize", () => {
    resize();
    resetParticles();
  });
}

// Kick things off
startParticles();
setStatus("Ready");
