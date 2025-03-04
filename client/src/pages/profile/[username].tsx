import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useParams } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Loader2, UserPlus, UserMinus } from "lucide-react";
import { format } from "date-fns";

export default function UserProfilePage() {
  const { username } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["/api/users", username],
    queryFn: async () => {
      const res = await fetch(`/api/users/${username}`);
      if (!res.ok) throw new Error("Failed to fetch user profile");
      return res.json();
    },
  });

  const { data: posts } = useQuery({
    queryKey: ["/api/users", username, "posts"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${username}/posts`);
      if (!res.ok) throw new Error("Failed to fetch user posts");
      return res.json();
    },
  });

  const followMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/follow/${userId}`);
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", username] });
      queryClient.invalidateQueries({ queryKey: ["/api/following"] });
      toast({
        title: "Success",
        description: "User followed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("DELETE", `/api/follow/${userId}`);
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", username] });
      queryClient.invalidateQueries({ queryKey: ["/api/following"] });
      toast({
        title: "Success",
        description: "User unfollowed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <>
        <Navbar />
        <main className="container mx-auto px-4 pt-24">
          <div className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <Navbar />
        <main className="container mx-auto px-4 pt-24">
          <h1 className="text-2xl text-center">User not found</h1>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 pt-24">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="flex items-center gap-4">
            <UserAvatar user={profile} size="lg" />
            <div>
              <div className="flex items-center gap-4">
                <h1 className="text-4xl font-bold">{profile.username}</h1>
                {user?.id !== profile.id && (
                  <Button
                    variant={profile.isFollowing ? "default" : "outline"}
                    onClick={() => {
                      if (profile.isFollowing) {
                        unfollowMutation.mutate(profile.id);
                      } else {
                        followMutation.mutate(profile.id);
                      }
                    }}
                    disabled={followMutation.isPending || unfollowMutation.isPending}
                  >
                    {profile.isFollowing ? (
                      <>
                        <UserMinus className="h-4 w-4 mr-2" />
                        Following
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Follow
                      </>
                    )}
                  </Button>
                )}
              </div>
              <div className="flex gap-4 mt-2 text-muted-foreground">
                <span>{profile.followers} followers</span>
                <span>{profile.following} following</span>
              </div>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Posts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {posts?.map((post) => (
                  <div key={post.id} className="p-4 border rounded-lg">
                    <h3 className="font-semibold">{post.title}</h3>
                    <p className="mt-2">{post.content}</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      {format(new Date(post.createdAt), "PPp")}
                    </p>
                    {post.mediaUrl && (
                      <div className="mt-4 rounded-lg overflow-hidden">
                        {post.mediaType === "image" ? (
                          <img
                            src={post.mediaUrl}
                            alt="Post media"
                            className="w-full h-auto max-h-96 object-cover"
                          />
                        ) : post.mediaType === "video" ? (
                          <video src={post.mediaUrl} controls className="w-full max-h-96" />
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
                {!posts?.length && (
                  <p className="text-muted-foreground text-center">No posts yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}