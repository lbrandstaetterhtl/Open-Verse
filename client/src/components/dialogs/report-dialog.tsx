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

const REPORT_REASONS = [
  "Spam",
  "Harassment",
  "Hate Speech",
  "Inappropriate Content",
  "Misinformation",
  "Other",
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
        title: "Report submitted",
        description: "Thank you for helping keep our community safe.",
      });
      setIsOpen(false);
      setReason("");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to submit report. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!reason) {
      toast({
        title: "Reason required",
        description: "Please select a reason for reporting.",
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
          <Button variant="ghost" size="sm" className="h-8">
            <Flag className="h-4 w-4 mr-1" />
            <span className="text-xs lg:text-sm">Report</span>
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Report Content</AlertDialogTitle>
          <AlertDialogDescription>
            Please select a reason for reporting this {type}. This will verify it against our
            community guidelines.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger>
              <SelectValue placeholder="Select a reason" />
            </SelectTrigger>
            <SelectContent>
              {REPORT_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setReason("")}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleSubmit} disabled={reportMutation.isPending || !reason}>
            {reportMutation.isPending ? "Submitting..." : "Report"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
