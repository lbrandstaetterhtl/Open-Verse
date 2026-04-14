import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface TrendChartProps {
    data: any[];
    dataKey: string;
    label: string;
    color?: string;
    loading?: boolean;
}

export function TrendChart({ data, dataKey, label, color = "#3b82f6", loading }: TrendChartProps) {
    if (loading) {
        return <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />;
    }

    const config = {
        [dataKey]: {
            label,
            color
        }
    };

    return (
        <ChartContainer config={config} className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground)/0.1)" />
                    <XAxis 
                        dataKey="snapshotDate" 
                        tick={{ fontSize: 10 }} 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(val) => val.split('-').slice(1).join('/')}
                    />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                        type="monotone"
                        dataKey={dataKey}
                        stroke={color}
                        fillOpacity={1}
                        fill={`url(#gradient-${dataKey})`}
                        strokeWidth={2}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </ChartContainer>
    );
}
