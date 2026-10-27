import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { type LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
    title: string;
    value: string | number;
    description?: string;
    icon: LucideIcon;
    trend?: {
        value: number;
        isPositive: boolean;
    };
    loading?: boolean;
}

export function KPICard({ title, value, description, icon: Icon, trend, loading }: KPICardProps) {
    if (loading) {
        return (
            <Card className="animate-pulse">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-5 pb-2">
                    <h3 className="ov-label">{title}</h3>
                    <div className="h-4 w-4 rounded-sm bg-muted" />
                </CardHeader>
                <CardContent className="p-5 pt-0">
                    <div className="h-8 w-24 rounded-sm bg-muted" />
                    <div className="mt-2 h-3 w-32 rounded-sm bg-muted" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-5 pb-2">
                <h3 className="ov-label">{title}</h3>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-5 pt-0">
                <div className="ov-data text-2xl font-semibold">{value}</div>
                <div className="mt-2 flex items-center space-x-2">
                    {trend && (
                        <span className={cn(
                            "ov-chip h-5 px-1.5 font-data text-[11px]",
                            trend.isPositive ? "ov-chip-success" : "ov-chip-danger"
                        )}>
                            {trend.isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {trend.value}%
                        </span>
                    )}
                    {description && <p className="text-xs text-muted-foreground">{description}</p>}
                </div>
            </CardContent>
        </Card>
    );
}
