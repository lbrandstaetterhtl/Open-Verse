import { useState, useEffect } from "react";
import { LIMITS } from "@/lib/input-limits";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export function NewUserDialog() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [bio, setBio] = useState("");

  useEffect(() => {
    // Check if user is newly registered
    const isNewUser = sessionStorage.getItem("isNewUser") === "true";
    if (user && isNewUser) {
      setOpen(true);
      // Clear the flag so it doesn't show again on reload
      sessionStorage.removeItem("isNewUser");
    }
  }, [user]);

  const updateBioMutation = useMutation({
    mutationFn: async (bio: string) => {
      const res = await apiRequest("PATCH", "/api/profile", { bio });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: t("profile.update_success_title"),
        description: t("onboarding.bio_saved", "Your bio has been saved successfully."),
      });
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: t("onboarding.update_failed", "Update failed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("onboarding.welcome_title", "Welcome to Osiris!")} 👋</DialogTitle>
          <DialogDescription>
            {t("onboarding.welcome_desc", "Would you like to introduce yourself? Add a short bio to your profile.")}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            placeholder={t("onboarding.bio_placeholder", "I love coffee and coding...")}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={LIMITS.bio}
            className="resize-none h-32"
          />
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("onboarding.skip", "Skip for now")}
          </Button>
          <Button
            onClick={() => updateBioMutation.mutate(bio)}
            disabled={updateBioMutation.isPending}
          >
            {updateBioMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("onboarding.save_bio", "Save Bio")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
