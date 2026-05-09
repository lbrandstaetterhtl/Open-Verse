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
import { BackButton } from "@/components/ui/back-button";
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
            <main className="container mx-auto px-4 pt-32 pb-24">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="max-w-2xl mx-auto"
        >
          <Card className="glass-premium border-white/10 shadow-2xl overflow-hidden relative group">
            <div className="absolute inset-0 nebula-banner opacity-5 group-hover:opacity-10 transition-opacity duration-1000" />
            <CardHeader className="relative z-10 p-10 pb-6 border-b border-white/5">
              <div className="flex items-center gap-6">
                <BackButton fallback="/feed" className="-ml-4 font-black uppercase tracking-widest text-[10px] opacity-60 hover:opacity-100 hover:-translate-x-2 transition-all" />
                <div className="space-y-2">
                  <CardTitle className="text-4xl font-black tracking-tighter uppercase italic italic-primary leading-none">{t("community.create.title")}</CardTitle>
                  <CardDescription className="text-sm font-medium opacity-60">{t("community.create.subtitle")}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 p-10">
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
                className="space-y-10"
              >
                <div className="space-y-3">
                  <Label htmlFor="name" className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pl-2">{t("community.create.name_label")}</Label>
                  <Input
                    id="name"
                    placeholder={t("community.create.name_placeholder")}
                    className="glass-input h-14 rounded-3xl px-6 font-bold"
                    {...form.register("name")}
                  />
                  {form.formState.errors.name && (
                    <p className="text-xs font-bold text-destructive pl-2">{form.formState.errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-3">
                  <Label htmlFor="description" className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pl-2">{t("community.create.desc_label")}</Label>
                  <Textarea
                    id="description"
                    placeholder={t("community.create.desc_placeholder")}
                    rows={6}
                    className="glass-input rounded-[2rem] p-8 font-medium leading-relaxed"
                    {...form.register("description")}
                  />
                  {form.formState.errors.description && (
                    <p className="text-xs font-bold text-destructive pl-2">
                      {form.formState.errors.description.message}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <Label htmlFor="imageUrl" className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pl-2">{t("community.create.image_label")}</Label>
                  <Input id="imageUrl" placeholder="https://..." className="glass-input h-14 rounded-3xl px-6 font-bold" {...form.register("imageUrl")} />
                </div>

                <div className="space-y-6 bg-white/5 p-8 rounded-[2rem] border border-white/5">
                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">{t("community.create.allowed_feeds_label")}</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="flex items-center space-x-3 group">
                      <input
                        type="checkbox"
                        id="cat-news"
                        value="news"
                        defaultChecked
                        className="h-5 w-5 rounded-full border-white/20 bg-white/5 text-primary focus:ring-primary/40 transition-all checked:scale-110"
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
                      <Label htmlFor="cat-news" className="text-xs font-black uppercase tracking-widest cursor-pointer opacity-60 group-hover:opacity-100 transition-opacity">
                        {t("feed.news")}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 group">
                      <input
                        type="checkbox"
                        id="cat-entertainment"
                        value="entertainment"
                        defaultChecked
                        className="h-5 w-5 rounded-full border-white/20 bg-white/5 text-primary focus:ring-primary/40 transition-all checked:scale-110"
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
                      <Label htmlFor="cat-entertainment" className="text-xs font-black uppercase tracking-widest cursor-pointer opacity-60 group-hover:opacity-100 transition-opacity">
                        {t("feed.entertainment")}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 group">
                      <input
                        type="checkbox"
                        id="cat-discussion"
                        value="discussion"
                        defaultChecked
                        className="h-5 w-5 rounded-full border-white/20 bg-white/5 text-primary focus:ring-primary/40 transition-all checked:scale-110"
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
                      <Label htmlFor="cat-discussion" className="text-xs font-black uppercase tracking-widest cursor-pointer opacity-60 group-hover:opacity-100 transition-opacity">
                        {t("community.page.tabs.discussion")}
                      </Label>
                    </div>
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 text-center">{t("community.create.feed_hint")}</p>
                </div>

                <div className="space-y-4 bg-primary/5 p-8 rounded-[2rem] border border-primary/10">
                  <div className="flex items-center space-x-4">
                    <input
                      type="checkbox"
                      id="isPrivate"
                      className="h-6 w-6 rounded-lg border-primary/20 bg-primary/5 text-primary focus:ring-primary/40 transition-all checked:scale-110"
                      {...form.register("isPrivate")}
                    />
                    <Label htmlFor="isPrivate" className="text-xs font-black uppercase tracking-widest cursor-pointer text-primary">
                      {t("community.create.privacy_label")}
                    </Label>
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 pl-10 leading-relaxed">{t("community.create.privacy_desc")}</p>
                </div>

                <Button
                  type="submit"
                  disabled={createCommunityMutation.isPending}
                  className="w-full h-16 rounded-full font-black uppercase tracking-[0.2em] text-xs shadow-2xl shadow-primary/30 nebula-glow"
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
