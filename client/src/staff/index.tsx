import { lazy } from "react";
import { Switch, Route } from "wouter";
import { ProtectedRoute } from "@/lib/protected-route";

// Staff-only entry (admin and owner). Loaded through client/src/lib/staff.tsx; never import this from public code.

const AdminDashboard = lazy(() => import("./pages/dashboard"));
const ActivityLogsPageOld = lazy(() => import("./pages/activity-logs"));
const AdminSettingsPage = lazy(() => import("./pages/settings"));
const BansPage = lazy(() => import("./pages/BansPage").then((m) => ({ default: m.BansPage })));
const AutoPunishmentPage = lazy(() => import("./pages/AutoPunishmentPage").then((m) => ({ default: m.AutoPunishmentPage })));
const MonitoringOverview = lazy(() => import("./pages/monitoring/MonitoringOverview").then((m) => ({ default: m.MonitoringOverview })));
const ActivityLogsPage = lazy(() => import("./pages/monitoring/ActivityLogsPage").then((m) => ({ default: m.ActivityLogsPage })));
const GrowthDashboardPage = lazy(() => import("./pages/analytics/GrowthDashboardPage"));
const ModeratorPerformancePage = lazy(() => import("./pages/analytics/ModeratorPerformancePage"));
const StressTestPage = lazy(() => import("./pages/security/StressTestPage"));
const AdminTicketsOverview = lazy(() => import("./pages/AdminTicketsOverview"));
const NotFound = lazy(() => import("@/pages/misc/not-found"));

export function StaffRouter() {
  return (
    <Switch>
      {/* Admin routes: admin or owner */}
      <ProtectedRoute path="/admin" component={AdminDashboard} requiredRole="admin" />
      <ProtectedRoute path="/admin/users" component={AdminDashboard} requiredRole="admin" />
      <ProtectedRoute path="/admin/reports" component={AdminDashboard} requiredRole="admin" />
      <ProtectedRoute path="/admin/groups" component={AdminDashboard} requiredRole="admin" />
      <ProtectedRoute path="/admin/tickets" component={AdminTicketsOverview} requiredRole="admin" />
      <ProtectedRoute path="/admin/logs" component={ActivityLogsPageOld} requiredRole="admin" />
      <ProtectedRoute path="/admin/settings" component={AdminSettingsPage} requiredRole="admin" />
      <ProtectedRoute path="/admin/bans" component={BansPage} requiredRole="admin" />
      <ProtectedRoute path="/admin/auto-punishments" component={AutoPunishmentPage} requiredRole="admin" />

      {/* Monitoring routes: owner only */}
      <ProtectedRoute path="/admin/monitoring" component={MonitoringOverview} requiredRole="owner" />
      <ProtectedRoute path="/admin/monitoring/activity" component={ActivityLogsPage} requiredRole="owner" />
      <ProtectedRoute path="/admin/analytics" component={GrowthDashboardPage} requiredRole="owner" />
      <ProtectedRoute path="/admin/performance" component={ModeratorPerformancePage} requiredRole="owner" />
      <ProtectedRoute path="/admin/security/stress-test" component={StressTestPage} requiredRole="owner" />

      <Route component={NotFound} />
    </Switch>
  );
}

export { StaffNav } from "./nav";
export { TicketAssignSelect } from "./tickets/TicketAssignSelect";
