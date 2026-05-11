import { Link } from "wouter";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import React, { useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useFeedMutations } from "@/hooks/use-feed-mutations";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ReportDialog } from "@/components/dialogs/report-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  MessageCircle,
  Trash2,
  Heart,
  BadgeCheck,
  ImageOff,
  ImageIcon,
  Play,
  MoreHorizontal,
  Share2,
  Bookmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PostWithAuthor } from "@shared/types";
import { Button } from "@/components/ui/button";

interface PostCardProps {
  post: PostWithAuthor;
  reportType?: "post" | "discussion";
  compact?: boolean;
  variant?: "default" | "media";
}

/**
 * POST-CARD [UI-D-001]: Responsive Post Card
 * Optimized for high information density and premium visual appeal.
 */
export const PostCard = React.memo(function PostCard({
  post,
  reportType = "post",
  compact = false,
  variant = "default",
}: PostCardProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [imageLoadError, setImageLoadError] = useState(false);

  const {
    reactionMutation,
    deletePostMutation,
    prefetchPost,
  } = useFeedMutations();

  const author = post.author ?? {
    username: "Unknown",
    id: 0,
    role: "member",
    verified: false,
  };

  const isOwner = user?.id === author.id || user?.role === "owner" || (user?.role === "admin" && author.role !== "owner");

  const handleLike = useCallback(() => {
    reactionMutation.mutate({ postId: post.id, isLike: !post.userReaction?.isLike });
  }, [post.id, post.userReaction?.isLike, reactionMutation]);

  const isMediaVariant = variant === "media";

  return (
    <motion.article 
      initial="initial"
      animate="animate"
      whileHover="whileHover"
      whileTap="whileTap"
      variants={{
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
        whileHover: { y: -4, transition: { duration: 0.3 } },
        whileTap: { scale: 0.98, transition: { duration: 0.1 } }
      }}
      onMouseEnter={() => prefetchPost(post.id)}
      className={cn(
        "group w-full glass-card transition-all duration-500",
        isMediaVariant 
          ? "rounded-[2.5rem] p-6" 
          : "md:mb-6 md:rounded-[2rem] border-b md:border border-border/40 p-5 md:p-8",
        "relative overflow-hidden"
      )}
    >
      {/* Premium Background Light Reflection */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

      <div className={cn("flex gap-4", isMediaVariant ? "flex-col" : "flex-row")}>
        {/* AVATAR SECTION (Conditional for Default Variant) */}
        {!isMediaVariant && (
          <div className="flex-shrink-0">
            <Link href={`/users/${author.username}`}>
              <div className="relative group/avatar">
                <UserAvatar 
                  user={author} 
                  className="h-14 w-14 rounded-2xl ring-4 ring-background shadow-xl transition-all group-hover/avatar:ring-primary/40 group-hover/avatar:scale-105" 
                />
                <div className="absolute inset-0 rounded-2xl bg-primary/10 opacity-0 group-hover/avatar:opacity-100 transition-opacity pointer-events-none" />
                {author.role === 'owner' && (
                  <div className="absolute -top-1 -right-1 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-full p-1 shadow-lg ring-2 ring-background nebula-glow">
                    <BadgeCheck className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
              </div>
            </Link>
          </div>
        )}

        {/* CONTENT AREA */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* HEADER (Avatar inside for Media variant) */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3 min-w-0">
              {isMediaVariant && (
                <Link href={`/users/${author.username}`}>
                  <UserAvatar user={author} className="h-10 w-10 rounded-xl" />
                </Link>
              )}
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <Link href={`/users/${author.username}`} className="font-black text-[14px] md:text-[15px] hover:text-primary transition-colors truncate tracking-tight">
                    {author.username || "User"}
                  </Link>
                  {author.verified && <BadgeCheck className="h-3.5 w-3.5 text-primary" />}
                </div>
                <div className="text-muted-foreground/60 text-[11px] font-medium flex items-center gap-1">
                  <span>@{author.username || "user"}</span>
                  <span>·</span>
                  <span className="truncate">
                    {(() => {
                      try {
                        return post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: de }) : "";
                      } catch (e) { return ""; }
                    })()}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex-shrink-0">
               <PostMenu post={post} isOwner={isOwner} onDelete={() => deletePostMutation.mutate(post.id)} reportType={reportType} />
            </div>
          </div>

          {/* TITLE & TEXT */}
          <div className="space-y-2 mb-4">
            {post.title && post.title !== post.content && (
              <Link href={`/posts/${post.id}`}>
                <h3 className={cn(
                  "font-black tracking-tighter hover:text-primary transition-colors line-clamp-2 leading-tight",
                  isMediaVariant ? "text-xl" : "text-lg md:text-xl"
                )}>
                  {post.title}
                </h3>
              </Link>
            )}

            <p className={cn(
              "text-[15px] md:text-[16px] text-foreground/80 leading-relaxed break-words font-medium tracking-tight",
              (compact || isMediaVariant) && "line-clamp-3"
            )}>
              {post.content}
            </p>
          </div>

          {/* MEDIA (Immersive) */}
          {post.mediaUrl && !imageLoadError && (
            <motion.div 
              className={cn(
                "overflow-hidden bg-muted/20 relative group/media mb-4",
                "rounded-[2.5rem] border border-white/5 shadow-2xl",
                isMediaVariant ? "aspect-square" : "aspect-[16/10] md:aspect-auto min-h-[250px] max-h-[700px]",
                isMediaVariant ? "order-first mb-8" : ""
              )}
            >
              {post.mediaType === "image" ? (
                <img
                  src={`/uploads/${post.mediaUrl}`}
                  alt={post.title || "Post image"}
                  className="w-full h-full object-cover transition-transform duration-1000 group-hover/media:scale-110"
                  onError={() => setImageLoadError(true)}
                  loading="lazy"
                  decoding="async"
                />
              ) : post.mediaType === "video" ? (
                <video
                  src={`/uploads/${post.mediaUrl}`}
                  controls
                  className="w-full h-full object-cover"
                  onError={() => setImageLoadError(true)}
                />
              ) : null}
              
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/media:opacity-100 transition-opacity duration-500" />
              <div className="absolute top-4 right-4 p-2 rounded-xl bg-black/20 backdrop-blur-md border border-white/20 opacity-0 group-hover/media:opacity-100 transition-all duration-500 translate-y-2 group-hover/media:translate-y-0">
                {post.mediaType === "video" ? <Play className="h-4 w-4 text-white fill-white" /> : <ImageIcon className="h-4 w-4 text-white" />}
              </div>
            </motion.div>
          )}

          {imageLoadError && (
            <div className="mb-4 p-8 rounded-[2rem] bg-muted/5 border border-dashed border-border/60 flex flex-col items-center justify-center gap-3 text-muted-foreground/40">
              <ImageOff className="h-8 w-8" />
              <span className="text-[10px] uppercase font-black tracking-[0.2em]">{t("media_feed.load_error")}</span>
            </div>
          )}

          {/* ACTION BAR */}
          <div className={cn(
            "flex items-center justify-between pt-4 -ml-2",
            isMediaVariant ? "border-t border-white/5" : "border-t border-transparent"
          )}>
            <div className="flex items-center gap-1">
              <ActionButton 
                icon={MessageCircle} 
                count={post.comments?.length} 
                label="Reply"
                href={`/posts/${post.id}`} 
                className="hover:text-primary hover:bg-primary/10"
              />
              <ActionButton 
                icon={Heart} 
                count={post.reactions?.likes} 
                label="Like"
                active={post.userReaction?.isLike}
                activeColor="text-red-500 fill-red-500 bg-red-500/5"
                onClick={handleLike}
                animate="like-pop"
                className="hover:text-red-500 hover:bg-red-500/10"
              />
            </div>
            <div className="flex items-center gap-1">
              <ActionButton 
                icon={Bookmark} 
                label="Save"
                onClick={() => {}} 
                className="hover:text-yellow-500 hover:bg-yellow-500/10"
              />
              <ActionButton 
                icon={Share2} 
                label="Share"
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({ title: post.title, text: post.content, url: window.location.origin + `/posts/${post.id}` });
                  }
                }} 
                className="hover:text-blue-500 hover:bg-blue-500/10"
              />
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
});

