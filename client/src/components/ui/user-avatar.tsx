import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserCircle } from "lucide-react";

type UserAvatarProps = {
  user: {
    username: string;
    avatarUrl?: string;
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
      {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.username} />}
      <AvatarFallback>
        <UserCircle className="h-4 w-4" />
      </AvatarFallback>
    </Avatar>
  );
}