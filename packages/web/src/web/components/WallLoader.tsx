import { useEffect, useRef, useState, useCallback } from "react";

interface WallLoaderProps {
  onComplete: () => void;
  theme: "dark" | "light";
}

// ─── Brick wall drawing helpers ───

function drawBrick(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  baseColor: string,
  highlight: string,
  shadow: string
) {
  // Main face
  ctx.fillStyle = baseColor;
  ctx.fillRect(x, y, w, h);
  // Highlight (top + left)
  ctx.fillStyle = highlight;
  ctx.fillRect(x, y, w, 2);
  ctx.fillRect(x, y, 2, h);
  // Shadow (bottom + right)
  ctx.fillStyle = shadow;
  ctx.fillRect(x, y + h - 2, w, 2);
  ctx.fillRect(x + w - 2, y, 2, h);
}

function drawBrickWall(ctx: CanvasRenderingContext2D, W: number, H: number) {
  // Dark mortar background
  ctx.fillStyle = "#070d14";
  ctx.fillRect(0, 0, W, H);

  const bw = 80;
  const bh = 36;
  const gap = 4;
  const rows = Math.ceil(H / (bh + gap)) + 1;
  const cols = Math.ceil(W / (bw + gap)) + 2;

  for (let row = 0; row < rows; row++) {
    const offset = row % 2 === 0 ? 0 : -(bw + gap) / 2;
    for (let col = -1; col < cols; col++) {
      const bx = col * (bw + gap) + offset;
      const by = row * (bh + gap);

      // Subtle color variation
      const r = 18 + Math.floor(Math.random() * 14);
      const g = 30 + Math.floor(Math.random() * 16);
      const b = 52 + Math.floor(Math.random() * 20);
      const base = `rgb(${r},${g},${b})`;
      const hi = `rgba(${r + 20},${g + 20},${b + 20},0.4)`;
      const sh = `rgba(0,0,0,0.5)`;

      drawBrick(ctx, bx, by, bw, bh, base, hi, sh);
    }
  }
}

// ─── Damage data ───

interface Crack {
  x: number;
  y: number;
  segments: { dx: number; dy: number }[];
  width: number;
}

interface Hole {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rotation: number;
}

interface Debris {
  x: number;
  y: number;
  size: number;
  color: string;
  vx: number;
  vy: number;
  alpha: number;
  rotation: number;
  rotSpeed: number;
}

function generateCracks(W: number, H: number, centerX: number, centerY: number): Crack[] {
  const cracks: Crack[] = [];
  const count = 18 + Math.floor(Math.random() * 10);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * Math.max(W, H) * 0.45;
    const cx = centerX + Math.cos(angle) * dist * 0.3;
    const cy = centerY + Math.sin(angle) * dist * 0.3;
    const segCount = 4 + Math.floor(Math.random() * 6);
    const segs: { dx: number; dy: number }[] = [];
    for (let s = 0; s < segCount; s++) {
      segs.push({
        dx: (Math.random() - 0.5) * 60 + Math.cos(angle) * 25,
        dy: (Math.random() - 0.5) * 60 + Math.sin(angle) * 25,
      });
    }
    cracks.push({ x: cx, y: cy, segments: segs, width: 1 + Math.random() * 2.5 });
  }
  return cracks;
}

function generateHoles(W: number, H: number, centerX: number, centerY: number): Hole[] {
  const holes: Hole[] = [];
  // Big central hole
  holes.push({ x: centerX, y: centerY, rx: 60 + Math.random() * 30, ry: 30 + Math.random() * 15, rotation: Math.random() * 0.3 });
  // Scattered holes
  const count = 8 + Math.floor(Math.random() * 6);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * Math.min(W, H) * 0.35;
    holes.push({
      x: centerX + Math.cos(angle) * dist,
      y: centerY + Math.sin(angle) * dist,
      rx: 12 + Math.random() * 35,
      ry: 8 + Math.random() * 20,
      rotation: Math.random() * Math.PI,
    });
  }
  return holes;
}

