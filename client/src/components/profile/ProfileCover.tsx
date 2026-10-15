import { useState } from "react";
import { Camera, Pencil } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Constellation } from "@/components/layout/page-header";
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
    <div className="relative w-full">
      {/* Cover: the photo with two cut corners, or an empty star-chart panel when none is set */}
      <div className={cn(
        "relative h-48 md:h-72 lg:h-96 w-full overflow-hidden",
        coverUrl ? "ov-cut-2 rounded-xl bg-muted" : "ov-panel"
      )}>
        {coverUrl ? (
          <motion.img
            initial={{ scale: 1.04, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            src={coverUrl}
            alt="Profile cover"
            className="h-full w-full object-cover"
          />
        ) : (
          <Constellation className="absolute right-[8%] top-1/2 h-24 w-auto max-w-[70%] -translate-y-1/2 md:h-32" />
        )}

        <AnimatePresence>
          {isOwnProfile && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={onEditCover}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "absolute top-4 right-4 md:top-6 md:right-6 z-20 bg-background/85"
              )}
            >
              <Camera className="h-4 w-4" />
              <span className="hidden sm:inline">Change Essence</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Avatar overlapping the cover. It lives outside the clipped cover so its top is never cut. */}
      <div className="px-6 md:px-10 relative h-16 md:h-20">
        <div className="absolute -top-16 md:-top-24 left-6 md:left-10">
           <div
             className="relative"
             onMouseEnter={() => setIsHoveringAvatar(true)}
             onMouseLeave={() => setIsHoveringAvatar(false)}
           >
             {/* Background-coloured frame that separates the avatar from the cover */}
             <div className="ov-avatar bg-background p-1 md:p-1.5">
                <UserAvatar
                  user={{ username, avatarUrl }}
                  className="h-28 w-28 md:h-44 md:w-44 border-0"
                />
             </div>

             {isOwnProfile && (
               <motion.button
                 animate={{ opacity: isHoveringAvatar ? 1 : 0 }}
                 onClick={onEditAvatar}
                 className="ov-avatar absolute inset-0 z-10 flex items-center justify-center bg-background/60 text-foreground transition-colors"
               >
                 <Pencil className="h-7 w-7" />
               </motion.button>
             )}
           </div>
        </div>
      </div>
    </div>
  );
}
