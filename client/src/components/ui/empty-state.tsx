import { cn } from "@/lib/utils";
import { FolderOpen } from "lucide-react";
import { Button } from "./button";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
    title?: string;
    description?: string;
    icon?: React.ReactNode;
    action?: {
        label: string;
        onClick: () => void;
    };
}

export function EmptyState({
    title = "No data found",
    description = "There is nothing here yet.",
    icon,
    action,
    className,
    ...props
}: EmptyStateProps) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center p-8 text-center animate-in fade-in-50",
                className
            )}
            {...props}
        >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted/50 mb-4">
                {icon || <FolderOpen className="h-10 w-10 text-muted-foreground" />}
            </div>
            <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm text-balance">
                {description}
            </p>
            {action && (
                <Button onClick={action.onClick} className="mt-6" variant="outline">
                    {action.label}
                </Button>
            )}
        </div>
    );
}
