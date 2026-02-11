import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { insertCommunitySchema, InsertCommunity } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Navbar } from "@/components/layout/navbar";
import { useLocation } from "wouter";
import { Users, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";

export default function CreateCommunityPage() {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const { user } = useAuth();

    const form = useForm<InsertCommunity>({
        resolver: zodResolver(insertCommunitySchema),
        defaultValues: {
            name: "",
            description: "",
            imageUrl: "",
            allowedCategories: "news,entertainment,discussion",
        },
    });

    const createCommunityMutation = useMutation({
        mutationFn: async (data: InsertCommunity) => {
            const res = await apiRequest("POST", "/api/communities", data);
            return res.json();
        },
        onSuccess: (community) => {
            queryClient.invalidateQueries({ queryKey: ["/api/communities"] });
            queryClient.invalidateQueries({ queryKey: ["/api/user/moderated-communities"] });
            queryClient.invalidateQueries({ queryKey: ["/api/user/communities"] });
            toast({
                title: t('community.create.success_title'),
                description: `Welcome to ${community.name}!`,
            });
            setLocation(`/c/${community.slug}`);
        },
        onError: (error: Error) => {
            toast({
                title: t('common.error'),
                description: error.message,
                variant: "destructive",
            });
        },
    });

    if (!user) return null;

    const isPrivileged = user.role === 'admin' || user.role === 'owner';
    if (!isPrivileged && user.karma < 200) {
        return (
            <>
                <Navbar />
                <main className="container mx-auto px-4 pt-24 flex justify-center">
                    <Card className="w-full max-w-md">
                        <CardHeader className="text-center">
                            <CardTitle className="flex flex-col items-center gap-2">
                                <Users className="h-10 w-10 text-muted-foreground" />
                                <span>{t('community.create.restriction_title')}</span>
                            </CardTitle>
                            <CardDescription>
                                {t('community.create.restriction_desc')}
                                <br />
                                {t('community.create.current_rep')} {user.karma}
                            </CardDescription>
                        </CardHeader>
                    </Card>
                </main>
            </>
        );
    }

    return (
        <>
            <Navbar />
            <main className="container mx-auto px-4 pt-24">
                <div className="max-w-2xl mx-auto">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('community.create.title')}</CardTitle>
                            <CardDescription>
                                {t('community.create.subtitle')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form
                                onSubmit={form.handleSubmit((data) => createCommunityMutation.mutate(data))}
                                className="space-y-6"
                            >
                                <div className="space-y-2">
                                    <Label htmlFor="name">{t('community.create.name_label')}</Label>
                                    <Input
                                        id="name"
                                        placeholder={t('community.create.name_placeholder')}
                                        {...form.register("name")}
                                    />
                                    {form.formState.errors.name && (
                                        <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="description">{t('community.create.desc_label')}</Label>
                                    <Textarea
                                        id="description"
                                        placeholder={t('community.create.desc_placeholder')}
                                        rows={4}
                                        {...form.register("description")}
                                    />
                                    {form.formState.errors.description && (
                                        <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="imageUrl">{t('community.create.image_label')}</Label>
                                    <Input
                                        id="imageUrl"
                                        placeholder="https://..."
                                        {...form.register("imageUrl")}
                                    />
                                </div>

                                <div className="space-y-3">
                                    <Label>{t('community.create.allowed_feeds_label')}</Label>
                                    <div className="flex gap-4">
                                        <div className="flex items-center space-x-2">
                                            <input
                                                type="checkbox"
                                                id="cat-news"
                                                value="news"
                                                defaultChecked
                                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                onChange={(e) => {
                                                    const current = form.getValues("allowedCategories")?.split(',') || ["news", "entertainment", "discussion"];
                                                    let newCats;
                                                    if (e.target.checked) {
                                                        newCats = [...current, "news"];
                                                    } else {
                                                        newCats = current.filter(c => c !== "news");
                                                    }
                                                    form.setValue("allowedCategories", newCats.join(','));
                                                }}
                                            />
                                            <Label htmlFor="cat-news" className="font-normal">{t('feed.news')}</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <input
                                                type="checkbox"
                                                id="cat-entertainment"
                                                value="entertainment"
                                                defaultChecked
                                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                onChange={(e) => {
                                                    const current = form.getValues("allowedCategories")?.split(',') || ["news", "entertainment", "discussion"];
                                                    let newCats;
                                                    if (e.target.checked) {
                                                        newCats = [...current, "entertainment"];
                                                    } else {
                                                        newCats = current.filter(c => c !== "entertainment");
                                                    }
                                                    form.setValue("allowedCategories", newCats.join(','));
                                                }}
                                            />
                                            <Label htmlFor="cat-entertainment" className="font-normal">{t('feed.entertainment')}</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <input
                                                type="checkbox"
                                                id="cat-discussion"
                                                value="discussion"
                                                defaultChecked
                                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                onChange={(e) => {
                                                    const current = form.getValues("allowedCategories")?.split(',') || ["news", "entertainment", "discussion"];
                                                    let newCats;
                                                    if (e.target.checked) {
                                                        newCats = [...current, "discussion"];
                                                    } else {
                                                        newCats = current.filter(c => c !== "discussion");
                                                    }
                                                    form.setValue("allowedCategories", newCats.join(','));
                                                }}
                                            />
                                            <Label htmlFor="cat-discussion" className="font-normal">{t('community.page.tabs.discussion')}</Label>
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{t('community.create.feed_hint')}</p>
                                </div>

                                <Button
                                    type="submit"
                                    disabled={createCommunityMutation.isPending}
                                    className="w-full"
                                >
                                    {createCommunityMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : (
                                        t('community.create.submit')
                                    )}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </>
    );
}
