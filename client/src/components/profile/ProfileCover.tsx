import { useState } from "react";
import { Camera, Edit3, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";
import { motion, AnimatePresence } from "framer-motion";

interface ProfileCoverProps {
  coverUrl?: string | null;
  avatarUrl?: string | null;
  username: string;
  isOwnProfile?: boolean;
  onEditCover?: () => void;
  onEditAvatar?: () => void;
}

export function ProfileCover({
  coverUrl,
  avatarUrl,
  username,
  isOwnProfile,
  onEditCover,
  onEditAvatar,
}: ProfileCoverProps) {
  const [isHoveringAvatar, setIsHoveringAvatar] = useState(false);

  return (
    <div className="relative w-full group/cover">
      {/* Immersive Cover Image Container */}
      <div className={cn(
        "relative h-48 md:h-72 lg:h-96 w-full overflow-hidden transition-all duration-700",
        !coverUrl && "nebula-banner"
      )}>
        {coverUrl ? (
          <motion.img
            initial={{ scale: 1.1, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            src={coverUrl}
            alt="Profile cover"
            className="h-full w-full object-cover transition-transform duration-[2s] group-hover/cover:scale-110"
          />
        ) : (
          <div className="starfield opacity-40" />
        )}

        {/* Cinematic Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-50" />

        <AnimatePresence>
          {isOwnProfile && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={onEditCover}
              className="absolute top-6 right-6 flex items-center gap-2 rounded-full bg-black/40 px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-white backdrop-blur-2xl transition-all hover:bg-primary/40 active:scale-95 border border-white/10 shadow-2xl z-20"
            >
              <Camera className="h-4 w-4" />
              <span className="hidden sm:inline">Change Essence</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Avatar Integration - Twitter Style but Premium */}
      <div className="px-6 md:px-10 relative h-16 md:h-20">
        <div className="absolute -top-16 md:-top-24 left-6 md:left-10">
           <div 
             className="relative group/avatar"
             onMouseEnter={() => setIsHoveringAvatar(true)}
             onMouseLeave={() => setIsHoveringAvatar(false)}
           >
             {/* Dynamic Glow Effect */}
             <div className="absolute -inset-1 bg-gradient-to-tr from-primary via-accent to-primary rounded-full blur-xl opacity-40 group-hover/avatar:opacity-80 transition-opacity duration-700 animate-pulse" />
             
             <div className="relative rounded-full border-[6px] border-background bg-background shadow-2xl overflow-hidden nebula-glow">
                <UserAvatar 
                  user={{ username, avatarUrl }} 
                  className="h-28 w-28 md:h-44 md:w-44 rounded-full object-cover ring-2 ring-transparent transition-transform duration-700 group-hover/avatar:scale-110" 
                />
             </div>

             {isOwnProfile && (
               <motion.button
                 animate={{ opacity: isHoveringAvatar ? 1 : 0 }}
                 onClick={onEditAvatar}
                 className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-[2px] transition-all z-10"
               >
                 <Edit3 className="h-8 w-8 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
               </motion.button>
             )}
             
             {/* Verified / Status Sparkle for premium users */}
             <div className="absolute -bottom-1 -right-1 h-8 w-8 bg-background rounded-full border-4 border-background flex items-center justify-center shadow-lg">
                <div className="h-full w-full bg-primary/10 rounded-full flex items-center justify-center">
                    <Sparkles className="h-3 w-3 text-primary animate-spin-slow" />
                </div>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
