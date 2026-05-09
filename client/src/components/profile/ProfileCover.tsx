import { useState } from "react";
import { Camera, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";
import { motion } from "framer-motion";

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
    <div className="relative w-full">
      {/* Cover Image Container */}
      <div className={cn(
        "relative h-32 md:h-48 lg:h-64 w-full overflow-hidden",
        !coverUrl && "nebula-banner"
      )}>
        {coverUrl ? (
          <img
            src={coverUrl}
            alt="Profile cover"
            className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
          />
        ) : (
          <div className="starfield opacity-20" />
        )}

        {isOwnProfile && (
          <button
            onClick={onEditCover}
            className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-black/40 px-4 py-2 text-xs font-bold text-white backdrop-blur-xl transition-all hover:bg-black/60 active:scale-95 border border-white/10 shadow-lg"
          >
            <Camera className="h-4 w-4" />
            <span className="hidden sm:inline">Header anpassen</span>
          </button>
        )}
      </div>

      {/* Avatar - Twitter Style overlap */}
      <div className="px-4 relative h-10 md:h-12">
        <div className="absolute -top-12 md:-top-16 left-4 md:left-6">
           <div 
             className="relative group"
             onMouseEnter={() => setIsHoveringAvatar(true)}
             onMouseLeave={() => setIsHoveringAvatar(false)}
           >
             <div className="rounded-full border-4 border-background bg-background shadow-2xl overflow-hidden relative nebula-glow">
               <UserAvatar 
                 user={{ username, avatarUrl }} 
                 className="h-20 w-20 md:h-32 md:w-32 rounded-full object-cover ring-2 ring-transparent transition-transform duration-500 group-hover:scale-105" 
               />
             </div>

             {isOwnProfile && (
               <motion.button
                 animate={{ opacity: isHoveringAvatar ? 1 : 0 }}
                 onClick={onEditAvatar}
                 className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-[2px] transition-all"
               >
                 <Edit3 className="h-6 w-6" />
               </motion.button>
             )}
           </div>
        </div>
      </div>
    </div>
  );
}
