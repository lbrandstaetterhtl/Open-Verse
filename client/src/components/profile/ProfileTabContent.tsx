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
            <Card className="glass-card hover:bg-card/60 transition-all rounded-3xl border-border/40 overflow-hidden relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <CardContent className="pt-8 relative z-10">
                <div className="flex items-center justify-between mb-6 text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-background/40 rounded-full border border-border/20">
                    <Calendar className="h-3 w-3 opacity-50" />
                    {item.createdAt ? format(new Date(item.createdAt), "PPp") : ""}
                  </div>
                  {item.post && (
                    <Link href={`/post/${item.post.id}`} className="text-primary hover:text-primary/80 transition-all hover:translate-x-1 inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 rounded-full border border-primary/10">
                      <span className="opacity-50">{t('profile.on_post')}</span>
                      <span>{item.post.title}</span>
                    </Link>
                  )}
                </div>
                <div className="pl-4 border-l-2 border-primary/20 group-hover:border-primary/40 transition-colors">
                  <p className="text-base text-foreground/80 leading-relaxed font-medium">
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
