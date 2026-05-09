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
 * CursorParticles — Dark mode only.
 * Renders a canvas layer with glowing star particles that lazily drift
 * toward the mouse cursor, giving the space background a living feel.
 */
export function CursorParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const particlesRef = useRef<Particle[]>([]);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // --- Size canvas ---
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // --- Track mouse ---
    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMouseMove);

    // --- Seed initial particles spread across the screen ---
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
        life: Math.random() * maxLife, // stagger start
        maxLife,
      };
    }

    // --- Animation loop ---
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mouse = mouseRef.current;

      particlesRef.current.forEach((p, i) => {
        p.life++;

        // Gently attract toward cursor (lazy follow)
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const attraction = 0.008; // very subtle
        p.vx += (dx / dist) * attraction;
        p.vy += (dy / dist) * attraction;

        // Dampen velocity so they don't accelerate forever
        p.vx *= 0.97;
        p.vy *= 0.97;

        p.x += p.vx;
        p.y += p.vy;

        // Fade in/out over lifetime
        const lifeRatio = p.life / p.maxLife;
        let alpha = p.opacity;
        if (lifeRatio < 0.15) alpha = p.opacity * (lifeRatio / 0.15);
        if (lifeRatio > 0.75) alpha = p.opacity * (1 - (lifeRatio - 0.75) / 0.25);

        // Twinkle
        alpha *= 0.7 + 0.3 * Math.sin(p.life * 0.07 + i);

        // Draw star with glow
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);

        // Outer glow
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3.5);
        gradient.addColorStop(0, "rgba(200, 210, 255, 1)");
        gradient.addColorStop(0.4, "rgba(150, 170, 255, 0.5)");
        gradient.addColorStop(1, "rgba(100, 120, 255, 0)");

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Bright core
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(230, 240, 255, 1)";
        ctx.fill();

        ctx.restore();

        // Reset when life is over (respawn randomly)
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
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none hidden dark:block"
      style={{ zIndex: -9 }} // above ThemeBackground (-z-10) but below content
      aria-hidden="true"
    />
  );
}
