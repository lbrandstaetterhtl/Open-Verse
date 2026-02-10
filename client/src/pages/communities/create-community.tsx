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

export default function CreateCommunityPage() {
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const { user } = useAuth();

    const form = useForm<InsertCommunity>({
        resolver: zodResolver(insertCommunitySchema),
        defaultValues: {
            name: "",
            description: "",
            imageUrl: "",
        },
    });

    const createCommunityMutation = useMutation({
        mutationFn: async (data: InsertCommunity) => {
            const res = await apiRequest("POST", "/api/communities", data);
            return res.json();
        },
        onSuccess: (community) => {
            queryClient.invalidateQueries({ queryKey: ["/api/communities"] });
            toast({
                title: "Community Created",
                description: `Welcome to ${community.name}!`,
            });
            setLocation(`/c/${community.slug}`);
        },
        onError: (error: Error) => {
            toast({
                title: "Error",
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
                                <span>Restriction</span>
                            </CardTitle>
                            <CardDescription>
                                You need at least 200 reputation to create a community.
                                <br />
                                Your current reputation: {user.karma}
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
                            <CardTitle>Create a Community</CardTitle>
                            <CardDescription>
                                Build a space for people to share and discuss common interests.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form
                                onSubmit={form.handleSubmit((data) => createCommunityMutation.mutate(data))}
                                className="space-y-6"
                            >
                                <div className="space-y-2">
                                    <Label htmlFor="name">Community Name</Label>
                                    <Input
                                        id="name"
                                        placeholder="e.g. Coffee Lovers, Tech News"
                                        {...form.register("name")}
                                    />
                                    {form.formState.errors.name && (
                                        <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="description">Description</Label>
                                    <Textarea
                                        id="description"
                                        placeholder="What is this community about?"
                                        rows={4}
                                        {...form.register("description")}
                                    />
                                    {form.formState.errors.description && (
                                        <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="imageUrl">Image URL (Optional)</Label>
                                    <Input
                                        id="imageUrl"
                                        placeholder="https://..."
                                        {...form.register("imageUrl")}
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    disabled={createCommunityMutation.isPending}
                                    className="w-full"
                                >
                                    {createCommunityMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : (
                                        "Create Community"
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
