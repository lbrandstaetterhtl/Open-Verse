import { Button } from "@/components/ui/button";
import { Trash2, Shield, ShieldOff, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface BulkActionToolbarProps {
  type: string;
  count: number;
  onAction: (actionId: string) => void;
  onClear: () => void;
}

const USER_ACTIONS = [
  { id: "ban", label: "Ban Selected", icon: ShieldOff, variant: "destructive" as const },
  { id: "unban", label: "Unban Selected", icon: Shield, variant: "default" as const },
  { id: "delete", label: "Delete Selected", icon: Trash2, variant: "destructive" as const },
];

const REPORT_ACTIONS = [
  { id: "resolve", label: "Resolve All", icon: Shield, variant: "default" as const },
  { id: "reject", label: "Reject All", icon: ShieldOff, variant: "destructive" as const },
];

export function BulkActionToolbar({ type, count, onAction, onClear }: BulkActionToolbarProps) {
  if (count === 0) return null;

  const actions = type === "users" ? USER_ACTIONS : REPORT_ACTIONS;

  return (
    <div className={cn(
      "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
      "flex items-center gap-3 px-4 py-3 rounded-2xl",
      "bg-card border shadow-2xl backdrop-blur-sm",
      "animate-in slide-in-from-bottom-4 duration-300"
    )}>
      <span className="text-sm font-bold text-muted-foreground pr-2 border-r">
        {count} selected
      </span>
      <div className="flex items-center gap-2">
        {actions.map((action) => (
          <Button
            key={action.id}
            size="sm"
            variant={action.variant}
            className="h-8 text-xs font-bold gap-1.5"
            onClick={() => onAction(action.id)}
          >
            <action.icon className="h-3.5 w-3.5" />
            {action.label}
          </Button>
        ))}
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 ml-1"
        onClick={onClear}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
