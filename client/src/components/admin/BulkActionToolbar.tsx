import { Button } from "@/components/ui/button";
import { Trash2, Shield, ShieldOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface BulkActionToolbarProps {
  type: string;
  count: number;
  onAction: (actionId: string) => void;
  onClear: () => void;
}

const USER_ACTIONS = [
  { id: "ban", labelKey: "admin_bulk.toolbar.ban", fallback: "Ban selected", icon: ShieldOff, variant: "destructive" as const },
  { id: "unban", labelKey: "admin_bulk.toolbar.unban", fallback: "Unban selected", icon: Shield, variant: "default" as const },
  { id: "delete", labelKey: "admin_bulk.toolbar.delete", fallback: "Delete selected", icon: Trash2, variant: "destructive" as const },
];

const REPORT_ACTIONS = [
  { id: "resolve", labelKey: "admin_bulk.toolbar.resolve", fallback: "Resolve all", icon: Shield, variant: "default" as const },
  { id: "reject", labelKey: "admin_bulk.toolbar.reject", fallback: "Reject all", icon: ShieldOff, variant: "destructive" as const },
];

export function BulkActionToolbar({ type, count, onAction, onClear }: BulkActionToolbarProps) {
  const { t } = useTranslation();
  if (count === 0) return null;

  const actions = type === "users" ? USER_ACTIONS : REPORT_ACTIONS;

  return (
    <div className={cn(
      "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
      "ov-panel ov-panel-solid flex items-center gap-3 px-4 py-3",
      "animate-in slide-in-from-bottom-4 duration-300"
    )}>
      <span className="text-sm text-muted-foreground pr-3 border-r border-border">
        <span className="ov-data font-semibold text-foreground">{count}</span> {t("admin_bulk.toolbar.selected", "selected")}
      </span>
      <div className="flex items-center gap-2">
        {actions.map((action) => (
          <Button
            key={action.id}
            size="sm"
            variant={action.variant}
            className="h-8 text-xs gap-1.5"
            onClick={() => onAction(action.id)}
          >
            <action.icon className="h-3.5 w-3.5" />
            {t(action.labelKey, action.fallback)}
          </Button>
        ))}
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 ml-1"
        aria-label={t("admin_bulk.toolbar.clear", "Clear selection")}
        onClick={onClear}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
