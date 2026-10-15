import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Star-chart line drawn behind page titles. Hidden when the theme turns constellations off. */
export function Constellation({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 420 120" className={cn("ov-constellation pointer-events-none", className)}>
      <polyline points="14,96 92,52 176,70 262,22 340,48 404,18" fill="none" strokeWidth="1" className="stroke-star/50" />
      <polyline points="262,22 286,104" fill="none" strokeWidth="1" className="stroke-star/30" />
      <circle cx="14" cy="96" r="2" className="fill-foreground/80" />
      <circle cx="92" cy="52" r="2" className="fill-foreground/80" />
      <circle cx="176" cy="70" r="2.6" className="fill-star" />
      <circle cx="262" cy="22" r="3" className="fill-star" />
      <circle cx="340" cy="48" r="2" className="fill-foreground/80" />
      <circle cx="404" cy="18" r="2" className="fill-foreground/80" />
      <circle cx="286" cy="104" r="1.8" className="fill-foreground/70" />
    </svg>
  );
}

interface PageHeaderProps {
  /** Short breadcrumb-style label above the title, e.g. "Feed / Medien". */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Buttons or controls shown on the right (wrap below the title on narrow screens). */
  actions?: ReactNode;
  /** Extra row under the title, e.g. tabs or filters. */
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, children, className }: PageHeaderProps) {
  return (
    <header className={cn("ov-rule relative flex flex-col gap-4 pb-5 pt-6 md:pt-8", className)}>
      <Constellation className="absolute right-[6%] top-0 hidden h-24 w-auto max-w-[55%] sm:block" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          {eyebrow && <span className="ov-label">{eyebrow}</span>}
          <h1 className="font-display text-[32px] font-semibold leading-none tracking-[-0.01em] md:text-[40px]">{title}</h1>
          {description && <p className="max-w-prose text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="relative flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {children && <div className="relative">{children}</div>}
    </header>
  );
}
