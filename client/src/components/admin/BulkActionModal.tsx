import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, duration?: number) => Promise<void>;
  actionId: string;
  count: number;
  type: "users" | "reports" | "posts";
}

export function BulkActionModal({ isOpen, onClose, onConfirm, actionId, count, type }: Props) {
  const { t } = useTranslation("admin");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const needsDuration = ["account", "shadow", "ip", "hardware", "freeze"].includes(actionId);
  const needsReason = true; 

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(reason, duration ? parseInt(duration) : undefined);
      setReason("");
      setDuration("");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={isSubmitting ? undefined : onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`bulk.title.${actionId}`, `Bulk Action: ${actionId}`)}</DialogTitle>
          <DialogDescription>
             {t("bulk.confirmCount", { count, defaultValue: `Are you sure you want to apply this to {{count}} items?` })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {needsReason && (
            <div className="space-y-2">
              <Label>{t("bulk.reason", "Reason")}</Label>
              <Textarea 
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={t("bulk.reasonPlaceholder", "Internal note or reason...")}
              />
            </div>
          )}

          {needsDuration && (
            <div className="space-y-2">
              <Label>{t("bulk.duration", "Duration (Hours)")}</Label>
              <Input 
                type="number"
                min="1"
                value={duration}
                onChange={e => setDuration(e.target.value)}
                placeholder={t("bulk.durationPlaceholder", "Leave empty for permanent")}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button variant={["delete", "account"].includes(actionId) ? "destructive" : "default"} onClick={handleConfirm} disabled={isSubmitting || (needsReason && !reason)}>
            {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {t("common.confirm", "Confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
