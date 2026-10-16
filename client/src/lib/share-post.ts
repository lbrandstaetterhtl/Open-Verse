type Toast = (options: { title: string; description?: string; variant?: "default" | "destructive" }) => unknown;

/**
 * Shares a post: the system share sheet where the browser has one (mobile, some desktops), otherwise
 * the link is copied to the clipboard. Many desktop browsers have no share sheet at all.
 */
export async function sharePost(post: { id: number; title?: string | null }, toast: Toast, labels: { copied: string; copyFailed: string }) {
  const url = `${window.location.origin}/posts/${post.id}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: post.title ?? undefined, url });
      return;
    } catch (error) {
      // The user closed the share sheet: nothing to do.
      if ((error as DOMException)?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast({ title: labels.copied, description: url });
  } catch {
    toast({ title: labels.copyFailed, description: url });
  }
}
