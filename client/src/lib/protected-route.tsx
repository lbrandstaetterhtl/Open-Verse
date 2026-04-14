import React from "react";
import { useAuth } from "@/hooks/use-auth";
import { Route, Redirect } from "wouter";
import { SkeletonFeed } from "@/components/layout/skeleton-loaders";

export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: React.ComponentType<any>;
}) {
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

  return (
    <Route path={path}>
      <Component />
    </Route>
  );
}
