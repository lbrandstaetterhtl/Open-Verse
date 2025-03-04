import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { AVAILABLE_TOPICS, CONTENT_TYPES, userPreferencesSchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

type Step = {
  title: string;
  description: string;
};

const STEPS: Step[] = [
  {
    title: "Welcome to Your Feed Customization",
    description: "Let's personalize your coffee content feed. This will help us show you the most relevant posts.",
  },
  {
    title: "Select Your Interests",
    description: "Choose the coffee-related topics you're most interested in.",
  },
  {
    title: "Content Types",
    description: "What kind of content would you like to see?",
  },
  {
    title: "Almost Done!",
    description: "Just a few final preferences to set up.",
  },
];

export function PreferencesWizard({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedContentTypes, setSelectedContentTypes] = useState<string[]>([]);
  const [showRecommended, setShowRecommended] = useState(true);

  const savePreferencesMutation = useMutation({
    mutationFn: async (preferences: {
      topics: string[];
      contentTypes: string[];
      showRecommended: boolean;
    }) => {
      const result = userPreferencesSchema.safeParse(preferences);
      if (!result.success) {
        throw new Error(result.error.message);
      }

      const res = await apiRequest("POST", "/api/preferences", preferences);
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({
        title: "Preferences saved",
        description: "Your feed preferences have been updated successfully.",
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleNext = () => {
    if (currentStep === STEPS.length - 1) {
      savePreferencesMutation.mutate({
        topics: selectedTopics,
        contentTypes: selectedContentTypes,
        showRecommended,
      });
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const isNextDisabled = () => {
    if (currentStep === 1 && selectedTopics.length === 0) return true;
    if (currentStep === 2 && selectedContentTypes.length === 0) return true;
    return false;
  };

  return (
    <Card className="w-[600px]">
      <CardHeader>
        <CardTitle>{STEPS[currentStep].title}</CardTitle>
        <CardDescription>{STEPS[currentStep].description}</CardDescription>
      </CardHeader>

      <CardContent>
        {currentStep === 0 && (
          <div className="space-y-4">
            <p>
              Welcome {user?.username}! This wizard will help you customize your feed to show the content
              that matters most to you.
            </p>
            <p>We'll ask you about:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>Your favorite coffee-related topics</li>
              <li>The types of content you prefer</li>
              <li>Additional personalization options</li>
            </ul>
          </div>
        )}

        {currentStep === 1 && (
          <div className="grid grid-cols-2 gap-4">
            {AVAILABLE_TOPICS.map((topic) => (
              <div key={topic} className="flex items-center space-x-2">
                <Checkbox
                  id={topic}
                  checked={selectedTopics.includes(topic)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedTopics((prev) => [...prev, topic]);
                    } else {
                      setSelectedTopics((prev) => prev.filter((t) => t !== topic));
                    }
                  }}
                />
                <Label htmlFor={topic}>{topic}</Label>
              </div>
            ))}
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4">
            {CONTENT_TYPES.map((type) => (
              <div key={type} className="flex items-center space-x-2">
                <Checkbox
                  id={type}
                  checked={selectedContentTypes.includes(type)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedContentTypes((prev) => [...prev, type]);
                    } else {
                      setSelectedContentTypes((prev) => prev.filter((t) => t !== type));
                    }
                  }}
                />
                <Label htmlFor={type} className="capitalize">
                  {type}
                </Label>
              </div>
            ))}
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="recommended"
                checked={showRecommended}
                onCheckedChange={(checked) => setShowRecommended(checked as boolean)}
              />
              <Label htmlFor="recommended">
                Show recommended content based on my interests
              </Label>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => {
            if (currentStep === 0) {
              onClose();
            } else {
              setCurrentStep((prev) => prev - 1);
            }
          }}
        >
          {currentStep === 0 ? "Cancel" : "Back"}
        </Button>
        <Button
          onClick={handleNext}
          disabled={isNextDisabled() || savePreferencesMutation.isPending}
        >
          {savePreferencesMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {currentStep === STEPS.length - 1 ? "Save Preferences" : "Next"}
        </Button>
      </CardFooter>
    </Card>
  );
}
