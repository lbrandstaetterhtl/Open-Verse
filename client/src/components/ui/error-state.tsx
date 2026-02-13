import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "./button";

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
    title?: string;
    message?: string;
    retry?: () => void;
}

export function ErrorState({
    title = "Something went wrong",
    message = "An error occurred while loading this content.",
    retry,
    className,
    ...props
}: ErrorStateProps) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center p-8 text-center text-destructive",
                className
            )}
            {...props}
        >
            <AlertTriangle className="h-10 w-10 mb-4" />
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground mt-2 mb-6 max-w-sm text-balance">
                {message}
            </p>
            {retry && (
                <Button onClick={retry} variant="outline" className="gap-2">
                    <RefreshCcw className="h-4 w-4" />
                    Try Again
                </Button>
            )}
        </div>
    );
}
