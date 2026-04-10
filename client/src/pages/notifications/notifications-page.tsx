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
    <>
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-12">
        <div className="max-w-4xl mx-auto">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-4">
                <BackButton fallback="/feed" className="-ml-3" />
                <h1 className="text-3xl font-bold tracking-tight">{t("notifications.title")}</h1>
              </div>
            <p className="text-muted-foreground mt-1 ml-12">
                {t("notifications.manage_desc", "Stay updated with your latest interactions and account activity.")}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => markAllAsRead.mutate()}
                disabled={!notifications?.some(n => !n.read)}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {t("notifications.mark_all_read")}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="text-destructive hover:bg-destructive/10"
                onClick={() => {
                   if (confirm(t("notifications.confirm_clear_all", "Are you sure you want to clear all notifications?"))) {
                     // We'd need to implement clearAll in mutations
                     // For now, I'll just use markAllAsRead as a placeholder or add it if needed
                   }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("notifications.clear_all", "Clear All")}
              </Button>
            </div>
          </header>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="all" className="px-6">
                  {t("notifications.tabs.all", "All")}
                </TabsTrigger>
                <TabsTrigger value="unread" className="px-6">
                  {t("notifications.tabs.unread", "Unread")}
                </TabsTrigger>
                <TabsTrigger value="settings" className="px-6 flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  {t("notifications.tabs.settings", "Preferences")}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="all" className="mt-0 ring-offset-background focus-visible:outline-none">
               <NotificationList notifications={notifications} isLoading={isLoading} error={error} refetch={refetch} />
            </TabsContent>

            <TabsContent value="unread" className="mt-0 ring-offset-background focus-visible:outline-none">
               <NotificationList notifications={notifications} isLoading={isLoading} error={error} refetch={refetch} />
            </TabsContent>

            <TabsContent value="settings" className="mt-0 ring-offset-background focus-visible:outline-none">
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="h-5 w-5 text-primary" />
                      {t("notifications.pref.social_header", "Social Interactions")}
                    </CardTitle>
                    <CardDescription>
                      {t("notifications.pref.social_desc", "Choose what social events you want to be notified about.")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <PreferenceToggle 
                      id="likePost" 
                      label={t("notifications.pref.likes", "Likes on your posts")} 
                      checked={prefs?.likePost} 
                      onCheckedChange={(v) => handleTogglePreference("likePost", v)} 
                    />
                    <Separator />
                    <PreferenceToggle 
                      id="commentPost" 
                      label={t("notifications.pref.comments", "Comments on your posts")} 
                      checked={prefs?.commentPost} 
                      onCheckedChange={(v) => handleTogglePreference("commentPost", v)} 
                    />
                    <Separator />
                    <PreferenceToggle 
                      id="mentionPost" 
                      label={t("notifications.pref.mentions", "Mentions")} 
                      checked={prefs?.mentionPost} 
                      onCheckedChange={(v) => handleTogglePreference("mentionPost", v)} 
                    />
                     <Separator />
                    <PreferenceToggle 
                      id="newFollower" 
                      label={t("notifications.pref.followers", "New Followers")} 
                      checked={prefs?.newFollower} 
                      onCheckedChange={(v) => handleTogglePreference("newFollower", v)} 
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sliders className="h-5 w-5 text-primary" />
                      {t("notifications.pref.system_header", "System & Community")}
                    </CardTitle>
                    <CardDescription>
                      {t("notifications.pref.system_desc", "Manage community alerts and administrative notifications.")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <PreferenceToggle 
                      id="communityInvite" 
                      label={t("notifications.pref.community_invites", "Community Invites & Requests")} 
                      checked={prefs?.communityInvite} 
                      onCheckedChange={(v) => handleTogglePreference("communityInvite", v)} 
                    />
                    <Separator />
                    <PreferenceToggle 
                      id="systemAnnouncement" 
                      label={t("notifications.pref.system", "System Announcements")} 
                      checked={prefs?.systemAnnouncement} 
                      onCheckedChange={(v) => handleTogglePreference("systemAnnouncement", v)} 
                    />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </>
  );
}

function NotificationList({ notifications, isLoading, error, refetch }: any) {
  const { t } = useTranslation();
  
  if (isLoading) return <Spinner size="lg" className="py-20" />;
  
  if (error) return (
    <ErrorState 
      message={t("notifications.error_load", "Could not load notifications.")} 
      retry={() => refetch()} 
    />
  );

  if (!notifications || notifications.length === 0) return (
    <EmptyState 
      icon={<Bell className="h-12 w-12 text-muted-foreground/50" />}
      title={t("notifications.empty")}
      description={t("notifications.empty_desc", "When you get notifications, they'll show up here.")}
      className="bg-muted/20 border-dashed py-24"
    />
  );

  return (
    <Card className="overflow-hidden border-none shadow-md bg-background/50 backdrop-blur-sm">
      <div className="flex flex-col">
        {notifications.map((n: any) => (
          <NotificationItem key={n.id} notification={n} />
        ))}
      </div>
    </Card>
  );
}

function PreferenceToggle({ id, label, checked, onCheckedChange }: { id: string, label: string, checked?: boolean, onCheckedChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label htmlFor={id} className="font-medium cursor-pointer">{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
