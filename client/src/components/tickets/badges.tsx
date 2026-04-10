import React from "react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { Circle, Clock, PauseCircle, CheckCircle, XCircle, AlertCircle, ArrowUp, ArrowRight, ArrowDown } from "lucide-react";

const STATUS_CONFIG = {
  open: { color: "bg-blue-100 text-blue-700 border-blue-200", icon: Circle },
  in_progress: { color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock },
  on_hold: { color: "bg-orange-100 text-orange-700 border-orange-200", icon: PauseCircle },
  resolved: { color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle },
  closed: { color: "bg-gray-100 text-gray-700 border-gray-200", icon: XCircle }
} as const;

export function TicketStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("tickets");
  
  // Safe fallback
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.open;
  const Icon = config.icon;
  
  return (
    <Badge variant="outline" className={`font-semibold flex items-center gap-1.5 px-2.5 py-0.5 ${config.color}`}>
      <Icon className="h-3 w-3" />
      {t(`status.${status}`, status)}
    </Badge>
  );
}

const PRIORITY_CONFIG = {
  low: { color: "bg-gray-100 text-gray-700 border-gray-200", icon: ArrowDown },
  medium: { color: "bg-blue-100 text-blue-700 border-blue-200", icon: ArrowRight },
  high: { color: "bg-orange-100 text-orange-700 border-orange-200", icon: ArrowUp },
  critical: { color: "bg-red-100 text-red-700 border-red-200", icon: AlertCircle }
} as const;

export function TicketPriorityBadge({ priority }: { priority: string }) {
  const { t } = useTranslation("tickets");
  
  const config = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium;
  const Icon = config.icon;
  
  return (
    <Badge variant="outline" className={`font-semibold flex items-center gap-1 px-2.5 py-0.5 ${config.color}`}>
      <Icon className="h-3 w-3" />
      {t(`priority.${priority}`, priority)}
    </Badge>
  );
}
