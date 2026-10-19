import { Link } from "wouter";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import React, { useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useFeedMutations } from "@/hooks/use-feed-mutations";
import { useToast } from "@/hooks/use-toast";
import { sharePost } from "@/lib/share-post";
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
import { AuthorLink, authorName, isDeletedAuthor } from "@/components/post/author-link";
import type { PostWithAuthor } from "@shared/types";
import { Button } from "@/components/ui/button";

import { useDateLocale } from "@/lib/date-locale";
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
  const dateLocale = useDateLocale();
  const { user } = useAuth();
  const [imageLoadError, setImageLoadError] = useState(false);

  const { toast } = useToast();
  const {
    reactionMutation,
    saveMutation,
    deletePostMutation,
    prefetchPost,
  } = useFeedMutations();
  const isSaved = !!(post as any).isSaved;
  const commentCount = (post as any).commentCount ?? post.comments?.length;

  const authorDeleted = isDeletedAuthor(post.author as any);
  const author: any = authorDeleted
    ? { id: null, username: "?", role: "user", verified: false, deleted: true }
    : post.author;

  const isOwner = user?.id === author.id || user?.role === "owner" || (user?.role === "admin" && author.role !== "owner");

  const handleLike = useCallback(() => {
    // Liking again removes the like (the server toggles); isLike:false would record a dislike.
    reactionMutation.mutate({ postId: post.id, isLike: true });
  }, [post.id, post.userReaction?.isLike, reactionMutation]);

  const isMediaVariant = variant === "media";

  return (
    <motion.article 
      initial="initial"
      animate="animate"
      whileTap="whileTap"
      variants={{
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
        whileTap: { scale: 0.98, transition: { duration: 0.1 } }
      }}
      onMouseEnter={() => prefetchPost(post.id)}
      className={cn(
        "ov-panel ov-panel-hover group w-full overflow-hidden",
        isMediaVariant ? "p-5 md:p-6" : "md:mb-6 p-5 md:p-6"
      )}
    >
      <div className={cn("flex gap-4", isMediaVariant ? "flex-col" : "flex-row")}>
        {/* AVATAR SECTION (Conditional for Default Variant) */}
        {!isMediaVariant && (
          <div className="flex-shrink-0">
            <AuthorLink author={author}>
              <div className="relative group/avatar">
                <UserAvatar 
                  user={author} 
                  className="h-12 w-12" 
                />
                <div className="ov-avatar absolute inset-0 bg-primary/10 opacity-0 group-hover/avatar:opacity-100 transition-opacity pointer-events-none" />
                {author.role === 'owner' && (
                  <div className="absolute -top-1 -right-1 rounded-sm border border-star/40 bg-card p-0.5 text-star">
                    <BadgeCheck className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
            </AuthorLink>
          </div>
        )}

        {/* CONTENT AREA */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* HEADER (Avatar inside for Media variant) */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3 min-w-0">
              {isMediaVariant && (
                <AuthorLink author={author}>
                  <UserAvatar user={author} className="h-10 w-10" />
                </AuthorLink>
              )}
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <AuthorLink author={author} className="font-semibold text-[14px] md:text-[15px] hover:text-primary transition-colors truncate">
                    {authorName(author, t)}
                  </AuthorLink>
                  {author.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-star" />}
                </div>
                <div className="font-data text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                  {!authorDeleted && (
                    <>
                      <span>@{author.username}</span>
                      <span>·</span>
                    </>
                  )}
                  <span className="truncate">
                    {(() => {
                      try {
                        return post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: dateLocale }) : "";
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
                  "font-display font-semibold hover:text-primary transition-colors line-clamp-2 leading-snug",
                  isMediaVariant ? "text-xl" : "text-lg md:text-xl"
                )}>
                  {post.title}
                </h3>
              </Link>
            )}

            <p className={cn(
              "text-[15px] md:text-[16px] text-foreground/80 leading-relaxed break-words",
              (compact || isMediaVariant) && "line-clamp-3"
            )}>
              {post.content}
            </p>
          </div>

          {/* MEDIA (Immersive) */}
          {post.mediaUrl && !imageLoadError && (
            <motion.div 
              className={cn(
                "ov-cut-2 overflow-hidden rounded-xl bg-muted/30 relative group/media mb-4",
                isMediaVariant ? "aspect-square" : "aspect-[16/10] md:aspect-auto min-h-[250px] max-h-[700px]",
                isMediaVariant ? "order-first mb-5" : ""
              )}
            >
              {post.mediaType === "image" ? (
                <img
                  src={`/uploads/${post.mediaUrl}`}
                  alt={post.title || t("post.image_alt", "Post image")}
                  className="w-full h-full object-cover"
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
              
              <div className="absolute top-3 right-3 rounded-sm bg-background/80 p-1.5 text-foreground opacity-0 group-hover/media:opacity-100 transition-opacity duration-300">
                {post.mediaType === "video" ? <Play className="h-4 w-4 fill-current" /> : <ImageIcon className="h-4 w-4" />}
              </div>
            </motion.div>
          )}

          {imageLoadError && (
            <div className="ov-cut-2 mb-4 p-8 rounded-xl bg-muted/30 flex flex-col items-center justify-center gap-3 text-muted-foreground/60">
              <ImageOff className="h-8 w-8" />
              <span className="ov-label">{t("media_feed.load_error")}</span>
            </div>
          )}

          {/* ACTION BAR */}
          <div className={cn(
            "flex items-center justify-between pt-4 -ml-2",
            isMediaVariant ? "border-t border-border" : "border-t border-transparent"
          )}>
            <div className="flex items-center gap-1">
              <ActionButton 
                icon={MessageCircle} 
                count={commentCount} 
                label={t("post_actions.comment", "Comment")}
                href={`/posts/${post.id}`} 
                className="hover:text-primary hover:bg-primary/10"
              />
              <ActionButton 
                icon={Heart} 
                count={post.reactions?.likes} 
                label={t("post_actions.like", "Like")}
                active={!!post.userReaction?.isLike}
                activeColor="text-destructive bg-destructive/10"
                onClick={handleLike}
                animate="like-pop"
                className="hover:text-destructive hover:bg-destructive/10"
              />
            </div>
            <div className="flex items-center gap-1">
              <ActionButton 
                icon={Bookmark} 
                label={t("post_actions.save", "Save")}
                active={isSaved}
                activeColor="text-star bg-star/10"
                onClick={() => saveMutation.mutate({ postId: post.id, saved: !isSaved })} 
                className="hover:text-star hover:bg-star/10"
              />
              <ActionButton 
                icon={Share2} 
                label={t("post_actions.share", "Share")}
                onClick={() => sharePost(post, toast, {
                  copied: t("post_actions.link_copied", "Link copied"),
                  copyFailed: t("post_actions.copy_failed", "Copy this link"),
                })} 
                className="hover:text-primary hover:bg-primary/10"
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
      "ov-cut flex items-center gap-1.5 rounded-sm p-2 text-muted-foreground transition-colors duration-150",
      "group-active:scale-95",
      active && activeColor,
      className
    )}>
      <Icon className={cn(
        "h-[18px] w-[18px] md:h-5 md:w-5",
        active && "fill-current",
        isAnimating && animate && `animate-${animate}`
      )} />
      {count !== undefined && count > 0 && (
        <span className="ov-data text-xs md:text-sm">{count}</span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="group min-h-[44px] min-w-[44px] flex items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={label}>
        {Content}
      </Link>
    );
  }

  return (
    <button 
      type="button"
      onClick={handleClick} 
      className="group min-h-[44px] min-w-[44px] flex items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" 
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
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
            <Button variant="ghost" size="icon" aria-label={t("post_actions.delete_post", "Delete post")} className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
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

