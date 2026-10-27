import type { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BadgeCheck, MapPin, Link as LinkIcon, Calendar, Trophy, UserPlus, UserMinus, Send, Settings, Share2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { MutualFollowers } from "./MutualFollowers";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EXTERNAL_LINK_REL, safeExternalUrl } from "@/lib/safe-url";

import { useDateLocale } from "@/lib/date-locale";
interface ProfileHeaderProps {
  user: User & { 
    stats?: { followers: number; following: number; posts: number };
    isFollowing?: boolean;
    isFollowingBack?: boolean;
    mutualFollowers?: User[];
  };
  isOwnProfile?: boolean;
  onEditProfile?: () => void;
  onFollow?: () => void;
  onUnfollow?: () => void;
  onMessage?: () => void;
  isFollowingLoading?: boolean;
}

export function ProfileHeader({
  user,
  isOwnProfile,
  onEditProfile,
  onFollow,
  onUnfollow,
  onMessage,
  isFollowingLoading
}: ProfileHeaderProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const websiteUrl = safeExternalUrl(user.website, { assumeHttps: true });
  const joinedDate = user.createdAt ? format(new Date(user.createdAt), "LLLL yyyy", { locale: dateLocale }) : "";

  return (
    <div className="w-full px-6 md:px-10 pb-8 relative">
      <div className="flex flex-col gap-8">

        {/* Top Action Row - aligned to the right of the avatar */}
        <div className="flex justify-end gap-3 -mt-12 md:-mt-16 relative z-30">
          {isOwnProfile ? (
            <Button onClick={onEditProfile}>
              <Settings className="h-4 w-4" />
              {t('profile.edit')}
            </Button>
          ) : (
            <>
              <Button
                 onClick={onMessage}
                 variant="outline"
                 size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>

              <Button
                 variant="outline"
                 size="icon"
                 onClick={() => {
                   if (navigator.share) {
                     navigator.share({ title: user.username, url: window.location.href });
                   }
                 }}
              >
                <Share2 className="h-4 w-4" />
              </Button>

              {user.isFollowing ? (
                <Button
                  variant="outline"
                  className="hover:bg-destructive/10 hover:text-destructive hover:shadow-[inset_0_0_0_1px_hsl(var(--destructive)/0.5)]"
                  onClick={onUnfollow}
                  disabled={isFollowingLoading}
                >
                  {t("profile.unfollow", "Unfollow")}
                </Button>
              ) : (
                <Button
                  onClick={onFollow}
                  disabled={isFollowingLoading}
                >
                  <UserPlus className="h-4 w-4" />
                  {t("profile.follow", "Follow")}
                </Button>
              )}
            </>
          )}
        </div>

        {/* User Identity Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4 flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-3xl md:text-[40px] font-semibold leading-none tracking-[-0.01em] text-foreground">
                {user.displayName || user.username}
              </h1>
              {user.verified && (
                <BadgeCheck className="h-6 w-6 shrink-0 text-star" />
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <p className="ov-data text-sm text-primary">
                @{user.username}
              </p>
              {user.isFollowingBack && (
                <span className="ov-chip">
                  {t("profile.follows_you", "Follows You")}
                </span>
              )}
            </div>

            {user.bio && (
              <p className="text-[15px] md:text-base text-foreground/80 leading-relaxed max-w-2xl">
                "{user.bio}"
              </p>
            )}

            {/* Metadata Chips */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {user.location && (
                <div className="ov-chip max-w-full">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                  <span className="truncate">{user.location}</span>
                </div>
              )}
              {user.website && (websiteUrl ? (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel={EXTERNAL_LINK_REL}
                  className="ov-chip ov-chip-primary transition-colors hover:bg-primary/15"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="truncate max-w-[150px]">{user.website.replace(/^https?:\/\/(www\.)?/i, '')}</span>
                </a>
              ) : (
                // Not an http(s) address: shown as text, never as a link
                <div className="ov-chip max-w-full">
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                  <span className="truncate max-w-[150px]">{user.website}</span>
                </div>
              ))}
              <div className="ov-chip">
                <Calendar className="h-3.5 w-3.5 text-primary/70" />
                <span>{t('profile.joined')} {joinedDate}</span>
              </div>
            </div>
          </div>

          {/* Stats readout: numbers in the data font, small mono captions */}
          <div className="flex self-start md:self-end pt-4">
            <div className="ov-panel flex divide-x divide-border">
               <div className="flex flex-col items-center gap-1.5 px-5 py-3 min-w-[100px]">
                  <span className="ov-data text-2xl font-semibold leading-none text-foreground">{user.stats?.following || 0}</span>
                  <span className="ov-label">{t("profile.following")}</span>
               </div>
               <div className="flex flex-col items-center gap-1.5 px-5 py-3 min-w-[100px]">
                  <span className="ov-data text-2xl font-semibold leading-none text-primary">{user.stats?.followers || 0}</span>
                  <span className="ov-label">{t("profile.followers")}</span>
               </div>
            </div>
          </div>
        </div>

        {/* Mutual Connection Badge */}
        {user.mutualFollowers && user.mutualFollowers.length > 0 && (
          <div className="pt-2 border-t border-border">
            <MutualFollowers followers={user.mutualFollowers} />
          </div>
        )}
      </div>
    </div>
  );
}
