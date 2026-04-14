import type { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BadgeCheck, 
  MapPin, 
  Link as LinkIcon, 
  Calendar, 
  Trophy,
  UserPlus,
  UserMinus,
  MessageCircle,
  Settings
} from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { MutualFollowers } from "./MutualFollowers";
import { motion } from "framer-motion";

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
  const joinedDate = user.createdAt ? format(new Date(user.createdAt), "MMMM yyyy") : "";

  return (
    <div className="container mx-auto px-4 pt-20 md:pt-24 pb-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        {/* User Info Section */}
        <div className="space-y-4 max-w-2xl">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                {user.displayName || user.username}
              </h1>
              {user.verified && (
                <BadgeCheck className="h-6 w-6 text-primary fill-primary/10" title="Verified" />
              )}
              {user.karma >= 1000 && (
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                  <Trophy className="h-3 w-3 mr-1" />
                  {t('profile.pro')}
                </Badge>
              )}
            </div>
            <p className="text-lg text-muted-foreground">@{user.username}</p>
          </div>

          {user.bio && (
            <p className="text-base text-foreground/90 leading-relaxed whitespace-pre-wrap max-w-lg">
              {user.bio}
            </p>
          )}

          {/* Metadata Grid */}
          <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-sm text-muted-foreground">
            {user.location && (
              <div className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {user.location}
              </div>
            )}
            {user.website && (
              <a 
                href={user.website.startsWith('http') ? user.website : `https://${user.website}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline transition-all"
              >
                <LinkIcon className="h-4 w-4" />
                {user.website.replace(/^https?:\/\/(www\.)?/, '')}
              </a>
            )}
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {t('profile.joined')} {joinedDate}
            </div>
          </div>

          {/* Mutual Followers Preview */}
          {!isOwnProfile && user.mutualFollowers && user.mutualFollowers.length > 0 && (
            <MutualFollowers followers={user.mutualFollowers} />
          )}
        </div>

        {/* Action Buttons & Stats Section */}
        <div className="flex flex-col gap-6 md:items-end">
          {/* Actions */}
          <div className="flex items-center gap-3">
            {isOwnProfile ? (
              <Button onClick={onEditProfile} variant="default" className="rounded-full px-6 shadow-lg shadow-primary/20">
                <Settings className="h-4 w-4 mr-2" />
                {t('profile.edit')}
              </Button>
            ) : (
              <>
                <Button 
                  onClick={onMessage} 
                  variant="outline" 
                  className="rounded-full h-11 w-11 p-0 flex items-center justify-center border-muted-foreground/20 hover:bg-muted"
                >
                  <MessageCircle className="h-5 w-5" />
                </Button>
                
                {user.isFollowing ? (
                  <Button 
                    variant="outline" 
                    className="rounded-full px-8 h-11 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
                    onClick={onUnfollow}
                    disabled={isFollowingLoading}
                  >
                    {isFollowingLoading ? t('common.loading') : t('profile.following')}
                  </Button>
                ) : (
                  <Button 
                    className="rounded-full px-8 h-11 shadow-lg shadow-primary/25"
                    onClick={onFollow}
                    disabled={isFollowingLoading}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    {user.isFollowingBack ? t('profile.followBack') : t('profile.follow')}
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Stats Summary */}
          <div className="flex items-center gap-8 md:gap-10 border-t md:border-t-0 md:border-l border-muted/30 pt-4 md:pt-0 md:pl-10">
            <div className="text-center md:text-left transition-transform hover:scale-105">
              <p className="text-xl font-bold">{user.stats?.posts || 0}</p>
              <p className="text-sm text-muted-foreground uppercase tracking-wider">{t('profile.posts')}</p>
            </div>
            <div className="text-center md:text-left transition-transform hover:scale-105 cursor-pointer">
              <p className="text-xl font-bold">{user.stats?.followers || 0}</p>
              <p className="text-sm text-muted-foreground uppercase tracking-wider">{t('profile.followers')}</p>
            </div>
            <div className="text-center md:text-left transition-transform hover:scale-105 cursor-pointer">
              <p className="text-xl font-bold">{user.stats?.following || 0}</p>
              <p className="text-sm text-muted-foreground uppercase tracking-wider">{t('profile.following')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
