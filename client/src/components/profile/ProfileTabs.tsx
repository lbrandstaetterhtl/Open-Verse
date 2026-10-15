import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
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
    <div className="ov-rule bg-background/90 sticky top-0 z-40">
      <div className="flex px-2 md:px-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "relative flex items-center gap-2 px-4 md:px-5 py-3.5 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "ov-tab-active font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-primary/5"
              )}
            >
              <Icon className={cn("h-4 w-4", activeTab === tab.id && "text-primary")} />
              <span className="hidden sm:inline">{tab.label}</span>

              {tab.count !== undefined && (
                <span className={cn(
                  "ov-data rounded-pill px-1.5 text-[11px] leading-5",
                  activeTab === tab.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
