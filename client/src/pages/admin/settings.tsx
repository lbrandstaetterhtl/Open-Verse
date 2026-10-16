import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Users, Shield, Mail, Palette, Save, RotateCcw, Eye, EyeOff, AlertTriangle, Globe, Search, Clock, FileText } from "lucide-react";
import { format } from "date-fns";
import { AdminLayout } from "@/components/admin/admin-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { type AdminSetting } from "@shared/schema";

/* FEATURE [AS-007]: Admin Settings – Frontend implementation. */
const CATEGORIES = [
  { id: "general", labelKey: "admin_settings.categories.general", label: "General", icon: Globe, descriptionKey: "admin_settings.categories.general_desc", description: "Core site identification and status." },
  { id: "users", labelKey: "admin_settings.categories.users", label: "Users", icon: Users, descriptionKey: "admin_settings.categories.users_desc", description: "Authentication and member management." },
  { id: "content", labelKey: "admin_settings.categories.content", label: "Content", icon: FileText, descriptionKey: "admin_settings.categories.content_desc", description: "Posting and moderation rules." },
  { id: "email", labelKey: "admin_settings.categories.email", label: "Email", icon: Mail, descriptionKey: "admin_settings.categories.email_desc", description: "SMTP and notification delivery." },
  { id: "security", labelKey: "admin_settings.categories.security", label: "Security", icon: Shield, descriptionKey: "admin_settings.categories.security_desc", description: "Access control and protection." },
  { id: "appearance", labelKey: "admin_settings.categories.appearance", label: "Appearance", icon: Palette, descriptionKey: "admin_settings.categories.appearance_desc", description: "Themes and visual branding." },
];

