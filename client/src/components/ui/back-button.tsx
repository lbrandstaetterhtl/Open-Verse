import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export interface BackButtonProps {
  fallback: string;
  label?: string;
  variant?: "default" | "ghost" | "outline" | "secondary" | "link" | "destructive";
  className?: string;
}

export function BackButton({
  fallback,
  label,
  variant = "ghost",
  className = "",
}: BackButtonProps) {
  const [, navigate] = useLocation();
  const { t } = useTranslation();

  const handleBack = () => {
    // If the window history length is > 1 it means we navigated within the app
    if (window.history.length > 2) {
      window.history.back();
    } else {
      navigate(fallback);
    }
  };

  return (
    <Button
      variant={variant}
      onClick={handleBack}
      className={`gap-1 text-muted-foreground hover:text-foreground ${className}`}
      aria-label={label ?? t("common.back", "Zurück")}
    >
      <ChevronLeft className="h-4 w-4" />
      {label ?? t("common.back", "Zurück")}
    </Button>
  );
}
