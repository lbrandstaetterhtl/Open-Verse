import { useTranslation } from "react-i18next";
import { LayoutDashboard, Users, Flag, Ticket, UsersRound, ShieldBan, Zap, Award, Radar, ScrollText, BarChart3, ShieldAlert, Settings } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { NavSections, type NavItem, type NavSection } from "@/components/layout/nav-row";

/** Sidebar of the admin area, with the group permission each page needs (owners see everything). */
export function StaffNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();

  const adminSections: NavSection[] = [
    {
      items: [{ href: "/admin", icon: LayoutDashboard, label: t("staff:nav.admin_overview", "Overview"), exact: true, permission: "dashboard" }],
    },
    {
      title: t("staff:nav.admin_people", "Users & content"),
      items: [
        { href: "/admin/users", icon: Users, label: t("staff:admin.tabs.users", "Users"), permission: "users" },
        { href: "/admin/reports", icon: Flag, label: t("staff:admin.tabs.reports", "Reports"), permission: "reports" },
        { href: "/admin/tickets", icon: Ticket, label: t("staff:nav.tickets", "Tickets"), permission: "tickets" },
        { href: "/admin/groups", icon: UsersRound, label: t("staff:nav.groups", "Groups"), permission: "groups" },
      ],
    },
    {
      title: t("staff:nav.admin_moderation", "Moderation"),
      items: [
        { href: "/admin/bans", icon: ShieldBan, label: t("staff:nav.bans", "Bans"), permission: "security" },
        { href: "/admin/auto-punishments", icon: Zap, label: t("staff:nav.auto_actions", "Automatic actions"), permission: "auto_punishment" },
        { href: "/admin/performance", icon: Award, label: t("staff:nav.mod_performance", "Moderator performance"), permission: "performance" },
      ],
    },
    {
      title: t("staff:nav.admin_system", "System"),
      items: [
        { href: "/admin/monitoring", icon: Radar, label: t("staff:nav.monitoring", "Monitoring"), exact: true, permission: "logs" },
        { href: "/admin/monitoring/activity", icon: ScrollText, label: t("staff:nav.logs", "Logs"), alsoActive: ["/admin/logs"], permission: "logs" },
        { href: "/admin/analytics", icon: BarChart3, label: t("staff:nav.analytics", "Analytics"), permission: "analytics" },
        { href: "/admin/security/stress-test", icon: ShieldAlert, label: t("staff:nav.stress_test", "Stress test"), permission: "stress_test" },
        { href: "/admin/settings", icon: Settings, label: t("staff:admin.tabs.settings", "Settings"), permission: "settings" },
      ],
    },
  ];

  const allowed = (item: NavItem) => user?.role === "owner" || !item.permission || hasPermission(item.permission);
  const sections = adminSections
    .map((s) => ({ ...s, items: s.items.filter(allowed) }))
    .filter((s) => s.items.length > 0);

  return <NavSections sections={sections} collapsed={collapsed} onNavigate={onNavigate} />;
}
