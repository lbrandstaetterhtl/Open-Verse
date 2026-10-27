import React from "react";

/**
 * AdminLayout
 * A specialized wrapper for admin-area pages.
 * Note: The main sidebar and navbar are provided by the global AppShell
 * based on the /admin route prefix.
 */
interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="admin-content-wrapper min-h-full">
      {children}
    </div>
  );
}
