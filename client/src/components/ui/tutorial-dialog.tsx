import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, ChevronLeft, Check } from "lucide-react";

const tutorialSteps = [
  {
    title: "Welcome to Our Platform!",
    description: "Let's take a quick tour of the features available to you. We'll show you how to make the most of your experience.",
    highlight: "navbar"
  },
  {
    title: "Your Profile",
    description: "Click on your avatar to access your profile settings, where you can update your information and manage your account.",
    highlight: "profile-section"
  },
  {
    title: "Creating Posts",
    description: "Share your thoughts by creating posts. You can post discussions, news, or entertainment content.",
    highlight: "create-post"
  },
  {
    title: "Interacting with Others",
    description: "Follow other users, like their posts, and leave comments to engage with the community.",
    highlight: "interaction"
  },
  {
    title: "Messaging",
    description: "Use the chat feature to have private conversations with other users.",
    highlight: "messages"
  }
];

export function TutorialDialog() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(!user?.tutorialCompleted);
  const [currentStep, setCurrentStep] = useState(user?.tutorialStep || 0);

  const updateTutorialProgress = useMutation({
    mutationFn: async (data: { step: number; completed?: boolean }) => {
      const res = await apiRequest("PATCH", "/api/user/tutorial", data);
      if (!res.ok) throw new Error("Failed to update tutorial progress");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (user && !user.tutorialCompleted && currentStep !== user.tutorialStep) {
      updateTutorialProgress.mutate({ step: currentStep });
    }
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      updateTutorialProgress.mutate({ step: currentStep, completed: true });
      setIsOpen(false);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    if (window.confirm("Are you sure you want to skip the tutorial? You can always access it later from your profile settings.")) {
      updateTutorialProgress.mutate({ step: tutorialSteps.length - 1, completed: true });
      setIsOpen(false);
    }
  };

  if (!user || user.tutorialCompleted) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{tutorialSteps[currentStep].title}</DialogTitle>
          <DialogDescription>
            {tutorialSteps[currentStep].description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between mt-4">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="flex items-center"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="ghost"
            onClick={handleSkip}
          >
            Skip Tutorial
          </Button>
          <Button
            onClick={handleNext}
            className="flex items-center"
          >
            {currentStep === tutorialSteps.length - 1 ? (
              <>
                Finish
                <Check className="h-4 w-4 ml-1" />
              </>
            ) : (
              <>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
