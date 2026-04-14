import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type LeaderboardCreator } from "@/hooks/use-analytics";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "react-i18next";

interface Props {
    data?: LeaderboardCreator[];
    loading?: boolean;
}

export function TopCreatorsSection({ data, loading }: Props) {
    const { t } = useTranslation();

    return (
        <Card className="col-span-1">
            <CardHeader>
                <CardTitle className="text-lg">{t("analytics.top_creators", "Top Creators")}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {loading ? (
                        Array(5).fill(0).map((_, i) => (
                            <div key={i} className="flex items-center space-x-4 animate-pulse">
                                <div className="h-10 w-10 rounded-full bg-muted" />
                                <div className="space-y-2">
                                    <div className="h-4 w-24 bg-muted rounded" />
                                    <div className="h-3 w-16 bg-muted rounded" />
                                </div>
                            </div>
                        ))
                    ) : (
                        data?.map((creator, index) => (
                            <div key={creator.id} className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="text-sm font-medium text-muted-foreground w-4">{index + 1}</div>
                                    <Avatar className="h-9 w-9">
                                        <AvatarImage src={creator.profilePictureUrl || ""} />
                                        <AvatarFallback>{creator.username[0]}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="text-sm font-medium leading-none">{creator.username}</div>
                                        <div className="text-xs text-muted-foreground">{creator.newPosts} {t("analytics.new_posts_count", "posts this period")}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-bold">+{creator.newFollowers}</div>
                                    <div className="text-[10px] text-muted-foreground uppercase">{t("analytics.growth", "Growth")}</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
