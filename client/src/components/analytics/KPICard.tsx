import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{title}</CardTitle>
                    <div className="h-4 w-4 rounded-full bg-muted" />
                </CardHeader>
                <CardContent>
                    <div className="h-8 w-24 rounded bg-muted" />
                    <div className="mt-1 h-3 w-32 rounded bg-muted" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                <div className="mt-1 flex items-center space-x-2">
                    {trend && (
                        <span className={cn(
                            "flex items-center text-xs font-medium",
                            trend.isPositive ? "text-emerald-500" : "text-rose-500"
                        )}>
                            {trend.isPositive ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                            {trend.value}%
                        </span>
                    )}
                    {description && <p className="text-xs text-muted-foreground">{description}</p>}
                </div>
            </CardContent>
        </Card>
    );
}
