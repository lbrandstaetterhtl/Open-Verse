import React, { ReactNode, useState, Suspense } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { 
  Menu, 
  X, 
  PenSquare, 
  Home, 
  Search, 
  Bell, 
  User, 
  Shield, 
  ArrowLeft 
} from "lucide-react";
import { Sidebar } from "./sidebar";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { Navbar } from "./navbar";
import { SkeletonFeed } from "./skeleton-loaders";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";

/**
 * APP-LAYOUT [UI-L-001]: Principal Responsive Layout
 * Handles Mobile Drawer, Tablet Icon-Sidebar, and Desktop Full-Sidebar.
 */

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const isAdminArea = location.startsWith('/admin') || location.startsWith('/tickets');

  return (
    <div className="min-h-screen bg-background selection:bg-primary/20 flex flex-col">
      {/* Global Top Navbar */}
      <Navbar />

      {/* Main Content Area */}
      <div className="flex flex-col min-h-screen transition-all duration-700 ease-in-out w-full pt-14">
        <main className={cn(
          "flex-1 relative",
          // Mobile padding for Bottom Tab Bar
          "pb-[calc(56px+env(safe-area-inset-bottom,0px))] md:pb-0",
          isAdminArea && "bg-muted/10"
        )}>
          <Suspense fallback={<div className="p-8"><SkeletonFeed /></div>}>
            <div className={cn(
              "w-full mx-auto",
              isAdminArea ? "max-w-none p-4 md:p-8 lg:p-10" : "max-w-[1280px] p-4 md:p-8"
            )}>
              {children}
            </div>
          </Suspense>
        </main>
      </div>

      {/* Persistent Bottom Tab Bar – visible only on mobile */}
      {!isAdminArea && <MobileBottomNav />}
    </div>
  );
}
