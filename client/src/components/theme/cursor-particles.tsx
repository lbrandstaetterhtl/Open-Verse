import { useEffect, useRef } from "react";

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

/**
 * CursorParticles — Works in both dark and light mode.
 * Dark mode: light blue-white glowing stars
 * Light mode: dark navy/indigo dots
 * All particles lazily drift toward the mouse cursor.
 */
export function CursorParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const particlesRef = useRef<Particle[]>([]);
  const frameRef = useRef<number>(0);
  const isDarkRef = useRef<boolean>(document.documentElement.classList.contains("dark"));

  useEffect(() => {
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

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMouseMove);

    // Watch theme class changes
    const observer = new MutationObserver(() => {
      isDarkRef.current = document.documentElement.classList.contains("dark");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const PARTICLE_COUNT = 120;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particlesRef.current.push(spawnRandom());
    }

    function spawnRandom(): Particle {
      const maxLife = 180 + Math.random() * 240;
      return {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: 0.8 + Math.random() * 2.2,
        opacity: 0.3 + Math.random() * 0.6,
        life: Math.random() * maxLife,
        maxLife,
      };
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mouse = mouseRef.current;
      const isDark = isDarkRef.current;

      particlesRef.current.forEach((p, i) => {
        p.life++;

        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        p.vx += (dx / dist) * 0.008;
        p.vy += (dy / dist) * 0.008;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.x += p.vx;
        p.y += p.vy;

        const lifeRatio = p.life / p.maxLife;
        let alpha = p.opacity;
        if (lifeRatio < 0.15) alpha *= lifeRatio / 0.15;
        if (lifeRatio > 0.75) alpha *= (1 - (lifeRatio - 0.75) / 0.25);
        alpha *= 0.7 + 0.3 * Math.sin(p.life * 0.07 + i);
        alpha = Math.max(0, alpha);

        ctx.save();
        ctx.globalAlpha = alpha;

        if (isDark) {
          // Blue-white glow for dark backgrounds
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3.5);
          g.addColorStop(0, "rgba(200, 210, 255, 1)");
          g.addColorStop(0.4, "rgba(150, 170, 255, 0.5)");
          g.addColorStop(1, "rgba(100, 120, 255, 0)");
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2);
          ctx.fillStyle = g;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(230, 240, 255, 1)";
          ctx.fill();
        } else {
          // Dark navy/indigo for light backgrounds
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3.5);
          g.addColorStop(0, "rgba(40, 40, 100, 0.9)");
          g.addColorStop(0.4, "rgba(60, 60, 140, 0.4)");
          g.addColorStop(1, "rgba(80, 60, 160, 0)");
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2);
          ctx.fillStyle = g;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(30, 30, 80, 1)";
          ctx.fill();
        }

        ctx.restore();

        if (p.life >= p.maxLife) {
          particlesRef.current[i] = spawnRandom();
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
      observer.disconnect();
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
