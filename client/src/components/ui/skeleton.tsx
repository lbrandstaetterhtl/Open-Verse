import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md bg-muted/60 relative overflow-hidden",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer motion-reduce:before:hidden",
        "before:bg-gradient-to-r before:from-transparent before:via-foreground/10 before:to-transparent",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
