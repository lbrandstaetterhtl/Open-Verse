import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { 
  Settings, 
  Users, 
  Shield, 
  Mail, 
  Palette, 
  Save, 
  RotateCcw,
  Eye,
  EyeOff,
  AlertTriangle,
  Globe,
  Lock,
  MessageSquare,
  Search,
  CheckCircle2,
  Clock
} from "lucide-react";
import { format } from "date-fns";
import { AdminLayout } from "@/components/admin/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { type AdminSetting } from "@shared/schema";

/* FEATURE [AS-007]: Admin Settings – Frontend implementation. */
const CATEGORIES = [
  { id: "general", label: "General", icon: Globe, description: "Core site identification and status." },
  { id: "users", label: "Users", icon: Users, description: "Authentication and member management." },
  { id: "content", label: "Content", icon: MessageSquare, description: "Posting and moderation rules." },
  { id: "email", label: "Email", icon: Mail, description: "SMTP and notification delivery." },
  { id: "security", label: "Security", icon: Shield, description: "Access control and protection." },
  { id: "appearance", label: "Appearance", icon: Palette, description: "Themes and visual branding." },
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
      toast({ title: t("common.success"), description: "Setting updated successfully." });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
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
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <Settings className="h-8 w-8 text-primary" />
            Admin Settings
          </h2>
          <p className="text-muted-foreground font-medium">Configure global system behavior and interface defaults.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Category Sidebar */}
          <div className="lg:col-span-3 space-y-2">
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search settings..." 
                className="pl-10 bg-card border-none h-10 shadow-sm"
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
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all border border-transparent",
                    activeCategory === cat.id 
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 -translate-x-1" 
                      : "text-muted-foreground hover:bg-card hover:border-muted hover:text-foreground"
                  )}
                >
                  <cat.icon className="h-4 w-4" />
                  {cat.label}
                  {activeCategory === cat.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-foreground/40" />}
                </button>
              ))}
            </nav>
          </div>

          {/* Settings Content */}
          <div className="lg:col-span-9 space-y-6">
             <div className="mb-6">
                <h3 className="text-xl font-black tracking-tight mb-1">{CATEGORIES.find(c => c.id === activeCategory)?.label}</h3>
                <p className="text-sm text-muted-foreground font-medium">{CATEGORIES.find(c => c.id === activeCategory)?.description}</p>
             </div>

             <div className="space-y-4">
               {isLoading ? (
                 [...Array(3)].map((_, i) => (
                    <Card key={i} className="border-none shadow-sm"><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
                 ))
               ) : filteredSettings.length === 0 ? (
                 <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed rounded-3xl gap-3">
                    <div className="p-4 rounded-2xl bg-muted/50 text-muted-foreground">
                       <Search className="h-10 w-10" />
                    </div>
                    <p className="text-muted-foreground font-bold leading-tight text-center">No settings found in this category.</p>
                 </div>
               ) : (
                 filteredSettings.map((setting) => (
                   <Card key={setting.id} className="border-none shadow-sm bg-card hover:bg-card/80 transition-colors duration-300">
                     <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                          <div className="flex-1 space-y-1">
                             <div className="flex items-center gap-2">
                                <label className="text-sm font-black uppercase tracking-widest text-foreground leading-none">
                                  {setting.label}
                                </label>
                                {Boolean(setting.isSensitive) && <Badge variant="outline" className="text-[9px] font-black tracking-tighter uppercase px-1.5 py-0 h-4 bg-orange-500/10 text-orange-500 border-none">Sensitive</Badge>}
                                {Boolean(setting.isReadonly) && <Badge variant="outline" className="text-[9px] font-black tracking-tighter uppercase px-1.5 py-0 h-4 bg-muted text-muted-foreground border-none">Readonly</Badge>}
                             </div>
                             <p className="text-xs text-muted-foreground font-medium max-w-md">{setting.description || "No description provided for this configuration value."}</p>
                             <div className="flex items-center gap-4 pt-2">
                               <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full font-bold">
                                  <Clock className="h-3 w-3" />
                                  Last saved: {format(new Date(setting.updatedAt), "PP")}
                               </div>
                               <button className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline flex items-center gap-1">
                                  <RotateCcw className="h-2.5 w-2.5" /> reset
                                </button>
                             </div>
                          </div>
                          
                          <div className="shrink-0 flex items-center justify-end">
                             {Boolean(setting.isReadonly) ? (
                               <div className="bg-muted p-2 rounded px-4 text-xs font-mono font-bold text-muted-foreground border italic">
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
                <div className="mt-12 p-6 rounded-3xl border-2 border-red-500/20 bg-red-500/5 space-y-4">
                  <div className="flex items-center gap-3 text-red-500">
                    <AlertTriangle className="h-6 w-6" />
                    <h4 className="text-lg font-black tracking-tight">System Security Danger Zone</h4>
                  </div>
                  <p className="text-sm text-red-500/80 font-medium">Changes here affect authentication and global access controls. Verify settings before applying.</p>
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
  const [localValue, setLocalValue] = useState<string>(setting.value || "");
  const isDirty = localValue !== setting.value;

  if (setting.valueType === "boolean") {
    return (
      <div className="flex items-center gap-4">
         <Switch 
          checked={setting.value === "true"} 
          onCheckedChange={(checked) => updateMutation.mutate({ id: setting.id, value: checked.toString() })}
        />
        <span className="text-xs font-bold text-muted-foreground uppercase">{setting.value === "true" ? "Enabled" : "Disabled"}</span>
      </div>
    );
  }

  if (setting.valueType === "text") {
    return (
      <div className="flex flex-col gap-2 w-full max-w-xl">
        <Textarea 
           className="bg-muted/50 border-none min-h-[100px]"
           value={localValue}
           onChange={(e) => setLocalValue(e.target.value)}
        />
        {isDirty && (
          <Button size="sm" className="w-fit gap-2 h-8" onClick={() => updateMutation.mutate({ id: setting.id, value: localValue })}>
            <Save className="h-3 w-3" /> Save Changes
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
          className="bg-muted/50 border-none h-10 pr-10"
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
            <Save className="h-3 w-3" /> Save Changes
          </Button>
      )}
    </div>
  );
}
