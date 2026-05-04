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
}

/**
 * POST-CARD [UI-D-001]: Responsive Post Card
 * Optimized for high information density (Twitter-style) and mobile touch interaction.
 */
export const PostCard = React.memo(function PostCard({
  post,
  reportType = "post",
  compact = false,
}: PostCardProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [imageLoadError, setImageLoadError] = useState(false);

  const {
    reactionMutation,
    deletePostMutation,
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

  return (
    <motion.article 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group w-full bg-card/40 backdrop-blur-sm transition-all duration-300",
        // Desktop: Floating Card Style
        "md:mb-4 md:rounded-3xl md:border md:border-border/40 md:hover:border-primary/20 md:hover:shadow-xl md:hover:shadow-primary/5",
        // Mobile: Flat Stream Style
        "border-b border-border/40",
        // Padding
        "px-4 py-5 md:p-6",
        "relative overflow-hidden"
      )}
    >
      {/* Premium Background Light Reflection (Desktop Only) */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />

      <div className="flex gap-4">
        {/* Left: Avatar Section */}
        <div className="flex-shrink-0">
          <Link href={`/users/${author.username}`}>
            <div className="relative group/avatar">
              <UserAvatar 
                user={author} 
                className="h-12 w-12 rounded-2xl ring-2 ring-background transition-all group-hover/avatar:ring-primary/20 group-hover/avatar:scale-105" 
              />
              {author.role === 'owner' && (
                <div className="absolute -top-1 -right-1 bg-yellow-500 rounded-full p-0.5 shadow-lg">
                  <BadgeCheck className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
          </Link>
        </div>

        {/* Right: Content Area */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <Link href={`/users/${author.username}`} className="font-black text-[15px] md:text-base hover:text-primary transition-colors truncate">
                  {author.username || "User"}
                </Link>
                {author.verified && <BadgeCheck className="h-4 w-4 text-primary" />}
                <span className="hidden sm:inline-block text-[11px] font-bold text-primary/60 bg-primary/5 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                  {author.role}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground/60 text-[11px] md:text-xs">
                <span className="truncate">@{author.username || "user"}</span>
                <span>·</span>
                <span>
                  {(() => {
                    try {
                      return post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: de }) : "";
                    } catch (e) {
                      return "";
                    }
                  })()}
                </span>
              </div>
            </div>

            {/* Menu */}
            <div className="flex-shrink-0 -mr-2">
               <PostMenu post={post} isOwner={isOwner} onDelete={() => deletePostMutation.mutate(post.id)} reportType={reportType} />
            </div>
          </div>

          {/* Title (Redesigned) */}
          {post.title && post.title !== post.content && (
            <Link href={`/posts/${post.id}`}>
              <h3 className="font-black text-lg md:text-xl mb-2 tracking-tight hover:text-primary transition-colors line-clamp-2 leading-tight">
                {post.title}
              </h3>
            </Link>
          )}

          {/* Body Content (Premium Typography) */}
          <p className={cn(
            "text-[15px] md:text-[17px] text-foreground/80 leading-relaxed break-words font-medium tracking-tight",
            compact && "line-clamp-6"
          )}>
            {post.content}
          </p>

          {/* Media Section (Immersive) */}
          {post.mediaUrl && !imageLoadError && (
            <motion.div 
              layoutId={`media-${post.id}`}
              className={cn(
                "mt-4 overflow-hidden bg-muted/20 relative group/media",
                "rounded-[2rem] border border-border/40 shadow-inner",
                "aspect-[16/10] md:aspect-auto min-h-[200px] max-h-[600px]"
              )}
            >
              {post.mediaType === "image" ? (
                <img
                  src={`/uploads/${post.mediaUrl}`}
                  alt={post.title || "Post image"}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover/media:scale-105"
                  onError={() => setImageLoadError(true)}
                  loading="lazy"
                />
              ) : post.mediaType === "video" ? (
                <video
                  src={`/uploads/${post.mediaUrl}`}
                  controls
                  className="w-full h-full"
                  onError={() => setImageLoadError(true)}
                />
              ) : null}
              
              {/* Media Overlay Gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover/media:opacity-100 transition-opacity duration-500" />
            </motion.div>
          )}

          {imageLoadError && (
            <div className="mt-4 p-8 rounded-[2rem] bg-muted/5 border border-dashed border-border/60 flex flex-col items-center justify-center gap-3 text-muted-foreground/40">
              <ImageOff className="h-8 w-8" />
              <span className="text-[10px] uppercase font-black tracking-[0.2em]">{t("media_feed.load_error")}</span>
            </div>
          )}

          {/* Action Bar (Refined) */}
          <div className="flex items-center justify-between mt-5 -ml-3 max-w-sm">
            <ActionButton 
              icon={MessageCircle} 
              count={post.comments?.length} 
              label="Antworten"
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
            <ActionButton 
              icon={Bookmark} 
              label="Speichern"
              onClick={() => {}} 
              className="hover:text-yellow-500 hover:bg-yellow-500/10"
            />
            <ActionButton 
              icon={Share2} 
              label="Teilen"
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

