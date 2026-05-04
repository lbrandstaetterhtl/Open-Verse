import { Link } from "wouter";
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
    <article className={cn(
      "group w-full bg-background",
      // Desktop: Card with subtle border and transition
      "md:border-b md:hover:bg-accent/5 transition-colors duration-150",
      // Mobile: Full-bleed with separator
      "border-b border-border/40",
      // Padding
      "px-4 py-3 md:py-4",
      "animate-fade-up"
    )}>
      <div className="flex gap-3">
        {/* Left: Avatar - 44px reachability on mobile */}
        <div className="flex-shrink-0">
          <Link href={`/users/${author.username}`}>
            <UserAvatar 
              user={author} 
              size="sm" 
              className="h-10 w-10 md:h-11 md:w-11 ring-offset-background transition-transform active:scale-95" 
            />
          </Link>
        </div>

        {/* Right: Content Area */}
        <div className="flex-1 min-w-0">
          {/* Header: Name, Handle, Time, Menu */}
          <div className="flex items-start justify-between mb-0.5">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <Link href={`/users/${author.username}`} className="font-bold text-sm md:text-base hover:underline truncate">
                {author.username}
              </Link>
              {author.verified && <BadgeCheck className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
              <span className="text-muted-foreground text-xs md:text-sm truncate">@{author.username}</span>
              <span className="text-muted-foreground text-xs md:text-sm flex-shrink-0">·</span>
              <span className="text-muted-foreground text-xs md:text-sm flex-shrink-0">
                {post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: de }) : ""}
              </span>
            </div>

            {/* Context Menu Button - 44px touch target */}
            <div className="flex-shrink-0 -mr-2 -mt-1">
               <PostMenu post={post} isOwner={isOwner} onDelete={() => deletePostMutation.mutate(post.id)} reportType={reportType} />
            </div>
          </div>

          {/* Title (for discussions/news) */}
          {post.title && post.title !== post.content && (
            <Link href={`/posts/${post.id}`}>
              <h3 className="font-bold text-sm md:text-base mb-1 hover:text-primary transition-colors line-clamp-2">
                {post.title}
              </h3>
            </Link>
          )}

          {/* Body Content */}
          <p className={cn(
            "text-sm md:text-base text-foreground/90 leading-relaxed break-words",
            compact && "line-clamp-5"
          )}>
            {post.content}
          </p>

          {/* Media - Full-bleed on mobile if requested, here responsive */}
          {post.mediaUrl && !imageLoadError && (
            <div className={cn(
              "mt-3 overflow-hidden border border-border/40 bg-muted/10 relative",
              "rounded-xl aspect-video lg:aspect-auto min-h-[160px] max-h-[500px]"
            )}>
              {post.mediaType === "image" ? (
                <img
                  src={`/uploads/${post.mediaUrl}`}
                  alt={post.title || "Post image"}
                  className="w-full h-full object-cover transition-transform duration-500 hover:scale-[1.01]"
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
            </div>
          )}

          {imageLoadError && (
            <div className="mt-3 p-6 rounded-xl bg-muted/10 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImageOff className="h-6 w-6 opacity-20" />
              <span className="text-[10px] uppercase tracking-widest">{t("media_feed.load_error")}</span>
            </div>
          )}

          {/* Actions: Metric Bar */}
          <div className="flex items-center justify-between mt-3 -ml-2 max-w-md">
            <ActionButton 
              icon={MessageCircle} 
              count={post.comments?.length} 
              label="Antworten"
              href={`/posts/${post.id}`} 
            />
            <ActionButton 
              icon={Heart} 
              count={post.reactions?.likes} 
              label="Like"
              active={post.userReaction?.isLike}
              activeColor="text-red-500 fill-red-500"
              onClick={handleLike}
              animate="like-pop"
            />
            <ActionButton 
              icon={Bookmark} 
              label="Speichern"
              onClick={() => {}} 
            />
            <ActionButton 
              icon={Share2} 
              label="Teilen"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: post.title, text: post.content, url: window.location.origin + `/posts/${post.id}` });
                }
              }} 
            />
          </div>
        </div>
      </div>
    </article>
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
  animate 
}: { 
  icon: any, 
  count?: number, 
  label: string, 
  active?: boolean, 
  activeColor?: string,
  onClick?: () => void,
  href?: string,
  animate?: string
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
      "hover:bg-accent/10 hover:text-foreground rounded-full p-2 group-active:scale-90",
      active && activeColor
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

