import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Medal } from "lucide-react";

export default function UserProfilePage() {
  const { username } = useParams();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["/api/users", username],
    queryFn: async () => {
      const res = await fetch(`/api/users/${username}`);
      if (!res.ok) throw new Error("Failed to fetch user profile");
      return res.json();
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

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 pt-24">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <UserAvatar user={profile} size="lg" />
            <div>
              <h1 className="text-4xl font-bold">{profile.username}</h1>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>Member since {new Date(profile.createdAt).toLocaleDateString()}</span>
                <span>•</span>
                <div className="flex items-center text-blue-500">
                  <Medal className="h-4 w-4 mr-1 fill-current" />
                  <span>{profile.karma} reputation</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">User's recent posts and comments will appear here.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}