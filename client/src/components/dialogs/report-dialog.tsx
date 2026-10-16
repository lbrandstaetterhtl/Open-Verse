import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Flag } from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

// value is what the API stores; key is the label shown in the UI.
const REPORT_REASONS = [
  { value: "Spam", key: "report.reasons.spam", fallback: "Spam" },
  { value: "Harassment", key: "report.reasons.harassment", fallback: "Harassment" },
  { value: "Hate Speech", key: "report.reasons.hate_speech", fallback: "Hate speech" },
  { value: "Inappropriate Content", key: "report.reasons.inappropriate", fallback: "Inappropriate content" },
  { value: "Misinformation", key: "report.reasons.misinformation", fallback: "Misinformation" },
  { value: "Other", key: "report.reasons.other", fallback: "Other" },
];

interface ReportDialogProps {
  type: "post" | "discussion" | "comment";
  id: number;
  trigger?: React.ReactNode;
}

export function ReportDialog({ type, id, trigger }: ReportDialogProps) {
  const [reason, setReason] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const descriptions: Record<ReportDialogProps["type"], string> = {
    post: t("report.description_post", "Please select a reason for reporting this post. This will verify it against our community guidelines."),
    discussion: t("report.description_discussion", "Please select a reason for reporting this discussion. This will verify it against our community guidelines."),
    comment: t("report.description_comment", "Please select a reason for reporting this comment. This will verify it against our community guidelines."),
  };

  const reportMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { reason };
      if (type === "post") payload.postId = id;
      else if (type === "discussion") payload.discussionId = id;
      else if (type === "comment") payload.commentId = id;

      await apiRequest("POST", "/api/reports", payload);
    },
    onSuccess: () => {
      toast({
        title: t("report.submitted", "Report submitted"),
        description: t("report.submitted_desc", "Thank you for helping keep our community safe."),
      });
      setIsOpen(false);
      setReason("");
    },
    onError: (error: Error) => {
      toast({
        title: t("report.failed", "Report failed"),
        description: error.message || t("report.failed_desc", "Failed to submit report. Please try again."),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!reason) {
      toast({
        title: t("report.reason_required", "Reason required"),
        description: t("report.reason_required_desc", "Please select a reason for reporting."),
        variant: "destructive",
      });
      return;
    }
    reportMutation.mutate();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="h-8" aria-label={t("actions.report")}>
            <Flag className="h-4 w-4 lg:mr-1" />
            <span className="text-xs lg:text-sm hidden lg:inline">{t("actions.report")}</span>
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("report.title", "Report content")}</AlertDialogTitle>
          <AlertDialogDescription>
            {descriptions[type]}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger aria-label={t("report.reason", "Reason")}>
              <SelectValue placeholder={t("report.select_reason", "Select a reason")} />
            </SelectTrigger>
            <SelectContent>
              {REPORT_REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {t(r.key, r.fallback)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setReason("")}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleSubmit} disabled={reportMutation.isPending || !reason}>
            {reportMutation.isPending ? t("report.submitting", "Submitting...") : t("actions.report")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
