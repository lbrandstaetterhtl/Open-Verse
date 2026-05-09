import { useEffect, useRef } from "react";
import { CUSTOM_THEME_EVENT, defaultParticles } from "@/lib/theme-utils";

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

interface ResolvedColors {
  core: string;
  glowInner: string;
  glowMid: string;
  glowOuter: string;
}

/** Reads particle CSS variables set by applyParticleConfig() */
function readParticleColors(): ResolvedColors {
  const style = getComputedStyle(document.documentElement);
  const core = style.getPropertyValue("--particle-core").trim() || defaultParticles.coreColor;
  const glow = style.getPropertyValue("--particle-glow").trim() || defaultParticles.glowColor;

  return {
    core,
    glowInner: glow + "ff",
    glowMid:   glow + "88",
    glowOuter: glow + "00",
  };
}

/** Reads --particle-enabled CSS variable */
function readEnabled(): boolean {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--particle-enabled").trim();
  return v !== "0";
}

/**
 * CursorParticles — Canvas particle system.
 * Colors are driven by --particle-core and --particle-glow CSS variables,
 * set via applyParticleConfig() from the ThemeBuilder.
 */
export function CursorParticles() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const mouseRef     = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const particlesRef = useRef<Particle[]>([]);
  const frameRef     = useRef<number>(0);
  const colorsRef    = useRef<ResolvedColors>(readParticleColors());
  const enabledRef   = useRef<boolean>(readEnabled());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMouseMove);

    const refreshColors = () => {
      colorsRef.current = readParticleColors();
      enabledRef.current = readEnabled();
    };
    const classObserver = new MutationObserver(refreshColors);
    classObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    window.addEventListener(CUSTOM_THEME_EVENT, refreshColors);

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

      if (enabledRef.current) {
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

          // Glow halo using custom glow color
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3.5);
          g.addColorStop(0,   colors.glowInner);
          g.addColorStop(0.4, colors.glowMid);
          g.addColorStop(1,   colors.glowOuter);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2);
          ctx.fillStyle = g;
          ctx.fill();

          // Core dot using custom core color
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = colors.core;
          ctx.fill();

          ctx.restore();

          if (p.life >= p.maxLife) {
            particlesRef.current[i]      = spawnRandom();
            particlesRef.current[i].life = 0;
          }
        });
      }

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
