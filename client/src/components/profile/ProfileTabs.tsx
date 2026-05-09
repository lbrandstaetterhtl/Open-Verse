
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
    <div className="w-full border-b border-border/20 bg-background/40 backdrop-blur-xl sticky top-14 z-10 transition-all overflow-hidden">
      {/* Subtle top glow */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-2 md:gap-8 h-16">
          <AnimatePresence mode="popLayout">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    "relative flex items-center gap-2.5 px-4 h-10 rounded-full text-xs font-black uppercase tracking-widest transition-all active:scale-95",
                    isActive ? "text-primary" : "text-muted-foreground/60 hover:text-foreground hover:bg-white/5"
                  )}
                >
                  <Icon className={cn("h-4 w-4 transition-transform duration-300", isActive && "scale-110")} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  
                  {isActive && (
                    <motion.div
                      layoutId="activeTabProfile"
                      className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-full z-[-1] nebula-glow"
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
