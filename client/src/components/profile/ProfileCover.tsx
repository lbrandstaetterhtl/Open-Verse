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
      <div className="relative h-48 md:h-64 lg:h-80 w-full overflow-hidden rounded-b-3xl bg-muted">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt="Profile cover"
            className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/20 via-primary/5 to-background" />
        )}

        {/* Glassmorphism Overlay for Edit Button */}
        {isOwnProfile && (
          <button
            onClick={onEditCover}
            className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-background/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition-all hover:bg-background/40 active:scale-95 border border-white/20"
          >
            <Camera className="h-4 w-4" />
            <span className="hidden md:inline">Edit Cover</span>
          </button>
        )}
      </div>

      {/* Avatar Container */}
      <div className="container relative mx-auto px-4">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="absolute -bottom-16 left-4 md:left-8 flex"
        >
          <div 
            className="relative"
            onMouseEnter={() => setIsHoveringAvatar(true)}
            onMouseLeave={() => setIsHoveringAvatar(false)}
          >
            <div className="rounded-full border-4 border-background bg-background p-1 shadow-xl">
              <UserAvatar 
                user={{ username, avatarUrl }} 
                className="h-24 w-24 md:h-32 md:w-32 rounded-full object-cover" 
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
        </motion.div>
      </div>
    </div>
  );
}
