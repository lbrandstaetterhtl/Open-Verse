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
import { User } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { PageTransition } from "@/components/ui/page-transition";

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
    <PageTransition>
    <div className="w-full min-h-screen pb-20">
      <ProfileCover 
        coverUrl={enrichedUser.coverUrl}
        avatarUrl={enrichedUser.avatarUrl}
        username={enrichedUser.username}
        isOwnProfile={true}
        onEditCover={() => setIsEditModalOpen(true)}
        onEditAvatar={() => setIsEditModalOpen(true)}
      />

      <div className="max-w-4xl mx-auto">
        <ProfileHeader 
          user={enrichedUser}
          isOwnProfile={true}
          onEditProfile={() => setIsEditModalOpen(true)}
        />

        <ProfileTabs 
          activeTab={activeTab} 
          onTabChange={setActiveTab} 
          isOwnProfile={true}
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

      <EditProfileModal 
        user={user}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSubmit={(data) => updateProfileMutation.mutate(data)}
        isSubmitting={updateProfileMutation.isPending}
      />
    </div>
    </PageTransition>
  );
}