/** Action Button with 44px Touch Target */
function ActionButton({ 
  icon: Icon, 
  count, 
  label, 
  active, 
  activeColor, 
  onClick, 
  href,
  animate,
  className
}: { 
  icon: any, 
  count?: number, 
  label: string, 
  active?: boolean, 
  activeColor?: string,
  onClick?: () => void,
  href?: string,
  animate?: string,
  className?: string
}) {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 350);
      onClick();
    }
  };

  const Content = (
    <div className={cn(
      "flex items-center gap-2 text-muted-foreground transition-all duration-150",
      "rounded-full p-2 group-active:scale-90",
      active && activeColor,
      className
    )}>
      <Icon className={cn(
        "h-[18px] w-[18px] md:h-5 md:w-5",
        active && "fill-current",
        isAnimating && animate && `animate-${animate}`
      )} />
      {count !== undefined && count > 0 && (
        <span className="text-xs md:text-sm tabular-nums font-medium">{count}</span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="group min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label={label}>
        {Content}
      </Link>
    );
  }

  return (
    <button 
      onClick={handleClick} 
      className="group min-h-[44px] min-w-[44px] flex items-center justify-center outline-none" 
      aria-label={label}
    >
      {Content}
    </button>
  );
}

function PostMenu({ post, isOwner, onDelete, reportType }: { post: any, isOwner: boolean, onDelete: () => void, reportType: string }) {
  const { t } = useTranslation();
  
  return (
    <div className="flex items-center">
      {isOwner && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="animate-scale-in">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("actions.delete")}</AlertDialogTitle>
              <AlertDialogDescription>{t("actions.delete_post_confirm")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {t("actions.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <ReportDialog type={reportType as any} id={post.id} />
    </div>
  );
}