export default function AdminSettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState("general");
  const [search, setSearch] = useState("");
  const [showSensitive, setShowSensitive] = useState<Record<number, boolean>>({});

  const { data: settings, isLoading } = useQuery<AdminSetting[]>({
    queryKey: ["/api/admin/settings"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, value }: { id: number; value: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/settings/${id}`, { value });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: t("common.success", "Success"), description: t("admin_settings.update_success", "Setting updated successfully.") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error", "An error occurred"), description: error.message, variant: "destructive" });
    }
  });

  const filteredSettings = useMemo(() => {
    if (!settings) return [];
    return settings.filter(s => {
      const matchesCategory = s.category === activeCategory;
      const matchesSearch = s.label.toLowerCase().includes(search.toLowerCase()) || 
                           s.description?.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && (search ? matchesSearch : true);
    });
  }, [settings, activeCategory, search]);  const toggleSensitive = (id: number) => {
    setShowSensitive(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <AdminLayout>
      <div className="space-y-8 animate-in fade-in duration-500 pb-12">
        <PageHeader
          eyebrow={t("admin.settings_eyebrow", "Admin / Settings")}
          title={t("admin_settings.title", "Admin Settings")}
          description={t("admin_settings.description", "Configure global system behavior and interface defaults.")}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Category Sidebar */}
          <div className="lg:col-span-3 space-y-2">
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder={t("admin_settings.search_placeholder", "Search settings…")}
                className="h-10 pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <nav className="space-y-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-sm text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-0",
                    activeCategory === cat.id 
                      ? "ov-nav-active ov-cut" 
                      : "text-muted-foreground hover:bg-card hover:text-foreground"
                  )}
                >
                  <cat.icon className="h-4 w-4" />
                  {t(cat.labelKey, cat.label)}
                  {activeCategory === cat.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                </button>
              ))}
            </nav>
          </div>

          {/* Settings Content */}
          <div className="lg:col-span-9 space-y-6">
             <div className="mb-6">
                <h3 className="font-display text-xl font-semibold mb-1">{(() => { const cat = CATEGORIES.find(c => c.id === activeCategory); return cat ? t(cat.labelKey, cat.label) : null; })()}</h3>
                <p className="text-sm text-muted-foreground font-medium">{(() => { const cat = CATEGORIES.find(c => c.id === activeCategory); return cat ? t(cat.descriptionKey, cat.description) : null; })()}</p>
             </div>

             <div className="space-y-4">
               {isLoading ? (
                 [...Array(3)].map((_, i) => (
                    <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
                 ))
               ) : filteredSettings.length === 0 ? (
                 <div className="ov-panel h-64 flex flex-col items-center justify-center gap-3">
                    <div className="ov-cut-2 p-4 bg-muted/50 text-muted-foreground">
                       <Search className="h-10 w-10" />
                    </div>
                    <p className="text-muted-foreground font-semibold leading-tight text-center">{t("admin_settings.empty", "No settings found in this category.")}</p>
                 </div>
               ) : (
                 filteredSettings.map((setting) => (
                   <Card key={setting.id}>
                     <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                          <div className="flex-1 space-y-1">
                             <div className="flex items-center gap-2">
                                <label className="text-sm font-semibold text-foreground leading-none">
                                  {setting.label}
                                </label>
                                {Boolean(setting.isSensitive) && <div className="ov-chip ov-chip-star h-5 px-2 text-[11px]">{t("admin_settings.sensitive", "Sensitive")}</div>}
                                {Boolean(setting.isReadonly) && <div className="ov-chip h-5 px-2 text-[11px]">{t("admin_settings.readonly", "Read-only")}</div>}
                             </div>
                             <p className="text-xs text-muted-foreground font-medium max-w-md">{setting.description || t("admin_settings.no_description", "No description provided for this configuration value.")}</p>
                             <div className="flex items-center gap-4 pt-2">
                               <div className="ov-chip h-6 px-2 text-[11px]">
                                  <Clock className="h-3 w-3" />
                                  {t("admin_settings.last_saved", "Last saved:")} <span className="font-data">{format(new Date(setting.updatedAt), "PP")}</span>
                               </div>
                               <button className="text-xs font-semibold capitalize text-primary hover:underline flex items-center gap-1">
                                  <RotateCcw className="h-2.5 w-2.5" /> {t("admin_settings.reset", "reset")}
                                </button>
                             </div>
                          </div>
                          
                          <div className="shrink-0 flex items-center justify-end">
                             {setting.isReadonly ? (
                               <div className="bg-muted py-2 px-4 rounded-sm border border-border font-data text-xs font-semibold text-muted-foreground">
                                 {setting.value}
                                </div>
                             ) : (
                               <SettingControl 
                                 setting={setting} 
                                 updateMutation={updateMutation}
                                 showSensitive={showSensitive}
                                 toggleSensitive={toggleSensitive}
                               />
                             )}
                          </div>
                        </div>
                     </CardContent>
                   </Card>
                 ))
               )}
             </div>

             {/* Danger Zone */}
             {activeCategory === "security" && (
                <div className="ov-panel mt-12 p-6 space-y-4 bg-destructive/5 [--ov-line:hsl(var(--destructive)/0.4)]">
                  <div className="flex items-center gap-3 text-destructive">
                    <AlertTriangle className="h-6 w-6" />
                    <h4 className="font-display text-lg font-semibold">{t("admin_settings.danger_zone_title", "System Security Danger Zone")}</h4>
                  </div>
                  <p className="text-sm text-destructive/80">{t("admin_settings.danger_zone_desc", "Changes here affect authentication and global access controls. Verify settings before applying.")}</p>
                </div>
             )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

interface SettingControlProps {
  setting: AdminSetting;
  updateMutation: any;
  showSensitive: Record<number, boolean>;
  toggleSensitive: (id: number) => void;
}

function SettingControl({ setting, updateMutation, showSensitive, toggleSensitive }: SettingControlProps) {
  const { t } = useTranslation();
  const [localValue, setLocalValue] = useState<string>(setting.value || "");
  const isDirty = localValue !== setting.value;

  if (setting.valueType === "boolean") {
    return (
      <div className="flex items-center gap-4">
         <Switch 
          checked={setting.value === "true"} 
          onCheckedChange={(checked) => updateMutation.mutate({ id: setting.id, value: checked.toString() })}
        />
        <span className="ov-label">{setting.value === "true" ? t("admin_settings.enabled", "Enabled") : t("admin_settings.disabled", "Disabled")}</span>
      </div>
    );
  }

  if (setting.valueType === "text") {
    return (
      <div className="flex flex-col gap-2 w-full max-w-xl">
        <Textarea 
           className="min-h-[100px]"
           value={localValue}
           onChange={(e) => setLocalValue(e.target.value)}
        />
        {isDirty && (
          <Button size="sm" className="w-fit gap-2 h-8" onClick={() => updateMutation.mutate({ id: setting.id, value: localValue })}>
            <Save className="h-3 w-3" /> {t("admin_settings.save_changes", "Save changes")}
          </Button>
        )}
      </div>
    );
  }

  const isSensitive = Boolean(setting.isSensitive);
  const isShowing = showSensitive[setting.id];

  return (
     <div className="flex flex-col gap-2 w-full max-w-xl">
      <div className="relative group/control">
        <Input 
          type={isSensitive && !isShowing ? "password" : "text"}
          className="h-10 pr-10"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
        />
        {isSensitive ? (
          <button 
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
            onClick={() => toggleSensitive(setting.id)}
          >
            {isShowing ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
      {isDirty && (
          <Button size="sm" className="w-fit gap-2 h-8" onClick={() => updateMutation.mutate({ id: setting.id, value: localValue })}>
            <Save className="h-3 w-3" /> {t("admin_settings.save_changes", "Save changes")}
          </Button>
      )}
    </div>
  );
}
