import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserCircle } from "lucide-react";

type UserAvatarProps = {
  user: {
    username: string;
    profileImageUrl?: string | null;
  };
  size?: "sm" | "md" | "lg";
};

export function UserAvatar({ user, size = "md" }: UserAvatarProps) {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-12 w-12"
  };

  console.log("UserAvatar rendering with profileImageUrl:", user.profileImageUrl);

  return (
    <Avatar className={sizeClasses[size]}>
      {user.profileImageUrl && (
        <AvatarImage 
          src={user.profileImageUrl} 
          alt={user.username} 
          className="object-cover"
          onError={(e) => {
            console.error("Failed to load profile image:", user.profileImageUrl);
            e.currentTarget.style.display = 'none';
          }}
        />
      )}
      <AvatarFallback>
        <UserCircle className={size === "lg" ? "h-6 w-6" : "h-4 w-4"} />
      </AvatarFallback>
    </Avatar>
  );
}