function drawDamage(
  ctx: CanvasRenderingContext2D,
  cracks: Crack[],
  holes: Hole[],
  progress: number // 0-1
) {
  const p = Math.min(1, progress);

  // Draw holes
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i];
    const holeProgress = Math.min(1, p * holes.length / (i + 1));
    if (holeProgress <= 0) continue;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.rotation);
    ctx.scale(holeProgress, holeProgress);

    // Dark hole
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(h.rx, h.ry));
    grad.addColorStop(0, "rgba(0,0,0,0.95)");
    grad.addColorStop(0.6, "rgba(5,5,10,0.85)");
    grad.addColorStop(1, "rgba(10,15,25,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, h.rx, h.ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Burnt orange edge
    const edgeGrad = ctx.createRadialGradient(0, 0, Math.max(h.rx, h.ry) * 0.7, 0, 0, Math.max(h.rx, h.ry) * 1.2);
    edgeGrad.addColorStop(0, "rgba(0,0,0,0)");
    edgeGrad.addColorStop(0.5, "rgba(30,20,10,0.4)");
    edgeGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = edgeGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, h.rx * 1.3, h.ry * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Draw cracks
  for (const crack of cracks) {
    const visSegs = Math.ceil(crack.segments.length * p);
    if (visSegs === 0) continue;
    ctx.strokeStyle = `rgba(0,0,0,${0.6 + p * 0.3})`;
    ctx.lineWidth = crack.width * p;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(crack.x, crack.y);
    let cx = crack.x;
    let cy = crack.y;
    for (let i = 0; i < visSegs; i++) {
      cx += crack.segments[i].dx;
      cy += crack.segments[i].dy;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // Subtle shadow along crack
    ctx.strokeStyle = `rgba(5,5,15,${0.3 * p})`;
    ctx.lineWidth = crack.width * p + 3;
    ctx.beginPath();
    ctx.moveTo(crack.x, crack.y);
    cx = crack.x;
    cy = crack.y;
    for (let i = 0; i < visSegs; i++) {
      cx += crack.segments[i].dx;
      cy += crack.segments[i].dy;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }
}

// ─── Main component ───

export function WallLoader({ onComplete, theme }: WallLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"loading" | "exploding" | "done">("loading");
  const [percent, setPercent] = useState(0);
  const damageDataRef = useRef<{ cracks: Crack[]; holes: Hole[] } | null>(null);
  const debrisRef = useRef<Debris[]>([]);
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const wallImageRef = useRef<ImageData | null>(null);

  // Skip everything in light mode
  if (theme === "light") {
    return null;
  }

  const drawLoadingBar = useCallback(
    (ctx: CanvasRenderingContext2D, W: number, H: number, pct: number, time: number) => {
      const barW = Math.min(400, W * 0.55);
      const barH = 28;
      const barX = (W - barW) / 2;
      const barY = H / 2 - barH / 2;
      const radius = 10;
      const fillW = (barW - 6) * (pct / 100);

      // Glow behind bar — intense Chemical X radiance
      const glowSize = 50 + Math.sin(time * 3) * 12;
      const glow = ctx.createRadialGradient(
        W / 2,
        barY + barH / 2,
        barW * 0.05,
        W / 2,
        barY + barH / 2,
        barW * 0.75 + glowSize
      );
      glow.addColorStop(0, "rgba(40,140,255,0.30)");
      glow.addColorStop(0.3, "rgba(30,120,255,0.15)");
      glow.addColorStop(0.6, "rgba(20,80,200,0.06)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // Bar border (rounded)
      ctx.strokeStyle = "rgba(60,160,255,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, radius);
      ctx.stroke();

      // Outer glow on border — extra bright
      ctx.shadowColor = "rgba(50,160,255,0.9)";
      ctx.shadowBlur = 22 + Math.sin(time * 4) * 8;
      ctx.strokeStyle = "rgba(80,180,255,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, radius);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";

      // Fill ("Chemical X" blue liquid)
      if (fillW > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(barX + 3, barY + 3, barW - 6, barH - 6, radius - 3);
        ctx.clip();

        // Base gradient
        const fillGrad = ctx.createLinearGradient(barX, barY, barX + fillW, barY + barH);
        fillGrad.addColorStop(0, "rgba(20,80,220,0.9)");
        fillGrad.addColorStop(0.3, "rgba(30,120,255,0.95)");
        fillGrad.addColorStop(0.6, "rgba(50,160,255,1)");
        fillGrad.addColorStop(1, "rgba(80,200,255,1)");
        ctx.fillStyle = fillGrad;
        ctx.fillRect(barX + 3, barY + 3, fillW, barH - 6);

        // Diagonal stripes moving
        ctx.globalAlpha = 0.15;
        const stripeW = 14;
        const offset = (time * 60) % (stripeW * 2);
        ctx.fillStyle = "rgba(200,240,255,1)";
        for (let sx = -stripeW * 2 + offset; sx < fillW + stripeW * 2; sx += stripeW * 2) {
          ctx.beginPath();
          ctx.moveTo(barX + 3 + sx, barY + 3);
          ctx.lineTo(barX + 3 + sx + stripeW, barY + 3);
          ctx.lineTo(barX + 3 + sx + stripeW - 12, barY + barH - 3);
          ctx.lineTo(barX + 3 + sx - 12, barY + barH - 3);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Shine sweep
        const sweepX = barX + 3 + ((time * 80) % (fillW + 60)) - 30;
        const shine = ctx.createLinearGradient(sweepX, barY, sweepX + 60, barY);
        shine.addColorStop(0, "rgba(255,255,255,0)");
        shine.addColorStop(0.5, "rgba(255,255,255,0.25)");
        shine.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = shine;
        ctx.fillRect(barX + 3, barY + 3, fillW, barH - 6);

        // Top highlight
        const topH = ctx.createLinearGradient(barX, barY + 3, barX, barY + barH / 2);
        topH.addColorStop(0, "rgba(255,255,255,0.18)");
        topH.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = topH;
        ctx.fillRect(barX + 3, barY + 3, fillW, barH / 2 - 3);

        ctx.restore();

        // Glow from fill edge — intense pulsing
        const pulseGlow = 0.6 + Math.sin(time * 5) * 0.15;
        const edgeGlow = ctx.createRadialGradient(
          barX + 3 + fillW,
          barY + barH / 2,
          2,
          barX + 3 + fillW,
          barY + barH / 2,
          45
        );
        edgeGlow.addColorStop(0, `rgba(120,210,255,${pulseGlow})`);
        edgeGlow.addColorStop(0.5, "rgba(60,150,255,0.2)");
        edgeGlow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = edgeGlow;
        ctx.fillRect(barX + 3 + fillW - 45, barY - 30, 90, barH + 60);
      }

      // Welcome title text — neon glow
      ctx.font = "700 22px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(210,240,255,0.98)";
      ctx.shadowColor = "rgba(60,170,255,0.9)";
      ctx.shadowBlur = 20;
      ctx.fillText("Welcome to mIRCoin Chat", W / 2, barY - 55);
      ctx.shadowBlur = 35;
      ctx.shadowColor = "rgba(40,130,255,0.4)";
      ctx.fillText("Welcome to mIRCoin Chat", W / 2, barY - 55);
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";

      // Subtitle
      ctx.font = "400 14px 'Inter', sans-serif";
      ctx.fillStyle = "rgba(160,200,240,0.8)";
      ctx.shadowColor = "rgba(60,170,255,0.5)";
      ctx.shadowBlur = 10;
      ctx.fillText("Free for all (created by deemah)", W / 2, barY - 30);
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";

      // "Loading..." text — neon glow
      ctx.font = "500 16px 'Inter', sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(180,225,255,0.95)";
      ctx.shadowColor = "rgba(60,170,255,0.8)";
      ctx.shadowBlur = 16;
      ctx.fillText("Loading...", W / 2 - barW / 2, barY + barH + 28);
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";

      // Percentage — neon glow
      ctx.font = "600 16px 'Inter', sans-serif";
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(210,240,255,0.98)";
      ctx.shadowColor = "rgba(60,170,255,0.8)";
      ctx.shadowBlur = 14;
      ctx.fillText(`${Math.floor(pct)}%`, W / 2 + barW / 2, barY + barH + 28);
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
    },
    []
  );

  useEffect(() => {
    if (theme === "light") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const W = () => canvas.width;
    const H = () => canvas.height;

    // Draw initial wall
    drawBrickWall(ctx, W(), H());
    wallImageRef.current = ctx.getImageData(0, 0, W(), H());

    startTimeRef.current = performance.now();
    const loadDuration = 3500; // 3.5s to fill

    let cancelled = false;

    const loadingLoop = (now: number) => {
      if (cancelled) return;
      const elapsed = now - startTimeRef.current;
      const t = elapsed / 1000;
      const pct = Math.min(100, (elapsed / loadDuration) * 100);
      setPercent(pct);

      // Redraw wall
      if (wallImageRef.current) {
        ctx.putImageData(wallImageRef.current, 0, 0);
      }

      drawLoadingBar(ctx, W(), H(), pct, t);

      if (pct < 100) {
        animFrameRef.current = requestAnimationFrame(loadingLoop);
      } else {
        // Start explosion
        setPhase("exploding");
        startExplosion(ctx, W(), H());
      }
    };

    const startExplosion = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const cx = w / 2;
      const cy = h / 2;

      // Generate damage
      const cracks = generateCracks(w, h, cx, cy);
      const holes = generateHoles(w, h, cx, cy);
      damageDataRef.current = { cracks, holes };

      // Generate debris particles
      const debris: Debris[] = [];
      for (let i = 0; i < 60; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 8;
        debris.push({
          x: cx + (Math.random() - 0.5) * 100,
          y: cy + (Math.random() - 0.5) * 40,
          size: 3 + Math.random() * 8,
          color: `rgb(${15 + Math.floor(Math.random() * 25)},${25 + Math.floor(Math.random() * 25)},${45 + Math.floor(Math.random() * 30)})`,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          alpha: 1,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.3,
        });
      }
      debrisRef.current = debris;

      const explodeStart = performance.now();
      const explodeDuration = 1500;

      const explosionLoop = (now: number) => {
        if (cancelled) return;
        const elapsed = now - explodeStart;
        const p = Math.min(1, elapsed / explodeDuration);

        // Redraw wall
        if (wallImageRef.current) {
          ctx.putImageData(wallImageRef.current, 0, 0);
        }

        // Flash
        if (p < 0.15) {
          const flashAlpha = (1 - p / 0.15) * 0.5;
          ctx.fillStyle = `rgba(100,180,255,${flashAlpha})`;
          ctx.fillRect(0, 0, w, h);
        }

        // Draw damage with progress
        drawDamage(ctx, cracks, holes, p);

        // Draw debris
        const deb = debrisRef.current;
        for (const d of deb) {
          d.x += d.vx;
          d.y += d.vy;
          d.vy += 0.15; // gravity
          d.alpha -= 0.012;
          d.rotation += d.rotSpeed;
          if (d.alpha <= 0) continue;

          ctx.save();
          ctx.translate(d.x, d.y);
          ctx.rotate(d.rotation);
          ctx.globalAlpha = Math.max(0, d.alpha);
          ctx.fillStyle = d.color;
          ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
          ctx.restore();
        }
        ctx.globalAlpha = 1;

        // Shake effect
        if (p < 0.4) {
          const intensity = (1 - p / 0.4) * 6;
          canvas.style.transform = `translate(${(Math.random() - 0.5) * intensity}px, ${(Math.random() - 0.5) * intensity}px)`;
        } else {
          canvas.style.transform = "";
        }

        if (p < 1) {
          animFrameRef.current = requestAnimationFrame(explosionLoop);
        } else {
          // Done — finalize
          canvas.style.transform = "";
          // Redraw final state
          if (wallImageRef.current) {
            ctx.putImageData(wallImageRef.current, 0, 0);
          }
          drawDamage(ctx, cracks, holes, 1);

          // Store the final damaged wall as the background
          wallImageRef.current = ctx.getImageData(0, 0, w, h);
          setPhase("done");
          onComplete();
        }
      };

      animFrameRef.current = requestAnimationFrame(explosionLoop);
    };

    animFrameRef.current = requestAnimationFrame(loadingLoop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [theme, onComplete, drawLoadingBar]);

  if (theme === "light") return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 z-0"
        style={{ pointerEvents: "none" }}
      />
      {/* Loading overlay with text - only during loading phase */}
      {phase === "loading" && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-[1] flex items-center justify-center"
          style={{ pointerEvents: "none" }}
        />
      )}
    </>
  );
}

// ─── Static damaged wall background (used after loading) ───

export function DamagedWallBackground({ theme }: { theme: "dark" | "light" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (theme !== "dark") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;

      drawBrickWall(ctx, W, H);

      // Use a seeded random for consistent damage pattern
      const cracks = generateCracksSeeded(W, H, cx, cy);
      const holes = generateHolesSeeded(W, H, cx, cy);
      drawDamage(ctx, cracks, holes, 1);
    };

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [theme]);

  if (theme !== "dark") return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0"
      style={{ pointerEvents: "none" }}
    />
  );
}

// Seeded pseudo-random for consistent damage after reload
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateCracksSeeded(W: number, H: number, centerX: number, centerY: number): Crack[] {
  const rand = seededRandom(42);
  const cracks: Crack[] = [];
  const count = 22;
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 30 + rand() * Math.max(W, H) * 0.45;
    const cx = centerX + Math.cos(angle) * dist * 0.3;
    const cy = centerY + Math.sin(angle) * dist * 0.3;
    const segCount = 4 + Math.floor(rand() * 6);
    const segs: { dx: number; dy: number }[] = [];
    for (let s = 0; s < segCount; s++) {
      segs.push({
        dx: (rand() - 0.5) * 60 + Math.cos(angle) * 25,
        dy: (rand() - 0.5) * 60 + Math.sin(angle) * 25,
      });
    }
    cracks.push({ x: cx, y: cy, segments: segs, width: 1 + rand() * 2.5 });
  }
  return cracks;
}

function generateHolesSeeded(W: number, H: number, centerX: number, centerY: number): Hole[] {
  const rand = seededRandom(123);
  const holes: Hole[] = [];
  holes.push({ x: centerX, y: centerY, rx: 60 + rand() * 30, ry: 30 + rand() * 15, rotation: rand() * 0.3 });
  const count = 10;
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 80 + rand() * Math.min(W, H) * 0.35;
    holes.push({
      x: centerX + Math.cos(angle) * dist,
      y: centerY + Math.sin(angle) * dist,
      rx: 12 + rand() * 35,
      ry: 8 + rand() * 20,
      rotation: rand() * Math.PI,
    });
  }
  return holes;
}
