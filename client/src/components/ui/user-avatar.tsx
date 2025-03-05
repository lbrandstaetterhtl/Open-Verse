import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserCircle } from "lucide-react";

type UserAvatarProps = {
  user: {
    username: string;
    verified?: boolean;
    avatarUrl?: string | null;
  };
  size?: "sm" | "md" | "lg";
};

export function UserAvatar({ user, size = "md" }: UserAvatarProps) {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-12 w-12"
  };

  return (
    <Avatar className={sizeClasses[size]}>
      {user.avatarUrl ? (
        <AvatarImage 
          src={user.avatarUrl} 
          alt={user.username}
          onError={(e) => {
            console.error('Error loading avatar:', e);
            // Reset src to trigger fallback on error
            (e.target as HTMLImageElement).src = '';
          }}
        />
      ) : (
        <AvatarFallback>
          <UserCircle className="h-4 w-4" />
        </AvatarFallback>
      )}
    </Avatar>
  );
}