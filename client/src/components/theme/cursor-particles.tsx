import { useEffect, useRef } from "react";
import { CUSTOM_THEME_EVENT } from "@/lib/theme-utils";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  life: number;
  maxLife: number;
}

interface ParticleColors {
  core: string;
  glowInner: string;
  glowMid: string;
  glowOuter: string;
}

/**
 * Reads the CSS --background variable (HSL format: "H S% L%")
 * and computes contrasting particle colors that are always visible.
 */
function computeParticleColors(): ParticleColors {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--background")
    .trim();

  // Parse "H S% L%" or "H S L" (shadcn stores without % sometimes)
  const parts = raw.split(/\s+/);
  const h = parseFloat(parts[0]) || 0;
  const s = parseFloat(parts[1]) || 0;
  const l = parseFloat(parts[2]) || 50;

  // Complementary hue (shift 180°) with slight twist so it's never identical
  const complementH = (h + 195) % 360;

  if (l < 45) {
    // Dark background → bright, saturated particles
    const coreL = Math.min(l + 65, 95);
    const midL = Math.min(l + 50, 80);
    return {
      core:      `hsla(${complementH}, 90%, ${coreL}%, 1)`,
      glowInner: `hsla(${complementH}, 80%, ${midL}%, 1)`,
      glowMid:   `hsla(${complementH}, 70%, ${midL}%, 0.5)`,
      glowOuter: `hsla(${complementH}, 60%, ${midL}%, 0)`,
    };
  } else {
    // Light / mid background → dark, rich particles
    const coreL = Math.max(l - 55, 8);
    const midL  = Math.max(l - 40, 15);
    return {
      core:      `hsla(${complementH}, 85%, ${coreL}%, 1)`,
      glowInner: `hsla(${complementH}, 75%, ${midL}%, 0.9)`,
      glowMid:   `hsla(${complementH}, 65%, ${midL}%, 0.4)`,
      glowOuter: `hsla(${complementH}, 55%, ${midL}%, 0)`,
    };
  }
}

export function CursorParticles() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const mouseRef     = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const particlesRef = useRef<Particle[]>([]);
  const frameRef     = useRef<number>(0);
  const colorsRef    = useRef<ParticleColors>(computeParticleColors());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Resize
    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Mouse tracking
    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMouseMove);

    // Re-compute colors when theme changes (class or custom-theme event)
    const refreshColors = () => {
      colorsRef.current = computeParticleColors();
    };
    const classObserver = new MutationObserver(refreshColors);
    classObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    window.addEventListener(CUSTOM_THEME_EVENT, refreshColors);

    // Seed particles
    const PARTICLE_COUNT = 120;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particlesRef.current.push(spawnRandom());
    }

    function spawnRandom(): Particle {
      const maxLife = 180 + Math.random() * 240;
      return {
        x:       Math.random() * window.innerWidth,
        y:       Math.random() * window.innerHeight,
        vx:      (Math.random() - 0.5) * 0.4,
        vy:      (Math.random() - 0.5) * 0.4,
        size:    0.8 + Math.random() * 2.2,
        opacity: 0.35 + Math.random() * 0.65,
        life:    Math.random() * maxLife,
        maxLife,
      };
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mouse  = mouseRef.current;
      const colors = colorsRef.current;

      particlesRef.current.forEach((p, i) => {
        p.life++;

        // Attract toward cursor
        const dx   = mouse.x - p.x;
        const dy   = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        p.vx += (dx / dist) * 0.008;
        p.vy += (dy / dist) * 0.008;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.x  += p.vx;
        p.y  += p.vy;

        // Fade + twinkle
        const lifeRatio = p.life / p.maxLife;
        let alpha = p.opacity;
        if (lifeRatio < 0.15) alpha *= lifeRatio / 0.15;
        if (lifeRatio > 0.75) alpha *= (1 - (lifeRatio - 0.75) / 0.25);
        alpha *= 0.7 + 0.3 * Math.sin(p.life * 0.07 + i);
        alpha = Math.max(0, alpha);

        ctx.save();
        ctx.globalAlpha = alpha;

        // Glow halo
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3.5);
        g.addColorStop(0,   colors.glowInner);
        g.addColorStop(0.4, colors.glowMid);
        g.addColorStop(1,   colors.glowOuter);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();

        // Bright core dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = colors.core;
        ctx.fill();

        ctx.restore();

        // Respawn
        if (p.life >= p.maxLife) {
          particlesRef.current[i]      = spawnRandom();
          particlesRef.current[i].life = 0;
        }
      });

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener(CUSTOM_THEME_EVENT, refreshColors);
      classObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: -9 }}
      aria-hidden="true"
    />
  );
}
