
import { MessageSquare, Heart, Bookmark, LayoutGrid } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";

interface ProfileTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isOwnProfile?: boolean;
}

export function ProfileTabs({ activeTab, onTabChange, isOwnProfile }: ProfileTabsProps) {
  const { t } = useTranslation();

  const tabs = [
    { id: "posts", label: t('profile.tabs.posts'), icon: LayoutGrid },
    { id: "comments", label: t('profile.tabs.comments'), icon: MessageSquare },
    { id: "liked", label: t('profile.tabs.liked'), icon: Heart },
    ...(isOwnProfile ? [{ id: "saved", label: t('profile.tabs.saved'), icon: Bookmark }] : []),
  ];

  return (
    <div className="w-full border-b border-muted/50 bg-background/50 backdrop-blur-sm sticky top-16 z-10 transition-all">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-8 h-14">
          <AnimatePresence mode="popLayout">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`relative flex items-center gap-2 h-full text-sm font-medium transition-colors hover:text-primary ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                  
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
