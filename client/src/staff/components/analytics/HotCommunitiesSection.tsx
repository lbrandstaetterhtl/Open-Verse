import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type LeaderboardCommunity } from "@/staff/hooks/use-analytics";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "react-i18next";

interface Props {
    data?: LeaderboardCommunity[];
    loading?: boolean;
}

export function HotCommunitiesSection({ data, loading }: Props) {
    const { t } = useTranslation();

    return (
        <Card className="col-span-1">
            <CardHeader>
                <CardTitle className="text-lg">{t("analytics:hot_communities", "Hot Communities")}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {loading ? (
                        Array(5).fill(0).map((_, i) => (
                            <div key={i} className="flex items-center space-x-4 animate-pulse">
                                <div className="ov-avatar h-10 w-10 bg-muted" />
                                <div className="space-y-2">
                                    <div className="h-4 w-24 rounded-sm bg-muted" />
                                    <div className="h-3 w-16 rounded-sm bg-muted" />
                                </div>
                            </div>
                        ))
                    ) : (
                        data?.map((community, index) => (
                            <div key={community.id} className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="ov-data w-4 text-sm text-muted-foreground">{index + 1}</div>
                                    <Avatar className="h-9 w-9">
                                        <AvatarImage src={community.imageUrl || ""} />
                                        <AvatarFallback>{community.name[0]}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="text-sm font-semibold leading-none">{community.name}</div>
                                        <div className="mt-1 text-xs text-muted-foreground">@{community.slug}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="ov-data text-sm font-semibold">{community.activeMembers}</div>
                                    <div className="ov-label">{t("analytics:active", "Active")}</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
