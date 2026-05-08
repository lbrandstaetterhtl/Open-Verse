import React from "react";
import { useAuth } from "@/hooks/use-auth";
import { Route, Redirect } from "wouter";
import { SkeletonFeed } from "@/components/layout/skeleton-loaders";

interface ProtectedRouteProps {
  path: string;
  component: React.ComponentType<any>;
  /** 'admin' = admin or owner; 'owner' = owner only */
  requiredRole?: "admin" | "owner";
}

export function ProtectedRoute({
  path,
  component: Component,
  requiredRole,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Route path={path}>
        <div className="container mx-auto px-4 pt-20">
          <SkeletonFeed />
        </div>
      </Route>
    );
  }

  if (!user) {
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }

  if (requiredRole === "owner" && user.role !== "owner") {
    return (
      <Route path={path}>
        <Redirect to="/" />
      </Route>
    );
  }

  if (
    requiredRole === "admin" &&
    !["admin", "owner"].includes(user.role ?? "")
  ) {
    return (
      <Route path={path}>
        <Redirect to="/" />
      </Route>
    );
  }

  return (
    <Route path={path}>
      <Component />
    </Route>
  );
}
