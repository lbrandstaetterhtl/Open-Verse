import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import { useWebSocket } from "@/hooks/use-websocket";
import { TutorialDialog } from "@/components/ui/tutorial-dialog";

// Pages
import AuthPage from "@/pages/auth-page";
import NotFound from "@/pages/not-found";
import ProfilePage from "@/pages/profile";
import UserProfilePage from "@/pages/user-profile";
import ChatPage from "@/pages/chat";
import AdminDashboard from "@/pages/admin/dashboard";

// Feed Pages
import MediaFeedPage from "@/pages/feed/media";
import DiscussionsFeedPage from "@/pages/feed/discussions";

// Post Pages
import PostDiscussionsPage from "@/pages/post/discussions";
import PostNewsPage from "@/pages/post/news";
import PostEntertainmentPage from "@/pages/post/entertainment";

function Router() {
  // Initialize WebSocket connection
  useWebSocket();

  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />

      {/* Feed Routes */}
      <ProtectedRoute path="/feed/media" component={MediaFeedPage} />
      <ProtectedRoute path="/feed/discussions" component={DiscussionsFeedPage} />

      {/* Post Routes */}
      <ProtectedRoute path="/post/discussions" component={PostDiscussionsPage} />
      <ProtectedRoute path="/post/news" component={PostNewsPage} />
      <ProtectedRoute path="/post/entertainment" component={PostEntertainmentPage} />

      {/* User Routes */}
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <Route path="/users/:username" component={UserProfilePage} />

      {/* Chat Route */}
      <ProtectedRoute path="/chat" component={ChatPage} />

      {/* Admin Route */}
      <ProtectedRoute path="/admin" component={AdminDashboard} />

      {/* Other Routes */}
      <ProtectedRoute path="/" component={MediaFeedPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <TutorialDialog />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;