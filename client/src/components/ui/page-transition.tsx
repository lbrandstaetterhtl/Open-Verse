import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

/**
 * SMOOTH-FIX: Wrap page content in this to ensure consistent,
 * animated entries across all routes.
 */
export function PageTransition({ children, className, delay = 0 }: PageTransitionProps) {
  return (
    <div 
      className={cn("animate-fade-up fill-mode-both", className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
