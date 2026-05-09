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
      <div className="flex flex-col gap-5">
        {/* Actions Row */}
        <div className="flex items-center justify-end relative z-10">
          <div className="flex items-center gap-2 pt-12">
            {isOwnProfile ? (
              <Button onClick={onEditProfile} variant="outline" className="rounded-full font-bold px-6 h-10 text-sm glass-card hover:bg-primary/10 hover:border-primary/30 active:scale-95 transition-all shadow-xl">
                Profil bearbeiten
              </Button>
            ) : (
              <>
                <Button 
                   onClick={onMessage} 
                   variant="outline" 
                   className="rounded-full h-10 w-10 p-0 glass-card border-border/40 hover:bg-muted active:scale-90 transition-all"
                >
                  <MessageCircle className="h-5 w-5" />
                </Button>
                
                {user.isFollowing ? (
                  <Button 
                    variant="outline" 
                    className="rounded-full px-6 h-10 font-bold text-sm glass-card border-border/40 hover:bg-destructive/10 hover:text-destructive hover:border-destructive transition-all active:scale-95"
                    onClick={onUnfollow}
                    disabled={isFollowingLoading}
                  >
                    Gefolgt
                  </Button>
                ) : (
                  <Button 
                    className="rounded-full px-6 h-10 font-bold text-sm active:scale-95 transition-all shadow-lg shadow-primary/20 nebula-glow"
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

        {/* Info Block - Wrapped in glass-card if needed, but here we'll keep it clean with cosmic accents */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/60">
              {user.displayName || user.username}
            </h1>
            {user.verified && <BadgeCheck className="h-6 w-6 text-primary fill-primary/5" />}
          </div>
          <p className="text-sm font-medium text-primary/80 tracking-tight">@{user.username}</p>
        </div>

        {user.bio && (
          <p className="text-sm md:text-base text-foreground/80 leading-relaxed max-w-xl font-medium">
            {user.bio}
          </p>
        )}

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold text-muted-foreground/80 uppercase tracking-widest">
          {user.location && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 opacity-50" />
              <span>{user.location}</span>
            </div>
          )}
          {user.website && (
            <a 
              href={user.website.startsWith('http') ? user.website : `https://${user.website}`} 
              target="_blank" 
              className="flex items-center gap-1.5 text-primary hover:text-primary/70 transition-colors"
            >
              <LinkIcon className="h-4 w-4 opacity-70" />
              <span className="truncate max-w-[150px]">{user.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
            </a>
          )}
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 opacity-50" />
            <span>Seit {joinedDate}</span>
          </div>
        </div>

        {/* Stats - Weightless Float applied to buttons */}
        <div className="flex items-center gap-8 pt-2 border-b border-border/20 pb-6">
          <motion.button 
            whileHover={{ y: -2 }}
            className="flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <span className="font-black text-lg tracking-tight">{user.stats?.following || 0}</span>
            <span className="text-muted-foreground text-[10px] uppercase tracking-widest font-bold">{t("profile.following", "Gefolgt")}</span>
          </motion.button>
          <motion.button 
            whileHover={{ y: -2 }}
            className="flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <span className="font-black text-lg tracking-tight">{user.stats?.followers || 0}</span>
            <span className="text-muted-foreground text-[10px] uppercase tracking-widest font-bold">{t("profile.followers", "Follower")}</span>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
