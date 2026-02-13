import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
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
        title: "Profile updated",
        description: "Your bio has been saved successfully.",
      });
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Welcome to Osiris! 👋</DialogTitle>
          <DialogDescription>
            Would you like to introduce yourself? Add a short bio to your profile.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            placeholder="I love coffee and coding..."
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="resize-none h-32"
          />
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Skip for now
          </Button>
          <Button
            onClick={() => updateBioMutation.mutate(bio)}
            disabled={updateBioMutation.isPending}
          >
            {updateBioMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Bio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
