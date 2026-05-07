import React from "react";
import { AppLayout } from "./AppLayout";
import { useLocation } from "wouter";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();
  const isAuthPage = location === "/auth";

  if (isAuthPage) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <AppLayout>
      {children}
    </AppLayout>
  );
}
