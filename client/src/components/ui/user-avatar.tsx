import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type UserAvatarProps = {
  user: {
    username: string;
    avatarUrl?: string | null;
  };
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function UserAvatar({ user, size = "md", className }: UserAvatarProps) {
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-16 w-16",
  };

  const initials = user?.username?.slice(0, 2).toUpperCase() || "";

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.username} className="object-cover" />}
      <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
        {initials || <UserCircle className="h-4 w-4" />}
      </AvatarFallback>
    </Avatar>
  );
}
