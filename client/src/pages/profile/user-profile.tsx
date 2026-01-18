import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Trophy, UserPlus, UserMinus, BadgeCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { MessageSquare, Calendar } from "lucide-react";
import { Post, User } from "@shared/schema";

export default function UserProfilePage() {
  const { username } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery<User>({
    queryKey: ["/api/users", username],
    queryFn: async () => {
      const res = await fetch(`/api/users/${username}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("User not found");
        }
        const errorText = await res.text();
        throw new Error(errorText || "Failed to fetch user profile");
      }
      return res.json();
    },
    enabled: !!username,
    refetchInterval: 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const { data: followers, isLoading: followersLoading } = useQuery<User[]>({
    queryKey: ["/api/followers", username],
    queryFn: async () => {
      const res = await fetch(`/api/followers/${username}`);
      if (!res.ok) throw new Error("Failed to fetch followers");
      return res.json();
    },
    enabled: !!username,
    refetchInterval: 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const { data: following, isLoading: followingLoading } = useQuery<User[]>({
    queryKey: ["/api/following", username],
    queryFn: async () => {
      const res = await fetch(`/api/following/${username}`);
      if (!res.ok) throw new Error("Failed to fetch following");
      return res.json();
    },
    enabled: !!username,
    refetchInterval: 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const { data: posts, isLoading: postsLoading } = useQuery<Post[]>({
    queryKey: ["/api/users", username, "posts"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${username}/posts`);
      if (!res.ok) throw new Error("Failed to fetch user posts");
      return res.json();
    },
    enabled: !!username,
    refetchInterval: 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const { data: comments, isLoading: commentsLoading } = useQuery({
    queryKey: ["/api/users", username, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${username}/comments`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: !!username,
    refetchInterval: 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const followMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/follow/${userId}`);
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/following", username] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/following", username] });
      toast({
        title: "Success",
        description: "User unfollowed successfully",
      });
    },
  });

  if (profileLoading || followersLoading || followingLoading) {
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

  if (profileError || !profile) {
    return (
      <>
        <Navbar />
        <main className="container mx-auto px-4 pt-24">
          <Alert variant="destructive">
            <AlertDescription>
              {profileError?.message || "Failed to load user profile"}
            </AlertDescription>
          </Alert>
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
              <div className="flex items-center gap-2">
                <h1 className="text-4xl font-bold">
                  {profile.karma < 0 ? "Banned User" : profile.username}
                </h1>
                {profile.verified && profile.karma >= 0 && (
                  <Badge variant="default" className="bg-blue-500">
                    <BadgeCheck className="h-4 w-4 mr-1" />
                    Verified
                  </Badge>
                )}
                {profile.karma < 0 && (
                  <Badge variant="destructive">Banned</Badge>
                )}
              </div>
              <div className="flex gap-4 mt-2">
                <span className="text-muted-foreground">{followers?.length || 0} followers</span>
                <span className="text-muted-foreground">{following?.length || 0} following</span>
                <div className="flex items-center text-emerald-500">
                  <Trophy className="h-4 w-4 mr-1" />
                  <span>{profile.karma} reputation</span>
                </div>
              </div>
              {profile.bio && profile.karma >= 0 && (
                <p className="mt-4 text-muted-foreground whitespace-pre-wrap">{profile.bio}</p>
              )}
            </div>
          </div>

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="posts">Posts</TabsTrigger>
              <TabsTrigger value="comments">Comments</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Followers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {followers?.map((follower) => (
                      <div key={follower.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {follower.karma < 0 ? (
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                              <UserMinus className="h-4 w-4 text-muted-foreground" />
                            </div>
                          ) : (
                            <Link href={`/users/${follower.username}`}>
                              <UserAvatar user={follower} size="sm" />
                            </Link>
                          )}
                          {follower.karma < 0 ? (
                            <span className="text-muted-foreground italic">Banned User</span>
                          ) : (
                            <Link href={`/users/${follower.username}`}>
                              <span className="hover:underline">{follower.username}</span>
                            </Link>
                          )}
                        </div>
                        {user && user.id !== follower.id && follower.karma >= 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => followMutation.mutate(follower.id)}
                          >
                            <UserPlus className="h-4 w-4 mr-2" />
                            Follow Back
                          </Button>
                        )}
                      </div>
                    ))}
                    {!followers?.length && (
                      <p className="text-muted-foreground text-center">No followers yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Following</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {following?.map((followed) => (
                      <div key={followed.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {followed.karma < 0 ? (
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                              <UserMinus className="h-4 w-4 text-muted-foreground" />
                            </div>
                          ) : (
                            <Link href={`/users/${followed.username}`}>
                              <UserAvatar user={followed} size="sm" />
                            </Link>
                          )}
                          {followed.karma < 0 ? (
                            <span className="text-muted-foreground italic">Banned User</span>
                          ) : (
                            <Link href={`/users/${followed.username}`}>
                              <span className="hover:underline">{followed.username}</span>
                            </Link>
                          )}
                        </div>
                        {user && user.id !== followed.id && followed.karma >= 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => unfollowMutation.mutate(followed.id)}
                          >
                            <UserMinus className="h-4 w-4 mr-2" />
                            Unfollow
                          </Button>
                        )}
                      </div>
                    ))}
                    {!following?.length && (
                      <p className="text-muted-foreground text-center">Not following anyone yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="posts">
              <div className="space-y-4">
                {postsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : posts?.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      No posts yet
                    </CardContent>
                  </Card>
                ) : (
                  posts?.map((post) => (
                    <Card key={post.id} className="hover:bg-muted/50 transition-colors">
                      <CardHeader>
                        <CardTitle className="text-lg">
                          <Link href={`/posts/${post.id}?from=profile&username=${username}`} className="hover:underline">
                            {post.title}
                          </Link>
                        </CardTitle>
                        <div className="flex items-center text-sm text-muted-foreground gap-4">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(post.createdAt), "PPP")}
                          </span>
                          <span className="capitalize">{post.category}</span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="line-clamp-3 text-sm text-muted-foreground">
                          {post.content}
                        </p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="comments">
              <div className="space-y-4">
                {commentsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : comments?.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      No comments yet
                    </CardContent>
                  </Card>
                ) : (
                  comments?.map((comment: any) => (
                    <Card key={comment.id} className="hover:bg-muted/50 transition-colors">
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(comment.createdAt), "PPp")}
                          </p>
                          {comment.post && (
                            <Link href={`/posts/${comment.post.id}`} className="text-xs text-primary hover:underline">
                              on: {comment.post.title}
                            </Link>
                          )}
                        </div>
                        <p className="text-base">{comment.content}</p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </>
  );
}