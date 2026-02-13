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

// Pages
import AuthPage from "@/pages/auth/auth-page";
import NotFound from "@/pages/misc/not-found";
import ProfilePage from "@/pages/profile/my-profile";
import UserProfilePage from "@/pages/profile/user-profile";
import ChatPage from "@/pages/chat/chat-page";
import AdminDashboard from "@/pages/admin/dashboard";

// Feed Pages
import MediaFeedPage from "@/pages/feed/media";
import DiscussionsFeedPage from "@/pages/feed/discussions";
import CommunityFeedPage from "@/pages/feed/communities";
import PostViewPage from "@/pages/feed/post-view";

// Post Pages
import PostDiscussionsPage from "@/pages/post/discussions";
import PostNewsPage from "@/pages/post/news";
import PostEntertainmentPage from "@/pages/post/entertainment";

// Theme Page
import ThemeBuilderPage from "@/pages/theme/theme-builder";

// AI Generator Page
import AIGeneratorPage from "@/pages/ai-bot/ai-generator";

// Community Pages
import CreateCommunityPage from "@/pages/communities/create-community";
import CommunityPage from "@/pages/communities/community-page";
import ModPanel from "@/pages/communities/mod-panel";

function Router() {
  // Initialize WebSocket connection
  useWebSocket();

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
      <ProtectedRoute path="/post/news" component={PostNewsPage} />
      <ProtectedRoute path="/post/entertainment" component={PostEntertainmentPage} />

      {/* User Routes */}
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <Route path="/users/:username" component={UserProfilePage} />

      {/* Chat Route */}
      <ProtectedRoute path="/chat" component={ChatPage} />

      {/* AI Generator Route */}
      <ProtectedRoute path="/ai-generator" component={AIGeneratorPage} />

      {/* Admin Route */}
      <ProtectedRoute path="/admin" component={AdminDashboard} />

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
  );
}

// Helper component to ensure custom theme is applied globally
import { useCustomTheme } from "@/hooks/use-custom-theme";

function GlobalThemeApplier() {
  const { background } = useCustomTheme();
  return <ThemeBackground background={background} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
        <AuthProvider>
          <GlobalThemeApplier />
          <Router />
          <NewUserDialog />
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
