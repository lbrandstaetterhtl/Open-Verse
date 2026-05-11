import React, { useEffect, useRef } from "react";

/**
 * HIGH-PERFORMANCE PARTICLE SYSTEM [OPT-009]
 * 
 * Performance features:
 * 1. Pre-rendered particle sprites (Offscreen Canvas)
 * 2. Optimized animation loop (requestAnimationFrame)
 * 3. Typed Arrays for particle data (minimal GC)
 * 4. High-DPI support (window.devicePixelRatio)
 */

interface ParticleBackgroundProps {
  count?: number;
  color?: string;
  speed?: number;
}

export function ParticleBackground({ 
  count = 60, 
  color = "rgba(255, 255, 255, 0.4)", 
  speed = 0.5 
}: ParticleBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<{
    x: Float32Array;
    y: Float32Array;
    vx: Float32Array;
    vy: Float32Array;
    size: Float32Array;
    opacity: Float32Array;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // --- Pre-render particle sprite ---
    const spriteCanvas = document.createElement("canvas");
    const spriteSize = 16;
    spriteCanvas.width = spriteSize;
    spriteCanvas.height = spriteSize;
    const sCtx = spriteCanvas.getContext("2d");
    if (sCtx) {
      const gradient = sCtx.createRadialGradient(
        spriteSize / 2, spriteSize / 2, 0,
        spriteSize / 2, spriteSize / 2, spriteSize / 2
      );
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, "transparent");
      sCtx.fillStyle = gradient;
      sCtx.beginPath();
      sCtx.arc(spriteSize / 2, spriteSize / 2, spriteSize / 2, 0, Math.PI * 2);
      sCtx.fill();
    }

    let animationFrameId: number;
    let width = 0;
    let height = 0;

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };

    const initParticles = () => {
      const x = new Float32Array(count);
      const y = new Float32Array(count);
      const vx = new Float32Array(count);
      const vy = new Float32Array(count);
      const size = new Float32Array(count);
      const opacity = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        x[i] = Math.random() * window.innerWidth;
        y[i] = Math.random() * window.innerHeight;
        vx[i] = (Math.random() - 0.5) * speed;
        vy[i] = (Math.random() - 0.5) * speed;
        size[i] = Math.random() * 3 + 1;
        opacity[i] = Math.random() * 0.5 + 0.1;
      }

      particlesRef.current = { x, y, vx, vy, size, opacity };
    };

    const render = () => {
      const p = particlesRef.current;
      if (!p) return;

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < count; i++) {
        // Update
        p.x[i] += p.vx[i];
        p.y[i] += p.vy[i];

        // Wrap around
        if (p.x[i] < -20) p.x[i] = width + 20;
        if (p.x[i] > width + 20) p.x[i] = -20;
        if (p.y[i] < -20) p.y[i] = height + 20;
        if (p.y[i] > height + 20) p.y[i] = -20;

        // Draw (using pre-rendered sprite is MUCH faster than arc())
        ctx.globalAlpha = p.opacity[i];
        ctx.drawImage(
          spriteCanvas,
          p.x[i] - p.size[i],
          p.y[i] - p.size[i],
          p.size[i] * 2,
          p.size[i] * 2
        );
      }

      animationFrameId = requestAnimationFrame(render);
    };

    handleResize();
    initParticles();
    render();

    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [count, color, speed]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full mix-blend-screen pointer-events-none opacity-30"
    />
  );
}
