import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ThemeBackground } from "@/components/theme/theme-background";
import { CursorParticles } from "@/components/theme/cursor-particles";
import { ProtectedRoute } from "./lib/protected-route";
import { useWebSocket } from "@/hooks/use-websocket";
import { NewUserDialog } from "@/components/profile/new-user-dialog";
import { motion, AnimatePresence, useScroll, useSpring } from "framer-motion";
import { fadeIn } from "@/lib/animations";

import { lazy, Suspense } from "react";

// Lazy-loaded Pages (PERF-FIX [OPT-008]: Code Splitting)
const AuthPage = lazy(() => import("@/pages/auth/auth-page"));
const NotFound = lazy(() => import("@/pages/misc/not-found"));
const ProfilePage = lazy(() => import("@/pages/profile/my-profile"));
const UserProfilePage = lazy(() => import("@/pages/profile/user-profile"));
const ChatPage = lazy(() => import("@/pages/chat/chat-page"));
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const ActivityLogsPageOld = lazy(() => import("@/pages/admin/activity-logs")); // Legacy, if keeping
const AdminSettingsPage = lazy(() => import("@/pages/admin/settings"));
const NotificationsPage = lazy(() => import("@/pages/notifications/notifications-page"));

// Security Pages
const BansPage = lazy(() => import("@/pages/admin/BansPage").then(m => ({ default: m.BansPage })));
const AutoPunishmentPage = lazy(() => import("@/pages/admin/AutoPunishmentPage").then(m => ({ default: m.AutoPunishmentPage })));

// Monitoring Pages
const MonitoringOverview = lazy(() => import("@/pages/admin/monitoring/MonitoringOverview").then(m => ({ default: m.MonitoringOverview })));
const ActivityLogsPage = lazy(() => import("@/pages/admin/monitoring/ActivityLogsPage").then(m => ({ default: m.ActivityLogsPage })));
const AnomaliesPage = lazy(() => import("@/pages/admin/monitoring/AnomaliesPage").then(m => ({ default: m.AnomaliesPage })));
const GrowthDashboardPage = lazy(() => import("@/pages/admin/analytics/GrowthDashboardPage"));
const ModeratorPerformancePage = lazy(() => import("@/pages/admin/analytics/ModeratorPerformancePage"));
const StressTestPage = lazy(() => import("@/pages/admin/security/StressTestPage"));

// Feed Pages
const MediaFeedPage = lazy(() => import("@/pages/feed/media"));
const DiscussionsFeedPage = lazy(() => import("@/pages/feed/discussions"));
const CommunityFeedPage = lazy(() => import("@/pages/feed/communities"));
const PostViewPage = lazy(() => import("@/pages/feed/post-view"));

// Post Pages
const PostDiscussionsPage = lazy(() => import("@/pages/post/discussions"));
const PostNewsPage = lazy(() => import("@/pages/post/news"));
const PostEntertainmentPage = lazy(() => import("@/pages/post/entertainment"));

// Theme Page
const ThemeBuilderPage = lazy(() => import("@/pages/theme/theme-builder"));

// AI Generator Page
const AIGeneratorPage = lazy(() => import("@/pages/ai-bot/ai-generator"));

// Community Pages
const CreateCommunityPage = lazy(() => import("@/pages/communities/create-community"));
const CommunityPage = lazy(() => import("@/pages/communities/community-page"));
const ModPanel = lazy(() => import("@/pages/communities/mod-panel"));

// Ticket Pages
const TicketsPage = lazy(() => import("@/pages/tickets/TicketsPage"));
const CreateTicketPage = lazy(() => import("@/pages/tickets/CreateTicketPage"));
const TicketDetailPage = lazy(() => import("@/pages/tickets/TicketDetailPage"));
const AdminTicketsOverview = lazy(() => import("@/pages/admin/AdminTicketsOverview"));

import { SkeletonFeed } from "@/components/layout/skeleton-loaders";

