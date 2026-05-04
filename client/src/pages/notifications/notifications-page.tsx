import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navbar } from "@/components/layout/navbar";
import { useNotifications, useNotificationCounts, useNotificationMutations, useNotificationPreferences } from "@/hooks/use-notifications";
import { NotificationItem } from "@/components/notifications/notification-item";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BackButton } from "@/components/ui/back-button";
import { Bell, CheckCircle2, Settings2, Trash2, Sliders } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function NotificationsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("all");

  const { data: notifications, isLoading, error, refetch } = useNotifications({ 
    unreadOnly: activeTab === "unread" 
  });
  const { markAllAsRead, deleteAllNotifications } = useNotificationMutations();
  const { data: prefs, updatePreferences } = useNotificationPreferences();

  const handleTogglePreference = (key: string, value: boolean) => {
    updatePreferences.mutate({ [key]: value });
  };

  return (
    <PageTransition>
      {/* Sticky Top Header – Glass Effect */}
      <header className="sticky top-14 z-40 w-full glass-premium border-b border-border/40">
        <div className="max-w-[680px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
             <BackButton fallback="/feed" className="-ml-2 h-9 w-9 rounded-full" />
             <h1 className="text-base md:text-lg font-black tracking-tight uppercase">
                {t("notifications.title")}
             </h1>
          </div>
          
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => markAllAsRead.mutate()}
              disabled={!notifications?.some(n => !n.read)}
              className="h-9 w-9 p-0 rounded-full hover:bg-primary/10 hover:text-primary transition-all active:scale-90"
              title={t("notifications.mark_all_read")}
            >
              <CheckCircle2 className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => deleteAllNotifications.mutate()}
              className="h-9 w-9 p-0 rounded-full hover:bg-destructive/10 hover:text-destructive transition-all active:scale-90"
              title={t("notifications.clear_all")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="w-full">
        <div className="max-w-[680px] mx-auto border-x border-border/40 min-h-screen bg-card/5 md:bg-background">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="border-b border-border/40 bg-background/50">
               <TabsList className="w-full justify-start h-12 bg-transparent p-0 rounded-none overflow-x-auto no-scrollbar">
                  <TabsTrigger 
                    value="all" 
                    className="flex-1 h-12 rounded-none bg-transparent data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none font-bold text-xs uppercase tracking-widest"
                  >
                    {t("notifications.tabs.all", "Alle")}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="unread" 
                    className="flex-1 h-12 rounded-none bg-transparent data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none font-bold text-xs uppercase tracking-widest"
                  >
                    {t("notifications.tabs.unread", "Ungelesen")}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="settings" 
                    className="flex-1 h-12 rounded-none bg-transparent data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none font-bold text-xs uppercase tracking-widest"
                  >
                    <Settings2 className="h-4 w-4" />
                  </TabsTrigger>
               </TabsList>
            </div>

            <div className="relative min-h-[400px]">
              <TabsContent value="all" className="m-0 border-none">
                 <NotificationList notifications={notifications} isLoading={isLoading} error={error} refetch={refetch} />
              </TabsContent>

              <TabsContent value="unread" className="m-0 border-none">
                 <NotificationList notifications={notifications} isLoading={isLoading} error={error} refetch={refetch} />
              </TabsContent>

              <TabsContent value="settings" className="m-0 p-4 animate-scale-in">
                <div className="space-y-6">
                  <div className="p-4 rounded-2xl bg-muted/20 border border-border/40 space-y-4">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                       <Bell className="h-4 w-4 text-primary" />
                       {t("notifications.pref.social_header")}
                    </h3>
                    <div className="space-y-4">
                      <PreferenceToggle 
                        id="likePost" 
                        label={t("notifications.pref.likes")} 
                        checked={prefs?.likePost} 
                        onCheckedChange={(v) => handleTogglePreference("likePost", v)} 
                      />
                      <PreferenceToggle 
                        id="commentPost" 
                        label={t("notifications.pref.comments")} 
                        checked={prefs?.commentPost} 
                        onCheckedChange={(v) => handleTogglePreference("commentPost", v)} 
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </main>
    </PageTransition>
  );
}

function NotificationList({ notifications, isLoading, error, refetch }: any) {
  const { t } = useTranslation();
  
  if (isLoading) return <div className="p-10 flex justify-center"><Spinner size="lg" /></div>;
  
  if (error) return (
    <div className="p-8">
      <ErrorState 
        message={t("notifications.error_load")} 
        retry={() => refetch()} 
      />
    </div>
  );

  if (!notifications || notifications.length === 0) return (
    <div className="p-20 text-center animate-scale-in">
      <Bell className="h-16 w-16 mx-auto text-muted-foreground/20 mb-4" />
      <h2 className="text-xl font-bold tracking-tight">{t("notifications.empty")}</h2>
      <p className="text-sm text-muted-foreground mt-2">{t("notifications.empty_desc")}</p>
    </div>
  );

  return (
    <div className="divide-y divide-border/40">
      {notifications.map((n: any) => (
        <NotificationItem key={n.id} notification={n} />
      ))}
    </div>
  );
}

function PreferenceToggle({ id, label, checked, onCheckedChange }: { id: string, label: string, checked?: boolean, onCheckedChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label htmlFor={id} className="text-sm font-medium cursor-pointer">{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
