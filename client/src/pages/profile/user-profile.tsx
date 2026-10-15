import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ProfileCover } from "@/components/profile/ProfileCover";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { ProfileTabContent } from "@/components/profile/ProfileTabContent";
import { ProfilePageSkeleton } from "@/components/profile/ProfilePageSkeleton";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";

export default function UserProfilePage() {
  const { username } = useParams();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("posts");
  const [, setLocation] = useLocation();

  // Fetch enriched public profile data
  const { data: profile, isLoading: isProfileLoading, error: profileError } = useQuery<any>({
    queryKey: [`/api/users/${username}`],
    enabled: !!username,
  });

  const { data: tabData = [], isLoading: isTabLoading } = useQuery<any[]>({
    queryKey: [`/api/users/${username}/${activeTab}`],
    enabled: !!username,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/follow/${profile.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${username}`] });
      toast({ title: t('profile.follow_success') });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/follow/${profile.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${username}`] });
      toast({ title: t('profile.unfollow_success') });
    },
  });

  const handleFollow = () => {
    if (!currentUser) return setLocation("/auth");
    followMutation.mutate();
  };

  const handleUnfollow = () => {
    unfollowMutation.mutate();
  };

  if (isProfileLoading) return <ProfilePageSkeleton />;
  if (profileError || !profile) return <div>User not found</div>;

  const isOwnProfile = currentUser?.username === profile.username;

  return (
    <div className="min-h-screen relative">
      <main className="relative z-10 max-w-7xl mx-auto min-h-screen">
        <ProfileCover 
          username={profile.username}
          avatarUrl={profile.avatarUrl}
          coverUrl={profile.coverUrl}
        />
        
        <ProfileHeader 
          user={profile}
          isOwnProfile={isOwnProfile}
          onFollow={handleFollow}
          onUnfollow={handleUnfollow}
          isFollowingLoading={followMutation.isPending || unfollowMutation.isPending}
          onMessage={() => setLocation(`/chat/${profile.id}`)}
        />

        <div className="px-6 md:px-10">
          <ProfileTabs 
            activeTab={activeTab} 
            onTabChange={setActiveTab} 
            counts={{
              posts: profile.stats?.posts || 0,
              comments: profile.stats?.comments || 0,
              liked: profile.stats?.liked || 0
            }}
          />
          
          <div className="py-8">
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
          </div>
        </div>
      </main>
    </div>
  );
}
