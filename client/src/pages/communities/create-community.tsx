import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import type { InsertCommunity } from "@shared/schema";
import { insertCommunitySchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { Users, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { BackButton } from "@/components/ui/back-button";
import { PageHeader } from "@/components/layout/page-header";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

export default function CreateCommunityPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

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
        title: t("community.create.success_title"),
        description: `Welcome to ${community.name}!`,
      });
      setLocation(`/c/${community.slug}`);
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!user) return null;

  const isPrivileged = user.role === "admin" || user.role === "owner";
  if (!isPrivileged && user.karma < 200) {
    return (
      <>
                <main className="container mx-auto px-4 pt-24 flex justify-center">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle className="flex flex-col items-center gap-2">
                <Users className="h-10 w-10 text-muted-foreground" />
                <span>{t("community.create.restriction_title")}</span>
              </CardTitle>
              <CardDescription>
                {t("community.create.restriction_desc")}
                <br />
                {t("community.create.current_rep")} {user.karma}
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
            <main className="container mx-auto px-4 pt-6 pb-24">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="max-w-2xl mx-auto"
        >
          <BackButton fallback="/feed" className="-ml-3" />
          <PageHeader
            className="mb-8 pt-3 md:pt-4"
            eyebrow={t("community.create.eyebrow", "Communities / New")}
            title={t("community.create.title")}
            description={t("community.create.subtitle")}
          />
          <Card>
            <CardContent className="p-5 md:p-6">
              <form
                onSubmit={form.handleSubmit(
                  (data) => {
                    console.log("[CreateCommunity] Submitting data:", data);
                    createCommunityMutation.mutate(data);
                  },
                  (errors) => {
                    console.error("[CreateCommunity] Validation errors:", errors);
                  }
                )}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <Label htmlFor="name">{t("community.create.name_label")}</Label>
                  <Input
                    id="name"
                    placeholder={t("community.create.name_placeholder")}
                    className="h-11"
                    {...form.register("name")}
                  />
                  {form.formState.errors.name && (
                    <p className="text-xs font-medium text-destructive">{form.formState.errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">{t("community.create.desc_label")}</Label>
                  <Textarea
                    id="description"
                    placeholder={t("community.create.desc_placeholder")}
                    rows={6}
                    className="leading-relaxed"
                    {...form.register("description")}
                  />
                  {form.formState.errors.description && (
                    <p className="text-xs font-medium text-destructive">
                      {form.formState.errors.description.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="imageUrl">{t("community.create.image_label")}</Label>
                  <Input id="imageUrl" placeholder="https://..." className="h-11" {...form.register("imageUrl")} />
                </div>

                <div className="ov-panel space-y-4 p-5">
                  <Label>{t("community.create.allowed_feeds_label")}</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex items-center space-x-3 group">
                      <input
                        type="checkbox"
                        id="cat-news"
                        value="news"
                        defaultChecked
                        className="h-4 w-4 cursor-pointer accent-primary"
                        onChange={(e) => {
                          const current = form.getValues("allowedCategories")?.split(",") || [
                            "news",
                            "entertainment",
                            "discussion",
                          ];
                          let newCats;
                          if (e.target.checked) {
                            newCats = [...current, "news"];
                          } else {
                            newCats = current.filter((c) => c !== "news");
                          }
                          form.setValue("allowedCategories", newCats.join(","));
                        }}
                      />
                      <Label htmlFor="cat-news" className="cursor-pointer text-muted-foreground transition-colors group-hover:text-foreground">
                        {t("feed.news")}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 group">
                      <input
                        type="checkbox"
                        id="cat-entertainment"
                        value="entertainment"
                        defaultChecked
                        className="h-4 w-4 cursor-pointer accent-primary"
                        onChange={(e) => {
                          const current = form.getValues("allowedCategories")?.split(",") || [
                            "news",
                            "entertainment",
                            "discussion",
                          ];
                          let newCats;
                          if (e.target.checked) {
                            newCats = [...current, "entertainment"];
                          } else {
                            newCats = current.filter((c) => c !== "entertainment");
                          }
                          form.setValue("allowedCategories", newCats.join(","));
                        }}
                      />
                      <Label htmlFor="cat-entertainment" className="cursor-pointer text-muted-foreground transition-colors group-hover:text-foreground">
                        {t("feed.entertainment")}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 group">
                      <input
                        type="checkbox"
                        id="cat-discussion"
                        value="discussion"
                        defaultChecked
                        className="h-4 w-4 cursor-pointer accent-primary"
                        onChange={(e) => {
                          const current = form.getValues("allowedCategories")?.split(",") || [
                            "news",
                            "entertainment",
                            "discussion",
                          ];
                          let newCats;
                          if (e.target.checked) {
                            newCats = [...current, "discussion"];
                          } else {
                            newCats = current.filter((c) => c !== "discussion");
                          }
                          form.setValue("allowedCategories", newCats.join(","));
                        }}
                      />
                      <Label htmlFor="cat-discussion" className="cursor-pointer text-muted-foreground transition-colors group-hover:text-foreground">
                        {t("community.page.tabs.discussion")}
                      </Label>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{t("community.create.feed_hint")}</p>
                </div>

                <div className="ov-panel space-y-2 p-5">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="isPrivate"
                      className="h-4 w-4 cursor-pointer accent-primary"
                      {...form.register("isPrivate")}
                    />
                    <Label htmlFor="isPrivate" className="cursor-pointer font-semibold">
                      {t("community.create.privacy_label")}
                    </Label>
                  </div>
                  <p className="pl-7 text-xs leading-relaxed text-muted-foreground">{t("community.create.privacy_desc")}</p>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={createCommunityMutation.isPending}
                  className="w-full"
                >
                  {createCommunityMutation.isPending ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    t("community.create.submit")
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </>
  );
}
