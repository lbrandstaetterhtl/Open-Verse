import React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Circle, Clock, PauseCircle, CheckCircle2, XCircle, AlertCircle, ArrowUp, ArrowRight, ArrowDown } from "lucide-react";

const STATUS_CONFIG = {
  open: { color: "ov-chip-primary", icon: Circle },
  in_progress: { color: "ov-chip-star", icon: Clock },
  on_hold: { color: "", icon: PauseCircle },
  resolved: { color: "ov-chip-success", icon: CheckCircle2 },
  closed: { color: "", icon: XCircle }
} as const;

export function TicketStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("tickets");

  // Safe fallback
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.open;
  const Icon = config.icon;

  return (
    <span className={cn("ov-chip", config.color)}>
      <Icon className="h-3 w-3" />
      {t(`status.${status}`, status)}
    </span>
  );
}

const PRIORITY_CONFIG = {
  low: { color: "", icon: ArrowDown },
  medium: { color: "", icon: ArrowRight },
  high: { color: "ov-chip-star", icon: ArrowUp },
  critical: { color: "ov-chip-danger", icon: AlertCircle }
} as const;

export function TicketPriorityBadge({ priority }: { priority: string }) {
  const { t } = useTranslation("tickets");

  const config = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium;
  const Icon = config.icon;

  return (
    <span className={cn("ov-chip ov-data", config.color)}>
      <Icon className="h-3 w-3" />
      {t(`priority.${priority}`, priority)}
    </span>
  );
}
