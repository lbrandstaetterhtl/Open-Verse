import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Bell, CheckCircle2, Settings, Trash2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/layout/page-header";

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
    <div className="w-full min-h-screen">
      <main className="max-w-3xl mx-auto px-4 md:px-6 pb-6 md:pb-10">
        <PageHeader
          eyebrow={t("notifications.eyebrow", "Account / Notifications")}
          title={t("notifications.title")}
          description={t("notifications.manage_desc")}
          className="mb-8"
          actions={
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => markAllAsRead.mutate()}
                disabled={!notifications?.some(n => !n.read)}
              >
                <CheckCircle2 className="h-4 w-4" />
                {t("notifications.mark_all_read", "All Read")}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => deleteAllNotifications.mutate()}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                {t("notifications.clear_all", "Clear")}
              </Button>
            </>
          }
        />

        <div className="ov-panel overflow-hidden p-px">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="ov-rule bg-muted/20">
               <TabsList className="w-full justify-start h-12 rounded-none bg-transparent p-1 gap-1 shadow-none">
                  <TabsTrigger 
                    value="all" 
                    className="flex-1 h-10"
                  >
                    {t("notifications.tabs.all", "All")}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="unread" 
                    className="flex-1 h-10"
                  >
                    {t("notifications.tabs.unread", "Unread")}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="settings" 
                    className="flex-1 h-10"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    {t("notifications.tabs.settings", "Settings")}
                  </TabsTrigger>
               </TabsList>
            </div>

            <div className="relative min-h-[500px]">
              <TabsContent value="all" className="m-0 border-none">
                 <NotificationList notifications={notifications} isLoading={isLoading} error={error} refetch={refetch} />
              </TabsContent>

              <TabsContent value="unread" className="m-0 border-none">
                 <NotificationList notifications={notifications} isLoading={isLoading} error={error} refetch={refetch} />
              </TabsContent>

              <TabsContent value="settings" className="m-0 p-6 md:p-8 animate-scale-in">
                <div className="space-y-8">
                  <div className="space-y-4">
                    <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                       <Bell className="h-4 w-4 text-primary" />
                       {t("notifications.pref.social_header", "Social Alerts")}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  
                  <Separator />
                  
                  <div className="ov-panel bg-primary/5 p-4">
                     <p className="text-xs text-muted-foreground leading-relaxed">
                        {t("notifications.privacy_note", "\"Your privacy is our priority. We only send notifications for the actions you choose to follow.\"")}
                     </p>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </main>
    </div>
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
    <div className="px-6 py-16 text-center animate-scale-in">
      <Bell className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
      <h2 className="font-display text-lg font-semibold">{t("notifications.empty")}</h2>
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
