import { useState, useEffect, useRef } from "react";
import { useQuery, useInfiniteQuery, useMutation } from "@tanstack/react-query";
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
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Fetch enriched public profile data
  const { data: profile, isLoading: isProfileLoading, error: profileError } = useQuery<any>({
    queryKey: [`/api/users/${username}`],
    enabled: !!username,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/users/${profile.id}/follow`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${username}`] });
      toast({ title: t('profile.follow_success') });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/users/${profile.id}/unfollow`);
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
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-[50vh] bg-gradient-to-b from-primary/10 via-transparent to-transparent opacity-30" />
        <div className="absolute top-[20%] right-[10%] w-[30vw] h-[30vw] bg-accent/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[20%] left-[5%] w-[25vw] h-[25vw] bg-primary/10 rounded-full blur-[100px]" />
      </div>

      <main className="relative z-10 max-w-7xl mx-auto border-x border-white/5 bg-background/50 backdrop-blur-3xl shadow-2xl min-h-screen">
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
                  activeTab={activeTab}
                  userId={profile.id}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
