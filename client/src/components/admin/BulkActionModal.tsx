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

interface BulkActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, duration?: number) => void;
  type: "users" | "reports";
  actionId: string;
  count: number;
}

const ACTION_META: Record<string, { title: string; description: string; confirm: string; danger: boolean }> = {
  ban:     { title: "Ban Users",     description: "This will restrict platform access for the selected users.",  confirm: "Confirm Ban",    danger: true  },
  unban:   { title: "Unban Users",   description: "This will restore platform access for the selected users.",   confirm: "Confirm Unban",  danger: false },
  delete:  { title: "Delete Users",  description: "This will permanently delete the selected users and all their data. This cannot be undone.", confirm: "Delete All", danger: true },
  resolve: { title: "Resolve Reports", description: "Mark all selected reports as resolved.",                    confirm: "Resolve All",  danger: false },
  reject:  { title: "Reject Reports",  description: "Dismiss all selected reports as rejected.",                 confirm: "Reject All",   danger: true  },
};

export function BulkActionModal({ isOpen, onClose, onConfirm, type, actionId, count }: BulkActionModalProps) {
  const meta = ACTION_META[actionId] ?? {
    title: "Confirm Action",
    description: `Apply this action to ${count} selected ${type}.`,
    confirm: "Confirm",
    danger: false,
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {meta.title}
            <Badge variant="secondary" className="text-xs font-black">{count} {type}</Badge>
          </AlertDialogTitle>
          <AlertDialogDescription>{meta.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="font-bold">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={meta.danger ? "bg-red-600 hover:bg-red-700 font-bold" : "font-bold"}
            onClick={() => onConfirm("")}
          >
            {meta.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
