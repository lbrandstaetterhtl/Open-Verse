import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { LayoutGrid, MessageSquare, Heart } from "lucide-react";

interface ProfileTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  counts?: { posts: number; comments: number; liked: number };
}

export function ProfileTabs({ activeTab, onTabChange, counts }: ProfileTabsProps) {
  const { t } = useTranslation();

  const tabs = [
    { id: "posts", label: t("profile.tabs.posts", "Posts"), icon: LayoutGrid, count: counts?.posts },
    { id: "comments", label: t("profile.tabs.comments", "Comments"), icon: MessageSquare, count: counts?.comments },
    { id: "liked", label: t("profile.tabs.liked", "Likes"), icon: Heart, count: counts?.liked },
  ];

  return (
    <div className="border-b border-white/5 bg-background/20 backdrop-blur-md sticky top-0 z-40">
      <div className="flex px-2 md:px-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "relative flex items-center gap-2 px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] transition-all",
                activeTab === tab.id
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <Icon className={cn("h-4 w-4 transition-transform", activeTab === tab.id && "scale-110")} />
              <span className="hidden sm:inline">{tab.label}</span>
              
              {tab.count !== undefined && (
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[9px] font-black tracking-tight",
                  activeTab === tab.id ? "bg-primary/10 text-primary" : "bg-white/5 text-muted-foreground"
                )}>
                  {tab.count}
                </span>
              )}
              
              {activeTab === tab.id && (
                <motion.div
                  layoutId="profileTabActive"
                  className="absolute bottom-0 left-0 right-0 h-1 bg-primary shadow-[0_0_15px_rgba(var(--primary),0.8)]"
                  initial={false}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
