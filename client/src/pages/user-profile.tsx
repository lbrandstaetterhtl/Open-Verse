import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/navbar";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, UserPlus, UserMinus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function UserProfilePage() {
  const { username } = useParams();
  const { toast } = useToast();

  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/users", username],
    queryFn: async () => {
      const res = await fetch(`/api/users/${username}`);
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json();
    },
  });

  const followMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/follow/${userId}`);
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", username] });
      toast({
        title: "Success",
        description: "User followed successfully",
      });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("DELETE", `/api/follow/${userId}`);
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", username] });
      toast({
        title: "Success",
        description: "User unfollowed successfully",
      });
    },
  });

  if (isLoading) {
    return (
      <>
        <Navbar />
        <main className="container mx-auto px-4 pt-24">
          <div className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </main>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Navbar />
        <main className="container mx-auto px-4 pt-24">
          <div className="text-center">
            <h1 className="text-2xl font-bold">User not found</h1>
            <p className="text-muted-foreground">This user doesn't exist or has been deleted.</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 pt-24">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
            <UserAvatar user={user} size="lg" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-4xl font-bold">{user.username}</h1>
                <Badge variant={
                  user.role === 'owner' ? "destructive" :
                    user.role === 'admin' ? "default" :
                      "secondary"
                }>
                  {user.role}
                </Badge>
              </div>
              <div className="flex gap-4 mt-2 text-muted-foreground">
                <span>{user.followers?.length || 0} followers</span>
                <span>{user.following?.length || 0} following</span>
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-6">
            {user.isFollowing ? (
              <Button
                variant="outline"
                onClick={() => unfollowMutation.mutate(user.id)}
                disabled={unfollowMutation.isPending}
              >
                <UserMinus className="h-4 w-4 mr-2" />
                Unfollow
              </Button>
            ) : (
              <Button
                onClick={() => followMutation.mutate(user.id)}
                disabled={followMutation.isPending}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Follow
              </Button>
            )}

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {user.recentPosts?.map((post) => (
                    <div key={post.id} className="p-4 rounded-lg bg-muted/50">
                      <h3 className="font-semibold">{post.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{post.content}</p>
                    </div>
                  ))}
                  {!user.recentPosts?.length && (
                    <p className="text-muted-foreground text-center">No recent activity</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
