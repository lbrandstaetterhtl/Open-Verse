import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { StarChart } from "./star-chart";

/** Star chart behind page titles; the constellation follows the theme ("auto" varies per page). */
export function Constellation({ className, fill }: { className?: string; fill?: boolean }) {
  const [location] = useLocation();
  return <StarChart className={className} seed={location} fill={fill} />;
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
      {/* Spans the whole header; fades towards the left so title and description stay readable. */}
      <Constellation
        fill
        className="absolute inset-0 hidden h-full w-full opacity-80 [mask-image:linear-gradient(to_right,rgba(0,0,0,0.3),rgba(0,0,0,0.55)_40%,black_75%)] sm:block"
      />
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
