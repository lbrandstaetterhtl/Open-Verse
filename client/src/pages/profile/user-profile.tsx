import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ProfileCover } from "@/components/profile/ProfileCover";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { ProfileTabContent } from "@/components/profile/ProfileTabContent";
import { ProfilePageSkeleton } from "@/components/profile/ProfilePageSkeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User, Post } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { PageTransition } from "@/components/ui/page-transition";

export default function UserProfilePage() {
  const { username } = useParams();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("posts");

  // Fetch enriched public profile data
  const { 
    data: profile, 
    isLoading: profileLoading, 
    error: profileError 
  } = useQuery<any>({
    queryKey: [`/api/users/${username}`],
    enabled: !!username,
  });

  // Fetch tab content
  const { 
    data: tabData = [], 
    isLoading: isTabLoading 
  } = useQuery<any[]>({
    queryKey: [`/api/users/${username}/${activeTab}`],
    enabled: !!username && !!profile,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/follow/${profile.id}`);
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${username}`] });
      toast({
        title: t('profile.follow_success'),
        description: t('profile.is_now_following', { username }),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/follow/${profile.id}`);
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${username}`] });
      toast({
        title: t('profile.unfollow_success'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (profileLoading) {
    return <ProfilePageSkeleton />;
  }

  if (profileError || !profile) {
    return (
      <div className="min-h-screen bg-background pt-24">
        <main className="container mx-auto px-4">
          <Alert variant="destructive" className="rounded-2xl shadow-lg border-none bg-destructive/10">
            <AlertDescription className="text-destructive font-medium">
              {profileError instanceof Error ? profileError.message : "User not found"}
            </AlertDescription>
          </Alert>
        </main>
      </div>
    );
  }

  const handleFollow = () => {
    if (!currentUser) {
      toast({ title: t('auth.login_required'), variant: "destructive" });
      return;
    }
    followMutation.mutate();
  };

  const handleUnfollow = () => {
    unfollowMutation.mutate();
  };

  const isOwnProfile = currentUser?.username === profile.username;

  return (
    <PageTransition>
    <div className="w-full min-h-screen pb-20">
      <ProfileCover 
        coverUrl={profile.coverUrl}
        avatarUrl={profile.avatarUrl}
        username={profile.username}
        isOwnProfile={isOwnProfile}
      />

      <div className="max-w-4xl mx-auto">
        <ProfileHeader 
          user={profile}
          isOwnProfile={isOwnProfile}
          onFollow={handleFollow}
          onUnfollow={handleUnfollow}
          isFollowingLoading={followMutation.isPending || unfollowMutation.isPending}
          onMessage={() => toast({ title: "Messaging coming soon!" })}
        />

        <ProfileTabs 
          activeTab={activeTab} 
          onTabChange={setActiveTab} 
          isOwnProfile={isOwnProfile}
        />

        <main className="px-4 md:px-6 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <ProfileTabContent 
                type={activeTab as any} 
                data={tabData} 
                isLoading={isTabLoading} 
              />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
    </PageTransition>
  );
}
