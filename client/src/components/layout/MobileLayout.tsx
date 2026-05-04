import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MobileBottomNav } from "./mobile-bottom-nav";

/**
 * MOBILE-LAYOUT [UI-M-005]: Responsive Layout Wrapper
 * Ensures content is padded correctly for the bottom navigation on mobile
 * and follows safe area guidelines.
 */
export function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Content with Padding for Tab-Bar on Mobile only */}
      <div className={cn(
        "min-h-screen",
        // Desktop: no extra padding
        "md:pb-0",
        // Mobile: padding for tab-bar + safe area
        "pb-[calc(56px+env(safe-area-inset-bottom,0px))]"
      )}>
        {children}
      </div>

      {/* Persistent Bottom Tab Bar – visible only on mobile */}
      <MobileBottomNav />
    </>
  );
}
