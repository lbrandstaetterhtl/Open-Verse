import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ThemeBackground } from "@/components/theme/theme-background";
import { ProtectedRoute } from "./lib/protected-route";
import { useWebSocket } from "@/hooks/use-websocket";
import { NewUserDialog } from "@/components/profile/new-user-dialog";

import { lazy, Suspense } from "react";

// Lazy-loaded Pages (PERF-FIX [OPT-008]: Code Splitting)
const AuthPage = lazy(() => import("@/pages/auth/auth-page"));
const NotFound = lazy(() => import("@/pages/misc/not-found"));
const ProfilePage = lazy(() => import("@/pages/profile/my-profile"));
const UserProfilePage = lazy(() => import("@/pages/profile/user-profile"));
const ChatPage = lazy(() => import("@/pages/chat/chat-page"));
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const ActivityLogsPage = lazy(() => import("@/pages/admin/activity-logs"));
const AdminSettingsPage = lazy(() => import("@/pages/admin/settings"));

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

function Router() {
  // Initialize WebSocket connection
  useWebSocket();

  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
      <Switch>
        <Route path="/auth" component={AuthPage} />

        {/* Feed Routes */}
        <ProtectedRoute path="/feed/media" component={MediaFeedPage} />
        <ProtectedRoute path="/feed/discussions" component={DiscussionsFeedPage} />
        <ProtectedRoute path="/feed/communities" component={CommunityFeedPage} />
        <ProtectedRoute path="/posts/:id" component={PostViewPage} />

        {/* Post Routes */}
        <ProtectedRoute path="/post/discussions" component={PostDiscussionsPage} />
        <ProtectedRoute path="/post/news" component={PostNewsPage} />
        <ProtectedRoute path="/post/entertainment" component={PostEntertainmentPage} />

        {/* User Routes */}
        <ProtectedRoute path="/profile" component={ProfilePage} />
        <Route path="/users/:username" component={UserProfilePage} />

        {/* Chat Route */}
        <ProtectedRoute path="/chat" component={ChatPage} />

        {/* AI Generator Route */}
        <ProtectedRoute path="/ai-generator" component={AIGeneratorPage} />

        {/* Admin Routes */}
        <ProtectedRoute path="/admin" component={AdminDashboard} />
        <ProtectedRoute path="/admin/users" component={AdminDashboard} />
        <ProtectedRoute path="/admin/reports" component={AdminDashboard} />
        <ProtectedRoute path="/admin/logs" component={ActivityLogsPage} />
        <ProtectedRoute path="/admin/settings" component={AdminSettingsPage} />

        {/* Community Routes */}
        <ProtectedRoute path="/create-community" component={CreateCommunityPage} />
        <ProtectedRoute path="/c/:slug" component={CommunityPage} />
        <ProtectedRoute path="/mod-panel" component={ModPanel} />

        {/* Theme Builder Route */}
        <ProtectedRoute path="/theme-builder" component={ThemeBuilderPage} />

        {/* Other Routes */}
        <ProtectedRoute path="/" component={MediaFeedPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

import { useEffect, useState } from "react";
import { useCustomTheme } from "@/hooks/use-custom-theme";
import type { BackgroundConfig } from "@/lib/theme-utils";
import { useSiteSettings } from "@/hooks/use-site-settings";

function GlobalThemeApplier() {
  const { background } = useCustomTheme();
  const [previewBg, setPreviewBg] = useState<BackgroundConfig | null>(null);

  useEffect(() => {
    const handlePreview = (e: any) => setPreviewBg(e.detail);
    window.addEventListener("open-verse-preview-bg", handlePreview);
    return () => window.removeEventListener("open-verse-preview-bg", handlePreview);
  }, []);

  return <ThemeBackground background={previewBg || background} />;
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
import { Footer } from "@/components/layout/footer";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
        <AuthProvider>
          <GlobalThemeApplier />
          <HeadManager />
          <MaintenanceGuard>
            <div className="flex flex-col min-h-screen">
              <div className="flex-grow pt-14">
                <Router />
              </div>
              <Footer />
            </div>
          </MaintenanceGuard>
          <NewUserDialog />
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
