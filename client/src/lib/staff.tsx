import { lazy } from "react";
import { Redirect } from "wouter";
import type { User } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { SkeletonFeed } from "@/components/layout/skeleton-loaders";
import i18n, { STAFF_NAMESPACES } from "./i18n";

/**
 * The admin/owner area (pages, navigation with its permission map, staff texts) is not part of the public
 * bundle: it lives in client/src/staff/, is built into assets/staff-*.js chunks (vite.config.ts) and its
 * texts into the staff locale namespaces. The server answers those files with 404 unless the session belongs
 * to an admin or owner (server/staff-assets.ts). This module is the only place public code loads it from,
 * and it does so only for staff users (role from /api/user).
 */
export const isStaffUser = (user: Pick<User, "role"> | null | undefined): boolean =>
  user?.role === "admin" || user?.role === "owner";

let staffModule: Promise<typeof import("@/staff")> | null = null;

/** Loads the staff chunk and the staff translations once (retried after a failure, e.g. an expired session). */
export function loadStaff() {
  if (!staffModule) {
    staffModule = Promise.all([import("@/staff"), i18n.loadNamespaces([...STAFF_NAMESPACES])]).then(([m]) => m);
    staffModule.catch(() => {
      staffModule = null;
    });
  }
  return staffModule;
}

const StaffRouter = lazy(() => loadStaff().then((m) => ({ default: m.StaffRouter })));
export const StaffNav = lazy(() => loadStaff().then((m) => ({ default: m.StaffNav })));
export const TicketAssignSelect = lazy(() => loadStaff().then((m) => ({ default: m.TicketAssignSelect })));

/** Route element for /admin and /admin/*: non-staff never download the staff code. */
export function StaffArea() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 pt-20">
        <SkeletonFeed />
      </div>
    );
  }
  if (!user) return <Redirect to="/auth" />;
  if (!isStaffUser(user)) return <Redirect to="/" />;
  return <StaffRouter />;
}
