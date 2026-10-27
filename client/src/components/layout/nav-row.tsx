import React from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

// Sidebar rows shared by the public navigation (AppSidebar) and the staff navigation (client/src/staff/nav.tsx).

export interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  /** Other paths that also mark this item as active (e.g. "/" for the feed). */
  alsoActive?: string[];
  /** Only this exact path is active (not its sub-paths). */
  exact?: boolean;
  permission?: string;
  badge?: number;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}


export function isItemActive(item: NavItem, location: string) {
  const paths = [item.href, ...(item.alsoActive ?? [])];
  return paths.some((p) => (item.exact || p === "/" ? location === p : location === p || location.startsWith(p + "/")));
}

export function NavItemRow({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const [location] = useLocation();
  const { t } = useTranslation();
  const isActive = isItemActive(item, location);
  const badge = item.badge && item.badge > 0 ? (item.badge > 99 ? "99+" : String(item.badge)) : null;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "relative flex h-10 items-center rounded-sm transition-colors duration-150 select-none sidebar-row",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        collapsed ? "justify-center px-2" : "gap-3 px-3",
        isActive ? "ov-nav-active ov-cut" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
    >
      <item.icon className={cn("h-[18px] w-[18px] flex-shrink-0", isActive ? "stroke-[2.25] text-primary" : "stroke-2")} />
      {!collapsed && (
        <span className={cn("flex-1 truncate text-[13px] sidebar-label", isActive ? "font-semibold" : "font-medium")}>{item.label}</span>
      )}
      {badge && (
        <span
          className={cn(
            "font-data flex h-4 min-w-[16px] items-center justify-center rounded-xs bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground",
            collapsed && "absolute right-1 top-1",
          )}
          aria-label={t("layout.sidebar.unread_badge", { badge, defaultValue: "{{badge}} unread" })}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

export function SectionTitle({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="mx-2 my-2 border-t border-border" aria-hidden="true" />;
  return <div className="ov-label px-3 pb-1.5 pt-3 sidebar-label">{children}</div>;
}

export function NavSections({ sections, collapsed, onNavigate }: { sections: NavSection[]; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <>
      {sections.map((section, i) => (
        <div key={section.title ?? i} role="group" aria-label={section.title}>
          {section.title && <SectionTitle collapsed={collapsed}>{section.title}</SectionTitle>}
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <NavItemRow key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
