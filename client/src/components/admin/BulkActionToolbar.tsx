import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { CheckSquare, ShieldBan, Trash2, EyeOff, Ban, Snowflake } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ActionDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  variant: "default" | "destructive" | "outline" | "secondary";
}

interface Props {
  count: number;
  type: "users" | "reports" | "posts";
  onAction: (actionId: string) => void;
  onClear: () => void;
}

export function BulkActionToolbar({ count, type, onAction, onClear }: Props) {
  const { t } = useTranslation("admin");

  const actions: Record<string, ActionDef[]> = {
    users: [
      { id: "account", label: t("bulk.banAccount", "Account Ban"), icon: <ShieldBan className="w-4 h-4 mr-2" />, variant: "destructive" },
      { id: "shadow", label: t("bulk.shadowBan", "Shadowban"), icon: <EyeOff className="w-4 h-4 mr-2" />, variant: "outline" },
      { id: "freeze", label: t("bulk.freeze", "Freeze"), icon: <Snowflake className="w-4 h-4 mr-2" />, variant: "secondary" },
    ],
    reports: [
      { id: "resolve", label: t("bulk.resolve", "Resolve"), icon: <CheckSquare className="w-4 h-4 mr-2" />, variant: "default" },
      { id: "dismiss", label: t("bulk.dismiss", "Dismiss"), icon: <Ban className="w-4 h-4 mr-2" />, variant: "outline" },
    ],
    posts: [
      { id: "delete", label: t("bulk.delete", "Delete"), icon: <Trash2 className="w-4 h-4 mr-2" />, variant: "destructive" },
    ]
  };

  const availableActions = actions[type] || [];

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 p-4 bg-background border shadow-lg rounded-full"
        >
          <div className="flex items-center gap-2 px-4 border-r">
            <span className="font-semibold">{count}</span>
            <span className="text-muted-foreground text-sm">{t("bulk.selectedCount", "Ausgewählt")}</span>
          </div>

          <div className="flex items-center gap-2 px-2">
            {availableActions.map(action => (
                <Button
                    key={action.id}
                    size="sm"
                    variant={action.variant}
                    onClick={() => onAction(action.id)}
                >
                    {action.icon}
                    {action.label}
                </Button>
            ))}
          </div>

          <div className="px-2">
            <Button size="sm" variant="ghost" onClick={onClear}>
                {t("common.cancel", "Abbrechen")}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