function Router() {
  return (
    <Switch>
        <Route path="/auth" component={AuthPage} />

        {/* Feed Routes */}
        <ProtectedRoute path="/feed/media" component={MediaFeedPage} />
        <ProtectedRoute path="/feed/discussions" component={DiscussionsFeedPage} />
        <ProtectedRoute path="/feed/communities" component={CommunityFeedPage} />
        <ProtectedRoute path="/posts/:id" component={PostViewPage} />

        {/* Post Routes */}
        <ProtectedRoute path="/post/discussions" component={PostDiscussionsPage} />
        <ProtectedRoute path="/post/discussion" component={PostDiscussionsPage} />
        <ProtectedRoute path="/post/news" component={PostNewsPage} />
        <ProtectedRoute path="/post/entertainment" component={PostEntertainmentPage} />

        {/* User Routes */}
        <ProtectedRoute path="/profile" component={ProfilePage} />
        <Route path="/users/:username" component={UserProfilePage} />

        {/* Chat Route */}
        <ProtectedRoute path="/chat" component={ChatPage} />

        {/* AI Generator Route */}
        <ProtectedRoute path="/ai-generator" component={AIGeneratorPage} />

        {/* Ticket Routes */}
        <ProtectedRoute path="/tickets" component={TicketsPage} />
        <ProtectedRoute path="/tickets/new" component={CreateTicketPage} />
        <ProtectedRoute path="/tickets/:id" component={TicketDetailPage} />
        <ProtectedRoute path="/admin/tickets" component={AdminTicketsOverview} />

        {/* Admin Routes — require admin or owner role */}
        <ProtectedRoute path="/admin" component={AdminDashboard} requiredRole="admin" />
        <ProtectedRoute path="/admin/users" component={AdminDashboard} requiredRole="admin" />
        <ProtectedRoute path="/admin/reports" component={AdminDashboard} requiredRole="admin" />
        <ProtectedRoute path="/admin/logs" component={ActivityLogsPageOld} requiredRole="admin" />
        <ProtectedRoute path="/admin/settings" component={AdminSettingsPage} requiredRole="admin" />
        <ProtectedRoute path="/admin/bans" component={BansPage} requiredRole="admin" />
        <ProtectedRoute path="/admin/auto-punishments" component={AutoPunishmentPage} requiredRole="admin" />
        
        {/* Monitoring Routes — owner only */}
        <ProtectedRoute path="/admin/monitoring" component={MonitoringOverview} requiredRole="owner" />
        <ProtectedRoute path="/admin/monitoring/activity" component={ActivityLogsPage} requiredRole="owner" />
        <ProtectedRoute path="/admin/monitoring/anomalies" component={AnomaliesPage} requiredRole="owner" />
        <ProtectedRoute path="/admin/analytics" component={GrowthDashboardPage} requiredRole="owner" />
        <ProtectedRoute path="/admin/performance" component={ModeratorPerformancePage} requiredRole="owner" />
        <ProtectedRoute path="/admin/security/stress-test" component={StressTestPage} requiredRole="owner" />
        <ProtectedRoute path="/security/stress-test" component={StressTestPage} requiredRole="owner" />

        {/* Community Routes */}
        <ProtectedRoute path="/create-community" component={CreateCommunityPage} />
        <ProtectedRoute path="/c/:slug" component={CommunityPage} />
        <ProtectedRoute path="/mod-panel" component={ModPanel} />

        {/* Theme Builder Route */}
        <ProtectedRoute path="/theme-builder" component={ThemeBuilderPage} />

        {/* Notifications Route */}
        <ProtectedRoute path="/notifications" component={NotificationsPage} />

        {/* Root: redirect to feed */}
        <ProtectedRoute path="/" component={MediaFeedPage} />
        <Route component={NotFound} />
      </Switch>
  );
}

import { useEffect, useState } from "react";
import { useCustomTheme } from "@/hooks/use-custom-theme";
import type { BackgroundConfig } from "@/lib/theme-utils";
import { useSiteSettings } from "@/hooks/use-site-settings";

function GlobalThemeApplier() {
  const { background, isDark } = useCustomTheme();
  const [previewBg, setPreviewBg] = useState<BackgroundConfig | null>(null);

  useEffect(() => {
    const handlePreview = (e: any) => {
      // e.detail can be a BackgroundConfig or null (reset signal)
      setPreviewBg(e.detail ?? null);
    };
    window.addEventListener("open-verse-preview-bg", handlePreview);
    return () => window.removeEventListener("open-verse-preview-bg", handlePreview);
  }, []);

  // previewBg overrides the saved background during ThemeBuilder preview
  const effectiveBg = previewBg !== null ? (previewBg || background) : (background ?? null);
  return <ThemeBackground background={effectiveBg ?? undefined} isDark={isDark} />;
}

function HeadManager() {
  const { settings } = useSiteSettings();
  
  useEffect(() => {
    document.title = settings.site_name;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && settings.site_description) {
      metaDesc.setAttribute("content", settings.site_description);
    }
  }, [settings.site_name, settings.site_description]);

  return null;
}

import { MaintenanceGuard } from "@/components/layout/maintenance-guard";
import { AppShell } from "@/components/layout/AppShell";

function WebSocketManager() {
  useWebSocket();
  return null;
}

function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background z-[9999]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-sm font-medium text-muted-foreground animate-pulse">Initializing Osiris...</p>
      </div>
    </div>
  );
}

function AppContent() {
  const { isLoading } = useAuth();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="relative min-h-screen selection:bg-primary/30 overflow-x-hidden">
      <WebSocketManager />
      <GlobalThemeApplier />
      <CursorParticles />
      <HeadManager />
      
      {/* Scroll Progress Indicator */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-[2px] bg-primary z-[200] origin-left"
        style={{ scaleX }}
      />

      <MaintenanceGuard>
        <AppShell>
          <Suspense fallback={<SkeletonFeed />}>
            <AnimatePresence mode="wait">
              <motion.div
                key={window.location.pathname}
                variants={fadeIn}
                initial="initial"
                animate="animate"
                exit="exit"
                className="w-full h-full"
              >
                <Router />
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </AppShell>
      </MaintenanceGuard>
      
      <NewUserDialog />
      <Toaster />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="osiris-theme">
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
