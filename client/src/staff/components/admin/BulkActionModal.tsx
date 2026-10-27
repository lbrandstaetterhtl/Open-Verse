import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

interface BulkActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, duration?: number) => void;
  type: "users" | "reports";
  actionId: string;
  count: number;
}

/* Texts are stored as i18n keys (with English defaults) and translated at render time. */
const ACTION_META: Record<string, { title: [string, string]; description: [string, string]; confirm: [string, string]; danger: boolean }> = {
  ban:     { title: ["admin_bulk.ban.title", "Ban users"],     description: ["admin_bulk.ban.description", "This will restrict platform access for the selected users."],  confirm: ["admin_bulk.ban.confirm", "Confirm ban"],    danger: true  },
  unban:   { title: ["admin_bulk.unban.title", "Unban users"],   description: ["admin_bulk.unban.description", "This will restore platform access for the selected users."],   confirm: ["admin_bulk.unban.confirm", "Confirm unban"],  danger: false },
  resolve: { title: ["admin_bulk.resolve.title", "Resolve reports"], description: ["admin_bulk.resolve.description", "Mark all selected reports as resolved."],                    confirm: ["admin_bulk.resolve.confirm", "Resolve all"],  danger: false },
  reject:  { title: ["admin_bulk.reject.title", "Reject reports"],  description: ["admin_bulk.reject.description", "Dismiss all selected reports as rejected."],                 confirm: ["admin_bulk.reject.confirm", "Reject all"],   danger: true  },
};

export function BulkActionModal({ isOpen, onClose, onConfirm, type, actionId, count }: BulkActionModalProps) {
  const { t } = useTranslation();
  const known = ACTION_META[actionId];
  const meta = known ? {
    title: t(known.title[0], known.title[1]),
    description: t(known.description[0], known.description[1]),
    confirm: t(known.confirm[0], known.confirm[1]),
    danger: known.danger,
  } : {
    title: t("staff:admin_bulk.default.title", "Confirm action"),
    description: type === "users"
      ? t("staff:admin_bulk.default.description_users", { count, defaultValue: "Apply this action to {{count}} selected users." })
      : t("staff:admin_bulk.default.description_reports", { count, defaultValue: "Apply this action to {{count}} selected reports." }),
    confirm: t("common.confirm", "Confirm"),
    danger: false,
  };
  const countLabel = type === "users"
    ? t("staff:admin_bulk.count_users", { count, defaultValue: "{{count}} users" })
    : t("staff:admin_bulk.count_reports", { count, defaultValue: "{{count}} reports" });

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {meta.title}
            <Badge variant="secondary" className="font-data font-medium">{countLabel}</Badge>
          </AlertDialogTitle>
          <AlertDialogDescription>{meta.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={meta.danger ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            onClick={() => onConfirm("")}
          >
            {meta.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
