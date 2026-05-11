import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ProfileCover } from "@/components/profile/ProfileCover";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { ProfileTabContent } from "@/components/profile/ProfileTabContent";
import { ProfilePageSkeleton } from "@/components/profile/ProfilePageSkeleton";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import type { UpdateProfile} from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

export default function MyProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("posts");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Fetch enriched profile data (stats, etc.)
  const { data: profileData, isLoading: isProfileLoading } = useQuery<any>({
    queryKey: [`/api/users/${user?.username}`],
    enabled: !!user?.username,
  });

  // Fetch tab content
  const { data: tabData = [], isLoading: isTabLoading } = useQuery<any[]>({
    queryKey: [`/api/users/${user?.username}/${activeTab}`],
    enabled: !!user?.username && activeTab !== "settings",
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: UpdateProfile) => {
      const res = await apiRequest("PATCH", "/api/profile", data);
      return res.json();
    },
    onSuccess: (updatedUser) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user?.username}`] });
      setIsEditModalOpen(false);
      toast({
        title: t('profile.update_success_title'),
        description: t('profile.update_success_desc'),
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

  if (isProfileLoading || !user) {
    return <ProfilePageSkeleton />;
  }

  const enrichedUser = {
    ...user,
    ...profileData,
  };

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
          username={enrichedUser.username}
          avatarUrl={enrichedUser.avatarUrl}
          coverUrl={enrichedUser.coverUrl}
          isOwnProfile={true}
          onEditCover={() => setIsEditModalOpen(true)}
          onEditAvatar={() => setIsEditModalOpen(true)}
        />
        
        <ProfileHeader 
          user={enrichedUser}
          isOwnProfile={true}
          onEditProfile={() => setIsEditModalOpen(true)}
        />

        <div className="px-6 md:px-10">
          <ProfileTabs 
            activeTab={activeTab} 
            onTabChange={setActiveTab} 
            counts={{
              posts: enrichedUser.stats?.posts || 0,
              comments: enrichedUser.stats?.comments || 0,
              liked: enrichedUser.stats?.liked || 0
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

      <EditProfileModal 
        user={user}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSubmit={(data) => {
          updateProfileMutation.mutate(data);
          setIsEditModalOpen(false);
        }}
        isSubmitting={updateProfileMutation.isPending}
      />
    </div>
  );
}
