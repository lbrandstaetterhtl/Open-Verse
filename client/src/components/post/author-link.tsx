import type { ReactNode } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import type { TFunction } from "i18next";

type MaybeAuthor = { id?: number | null; username?: string | null; deleted?: boolean } | null | undefined;

/** Posts and comments of deleted accounts stay visible; their author comes as { deleted: true }. */
export function isDeletedAuthor(author: MaybeAuthor): boolean {
  return !author || !!author.deleted || !author.username;
}

/** Links to the author's profile, or renders plain (muted) content for a deleted account. */
export function AuthorLink({ author, className, children }: { author: MaybeAuthor; className?: string; children: ReactNode }) {
  if (isDeletedAuthor(author)) {
    return <span className={cn(className, "text-muted-foreground")}>{children}</span>;
  }
  return (
    <Link href={`/users/${author!.username}`} className={className}>
      {children}
    </Link>
  );
}

/** Display name: the username, or the translated placeholder for a deleted account ("[deleted]"). */
export function authorName(author: MaybeAuthor, t: TFunction): string {
  return isDeletedAuthor(author) ? t("post.deleted_author", "[deleted]") : author!.username!;
}
