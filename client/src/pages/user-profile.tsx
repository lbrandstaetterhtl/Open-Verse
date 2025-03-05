import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Trophy, UserPlus, UserMinus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function UserProfilePage() {
  const { username } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery({
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
  });

  const { data: followers, isLoading: followersLoading } = useQuery({
    queryKey: ["/api/followers", username],
    queryFn: async () => {
      const res = await fetch(`/api/followers/${username}`);
      if (!res.ok) throw new Error("Failed to fetch followers");
      return res.json();
    },
    enabled: !!username,
  });

  const { data: following, isLoading: followingLoading } = useQuery({
    queryKey: ["/api/following", username],
    queryFn: async () => {
      const res = await fetch(`/api/following/${username}`);
      if (!res.ok) throw new Error("Failed to fetch following");
      return res.json();
    },
    enabled: !!username,
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
              <h1 className="text-4xl font-bold">{profile.username}</h1>
              <div className="flex gap-4 mt-2">
                <span className="text-muted-foreground">{followers?.length || 0} followers</span>
                <span className="text-muted-foreground">{following?.length || 0} following</span>
                <div className="flex items-center text-emerald-500">
                  <Trophy className="h-4 w-4 mr-1" />
                  <span>{profile.karma} reputation</span>
                </div>
              </div>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Followers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {followers?.map((follower) => (
                  <div key={follower.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Link href={`/users/${follower.username}`}>
                        <UserAvatar user={follower} size="sm" />
                      </Link>
                      <Link href={`/users/${follower.username}`}>
                        <span className="hover:underline">{follower.username}</span>
                      </Link>
                    </div>
                    {user && user.id !== follower.id && (
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
                      <Link href={`/users/${followed.username}`}>
                        <UserAvatar user={followed} size="sm" />
                      </Link>
                      <Link href={`/users/${followed.username}`}>
                        <span className="hover:underline">{followed.username}</span>
                      </Link>
                    </div>
                    {user && user.id !== followed.id && (
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
        </div>
      </main>
    </>
  );
}