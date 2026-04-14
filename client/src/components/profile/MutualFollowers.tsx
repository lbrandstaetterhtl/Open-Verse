import type { User } from "@shared/schema";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useTranslation } from "react-i18next";

interface MutualFollowersProps {
  followers: User[];
}

export function MutualFollowers({ followers }: MutualFollowersProps) {
  const { t } = useTranslation();
  
  if (!followers || followers.length === 0) return null;

  const displayFollowers = followers.slice(0, 3);
  const remainingCount = followers.length > 3 ? followers.length - 3 : 0;

  return (
    <div className="flex items-center gap-2 mt-4">
      <div className="flex -space-x-2">
        {displayFollowers.map((user, i) => (
          <div 
            key={user.id} 
            className="ring-2 ring-background rounded-full overflow-hidden transition-transform hover:scale-110"
            style={{ zIndex: displayFollowers.length - i }}
          >
            <UserAvatar user={user} className="h-6 w-6" />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {displayFollowers.length > 0 && (
          <>
            {t('profile.followedBy')} {' '}
            <span className="font-semibold text-foreground">
              {displayFollowers[0].username}
            </span>
            {displayFollowers.length > 1 && (
              <>
                , <span className="font-semibold text-foreground">{displayFollowers[1].username}</span>
              </>
            )}
            {remainingCount > 0 && (
              <> {t('profile.and')} {remainingCount} {t('profile.others')}</>
            )}
          </>
        )}
      </p>
    </div>
  );
}
