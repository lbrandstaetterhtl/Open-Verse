import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import { useWebSocket } from "@/hooks/use-websocket";

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
  // Initialize WebSocket connection inside AuthProvider to ensure user context is available
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WebSocketProvider />
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

// Separate component to handle WebSocket initialization
function WebSocketProvider() {
  useWebSocket(); // This will only initialize when user is authenticated
  return null;
}

export default App;