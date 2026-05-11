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
  MessageSquare,
  Settings,
  Share2,
  ExternalLink
} from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { MutualFollowers } from "./MutualFollowers";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

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
    <div className="w-full px-6 md:px-10 pb-8 relative">
      <div className="flex flex-col gap-8">
        
        {/* Top Action Row - Fixed to top right relative to header */}
        <div className="flex justify-end gap-3 -mt-12 md:-mt-16 relative z-30">
          {isOwnProfile ? (
            <Button 
              onClick={onEditProfile} 
              className="rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] h-12 px-8 shadow-2xl shadow-primary/20 nebula-glow"
            >
              <Settings className="h-4 w-4 mr-2" />
              Edit Domain
            </Button>
          ) : (
            <>
              <Button 
                 onClick={onMessage} 
                 variant="outline" 
                 className="rounded-2xl h-12 w-12 p-0 glass-premium border-white/10 hover:bg-white/5 active:scale-90 transition-all shadow-2xl"
              >
                <MessageSquare className="h-5 w-5" />
              </Button>
              
              <Button 
                 variant="outline" 
                 className="rounded-2xl h-12 w-12 p-0 glass-premium border-white/10 hover:bg-white/5 active:scale-90 transition-all shadow-2xl"
                 onClick={() => {
                   if (navigator.share) {
                     navigator.share({ title: user.username, url: window.location.href });
                   }
                 }}
              >
                <Share2 className="h-5 w-5" />
              </Button>

              {user.isFollowing ? (
                <Button 
                  variant="outline" 
                  className="rounded-2xl px-8 h-12 font-black uppercase tracking-[0.2em] text-[10px] glass-premium border-white/10 hover:bg-destructive/10 hover:text-destructive hover:border-destructive transition-all active:scale-95 shadow-2xl"
                  onClick={onUnfollow}
                  disabled={isFollowingLoading}
                >
                  Disconnect
                </Button>
              ) : (
                <Button 
                  className="rounded-2xl px-8 h-12 font-black uppercase tracking-[0.2em] text-[10px] active:scale-95 transition-all shadow-2xl shadow-primary/30 nebula-glow"
                  onClick={onFollow}
                  disabled={isFollowingLoading}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Synchronize
                </Button>
              )}
            </>
          )}
        </div>

        {/* User Identity Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl md:text-5xl font-black tracking-tighter leading-none bg-clip-text text-transparent bg-gradient-to-br from-foreground via-foreground to-foreground/40 drop-shadow-sm">
                {user.displayName || user.username}
              </h1>
              {user.verified && (
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                  <BadgeCheck className="h-5 w-5 text-primary" />
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              <p className="text-sm font-black uppercase tracking-[0.3em] text-primary drop-shadow-[0_0_10px_rgba(var(--primary),0.3)]">
                @{user.username}
              </p>
              {user.isFollowingBack && (
                <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                  Follows You
                </span>
              )}
            </div>

            {user.bio && (
              <p className="text-sm md:text-lg text-foreground/70 leading-relaxed max-w-2xl font-medium italic">
                "{user.bio}"
              </p>
            )}

            {/* Metadata Chips */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {user.location && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                  <MapPin className="h-3.5 w-3.5 text-primary/60" />
                  <span>{user.location}</span>
                </div>
              )}
              {user.website && (
                <a 
                  href={user.website.startsWith('http') ? user.website : `https://${user.website}`} 
                  target="_blank" 
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/5 border border-primary/10 text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10 transition-all"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="truncate max-w-[150px]">{user.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                </a>
              )}
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                <Calendar className="h-3.5 w-3.5 text-primary/60" />
                <span>Stationed Since {joinedDate}</span>
              </div>
            </div>
          </div>

          {/* Stats Cards - Premium Look */}
          <div className="flex gap-4 self-start md:self-end pt-4">
             <div className="flex flex-col items-center p-4 min-w-[100px] rounded-3xl glass-premium border-white/5">
                <span className="text-2xl font-black tracking-tighter">{user.stats?.following || 0}</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Following</span>
             </div>
             <div className="flex flex-col items-center p-4 min-w-[100px] rounded-3xl glass-premium border-primary/20 shadow-xl shadow-primary/10">
                <span className="text-2xl font-black tracking-tighter text-primary">{user.stats?.followers || 0}</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-primary/60">Followers</span>
             </div>
          </div>
        </div>

        {/* Mutual Connection Badge */}
        {user.mutualFollowers && user.mutualFollowers.length > 0 && (
          <div className="pt-2 border-t border-white/5">
            <MutualFollowers users={user.mutualFollowers} />
          </div>
        )}
      </div>
    </div>
  );
}
  );
}
