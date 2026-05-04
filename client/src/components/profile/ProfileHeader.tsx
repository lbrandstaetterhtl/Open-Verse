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
    <div className="w-full px-4 pt-4 md:pt-6">
      <div className="flex flex-col gap-4">
        {/* Actions Row */}
        <div className="flex items-center justify-end relative z-10">
          <div className="flex items-center gap-2 pt-12">
            {isOwnProfile ? (
              <Button onClick={onEditProfile} variant="outline" className="rounded-full font-bold px-4 h-9 text-sm active:scale-95 transition-all">
                Profil bearbeiten
              </Button>
            ) : (
              <>
                <Button 
                  onClick={onMessage} 
                  variant="outline" 
                  className="rounded-full h-9 w-9 p-0 border-border/60 hover:bg-muted active:scale-90 transition-all"
                >
                  <MessageCircle className="h-4 w-4" />
                </Button>
                
                {user.isFollowing ? (
                  <Button 
                    variant="outline" 
                    className="rounded-full px-4 h-9 font-bold text-sm border-border/60 hover:bg-destructive/10 hover:text-destructive hover:border-destructive transition-all active:scale-95"
                    onClick={onUnfollow}
                    disabled={isFollowingLoading}
                  >
                    Gefolgt
                  </Button>
                ) : (
                  <Button 
                    className="rounded-full px-4 h-9 font-bold text-sm active:scale-95 transition-all shadow-md"
                    onClick={onFollow}
                    disabled={isFollowingLoading}
                  >
                    Folgen
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Info Block */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h1 className="text-xl md:text-2xl font-black tracking-tight">
              {user.displayName || user.username}
            </h1>
            {user.verified && <BadgeCheck className="h-5 w-5 text-primary fill-primary/5" />}
          </div>
          <p className="text-sm text-muted-foreground">@{user.username}</p>
        </div>

        {user.bio && (
          <p className="text-sm md:text-base text-foreground/90 leading-relaxed max-w-xl">
            {user.bio}
          </p>
        )}

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground font-medium">
          {user.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              <span>{user.location}</span>
            </div>
          )}
          {user.website && (
            <a 
              href={user.website.startsWith('http') ? user.website : `https://${user.website}`} 
              target="_blank" 
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <LinkIcon className="h-3.5 w-3.5" />
              <span className="truncate max-w-[150px]">{user.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
            </a>
          )}
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            <span>Seit {joinedDate}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-5 pt-1 border-b border-border/40 pb-4">
          <button className="flex items-center gap-1 hover:underline active:scale-95 transition-transform">
            <span className="font-bold text-sm">{user.stats?.following || 0}</span>
            <span className="text-muted-foreground text-sm">Gefolgt</span>
          </button>
          <button className="flex items-center gap-1 hover:underline active:scale-95 transition-transform">
            <span className="font-bold text-sm">{user.stats?.followers || 0}</span>
            <span className="text-muted-foreground text-sm">Follower</span>
          </button>
        </div>
      </div>
    </div>
  );
}
