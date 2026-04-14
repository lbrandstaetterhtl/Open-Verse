import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { format } from "date-fns";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { MessageSquare, LayoutGrid, Heart, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { PostCard } from "@/components/post/post-card";

interface ProfileTabContentProps {
  type: "posts" | "comments" | "liked" | "saved";
  data: any[];
  isLoading: boolean;
}

export function ProfileTabContent({ type, data, isLoading }: ProfileTabContentProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="space-y-4 pt-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-48 w-full bg-muted animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    const Icon = type === "posts" ? LayoutGrid : type === "comments" ? MessageSquare : Heart;
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
    <div className="space-y-6 pt-6 pb-20">
      {data.map((item, index) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05, duration: 0.3 }}
        >
          {type === "posts" || type === "liked" ? (
            <PostCard post={item} />
          ) : (
            <Card className="hover:bg-muted/30 transition-all rounded-2xl border-muted/50 bg-card/50 backdrop-blur-sm overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/50 rounded-lg">
                    <Calendar className="h-3 w-3" />
                    {item.createdAt ? format(new Date(item.createdAt), "PPp") : ""}
                  </div>
                  {item.post && (
                    <Link href={`/posts/${item.post.id}`} className="text-primary hover:underline font-bold transition-all hover:translate-x-1 inline-flex items-center gap-1">
                      {t('profile.on_post')}: {item.post.title}
                    </Link>
                  )}
                </div>
                <p className="text-base text-foreground/90 leading-relaxed pl-2 border-l-2 border-primary/20">
                  {item.content}
                </p>
              </CardContent>
            </Card>
          )}
        </motion.div>
      ))}
    </div>
  );
}
