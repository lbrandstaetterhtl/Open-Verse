import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { StarChart } from "./star-chart";

/** Star chart behind page titles; the constellation follows the theme ("auto" varies per page). */
export function Constellation({ className }: { className?: string }) {
  const [location] = useLocation();
  return <StarChart className={className} seed={location} />;
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
      <Constellation className="absolute right-0 top-0 hidden h-28 w-auto max-w-[60%] sm:block" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          {eyebrow && <span className="ov-label">{eyebrow}</span>}
          <h1 className="font-display text-[32px] font-semibold leading-[1.1] tracking-[-0.01em] [overflow-wrap:anywhere] md:text-[40px]">{title}</h1>
          {description && <p className="max-w-prose text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="relative flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {children && <div className="relative">{children}</div>}
    </header>
  );
}
