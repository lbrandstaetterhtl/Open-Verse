import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { format } from "date-fns";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { MessageCircle, LayoutGrid, Heart, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { PostCard } from "@/components/post/post-card";

import { useDateLocale } from "@/lib/date-locale";
interface ProfileTabContentProps {
  type: "posts" | "comments" | "liked" | "saved";
  data: any[];
  isLoading: boolean;
}

export function ProfileTabContent({ type, data, isLoading }: ProfileTabContentProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();

  if (isLoading) {
    return (
      <div className="space-y-4 pt-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="ov-panel h-48 w-full animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    const Icon = type === "posts" ? LayoutGrid : type === "comments" ? MessageCircle : Heart;
    return (
      <div className="pt-12">
        <EmptyState 
          title={t(`profile.empty.${type}.title`)} 
          description={t(`profile.empty.${type}.description`)}
          icon={<Icon className="h-10 w-10 text-muted-foreground" />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-8 pb-20">
      {data.map((item, index) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, scale: 0.98, translateY: 10 }}
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          transition={{ 
            delay: index * 0.05, 
            duration: 0.5,
            ease: [0.22, 1, 0.36, 1]
          }}
        >
          {type === "posts" || type === "liked" || type === "saved" ? (
            <PostCard post={item} />
          ) : (
            <Card className="group overflow-hidden">
              <CardContent className="p-5 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div className="ov-chip ov-data">
                    <Calendar className="h-3 w-3" />
                    {item.createdAt ? format(new Date(item.createdAt), "PPp", { locale: dateLocale }) : ""}
                  </div>
                  {item.post && (
                    <Link href={`/post/${item.post.id}`} className="ov-chip ov-chip-primary min-w-0 max-w-full transition-colors hover:bg-primary/15">
                      <span className="shrink-0 text-muted-foreground">{t("profile.on_post", "On")}</span>
                      <span className="truncate">{item.post.title}</span>
                    </Link>
                  )}
                </div>
                <div className="pl-4 border-l border-primary/40 group-hover:border-primary transition-colors">
                  <p className="text-[15px] text-foreground/90 leading-relaxed">
                    {item.content}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      ))}
    </div>
  );
}
