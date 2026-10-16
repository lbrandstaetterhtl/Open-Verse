import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AdminLayout } from "@/components/admin/admin-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Zap, 
  Square, 
  Terminal, 
  Activity, 
  History,
  ChevronRight,
  ShieldAlert,
  Cpu,
  Database,
  Globe,
  Upload,
  UserCheck,
  AlertTriangle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface LogEntry {
  message: string;
  timestamp: string;
  type?: 'info' | 'warn' | 'error' | 'success';
}

const TEST_MODULES = [
  { id: "api-endpoints", labelKey: "stress_test.modules.api_endpoints", descriptionKey: "stress_test.modules.api_endpoints_desc", label: "API Load", icon: Globe, description: "Floods REST endpoints with concurrent HTTP traffic." },
  { id: "database-connections", labelKey: "stress_test.modules.database_connections", descriptionKey: "stress_test.modules.database_connections_desc", label: "Database Stress", icon: Database, description: "Concurrent Drizzle/SQLite query pressure." },
  { id: "websocket-flood", labelKey: "stress_test.modules.websocket_flood", descriptionKey: "stress_test.modules.websocket_flood_desc", label: "WebSocket Flood", icon: Activity, description: "Rapid connection establishment and message bursts." },
  { id: "file-upload", labelKey: "stress_test.modules.file_upload", descriptionKey: "stress_test.modules.file_upload_desc", label: "File I/O", icon: Upload, description: "Multipart file upload processing and disk pressure." },
  { id: "authentication", labelKey: "stress_test.modules.authentication", descriptionKey: "stress_test.modules.authentication_desc", label: "Auth (Bcrypt)", icon: UserCheck, description: "Heavy Bcrypt computational cycles (Login/Register)." },
  { id: "memory-leak", labelKey: "stress_test.modules.memory_leak", descriptionKey: "stress_test.modules.memory_leak_desc", label: "Memory Pressure", icon: ShieldAlert, description: "Heap allocation monitoring and RSS tracking." },
  { id: "cpu-intensive", labelKey: "stress_test.modules.cpu_intensive", descriptionKey: "stress_test.modules.cpu_intensive_desc", label: "CPU Burn", icon: Cpu, description: "Math-heavy blocking loops to monitor event loop lag." },
  { id: "concurrent-users", labelKey: "stress_test.modules.concurrent_users", descriptionKey: "stress_test.modules.concurrent_users_desc", label: "User Sessions", icon: Zap, description: "Scripted multi-step user flows (Register -> Post)." },
  { id: "all", labelKey: "stress_test.modules.all", descriptionKey: "stress_test.modules.all_desc", label: "Full Suite", icon: Zap, description: "Sequential execution of all available stress tests.", primary: true },
];

export default function StressTestPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [intensity, setIntensity] = useState<"low" | "medium" | "high" | "extreme">("medium");
  const [duration] = useState(30);
  const [currentModule, setCurrentModule] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  if (!hasPermission("stress_test")) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
          <div className="ov-cut-2 flex h-16 w-16 items-center justify-center bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="text-center">
            <h2 className="font-display text-xl font-semibold">{t("stress_test.access_restricted", "Access Restricted")}</h2>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">{t("stress_test.access_restricted_desc", "You do not have the required permissions to execute system stress tests.")}</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const scrollToBottom = () => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  const startTest = (moduleId: string) => {
    if (isRunning) return;

    setLogs([]);
    setIsRunning(true);
    setCurrentModule(moduleId);
    
    toast({ 
      title: t("stress_test.toast_started", "Stress test initiated"), 
      description: t("stress_test.toast_started_desc", { module: moduleId, intensity: t(`stress_test.intensity.${intensity}`, intensity), defaultValue: "Starting {{module}} with {{intensity}} intensity." }) 
    });

    const startStreaming = async () => {
      try {
        const response = await fetch(`/api/security/stress-test/${moduleId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intensity, duration })
        });

        if (!response.ok) throw new Error("Failed to start stress test.");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No readable stream available.");

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            if (part.startsWith('data: ')) {
              const data = JSON.parse(part.slice(6));
              if (data.message) {
                setLogs(prev => [...prev, { 
                  message: data.message, 
                  timestamp: data.timestamp || new Date().toISOString() 
                }]);
              }
              if (data.complete) {
                setIsRunning(false);
                toast({ title: t("stress_test.toast_complete", "Test complete"), description: t("stress_test.toast_complete_desc", "The stress test finished successfully.") });
              }
              if (data.error) {
                setLogs(prev => [...prev, { 
                  message: `\n❌ ${t("stress_test.log_error", { error: data.error, defaultValue: "ERROR: {{error}}" })}`, 
                  timestamp: new Date().toISOString(),
                  type: 'error'
                }]);
                setIsRunning(false);
                toast({ title: t("stress_test.toast_failed", "Test failed"), description: data.error, variant: "destructive" });
              }
            }
          }
        }
      } catch (err: any) {
        setLogs(prev => [...prev, { 
          message: `\n❌ ${t("stress_test.log_system_error", { error: err.message, defaultValue: "System error: {{error}}" })}`, 
          timestamp: new Date().toISOString(),
          type: 'error'
        }]);
        setIsRunning(false);
      }
    };

    startStreaming();
  };

  const killTest = () => {
    // In a real app, we'd send a SIGNAL to the server. 
    // For now, closing the stream will let the backend clean up if it monitors 'close'.
    window.location.reload(); // Hard reset for safety
  };

  return (
    <AdminLayout>
      <div className="space-y-8 animate-in fade-in duration-500 pb-12">
        <PageHeader
          eyebrow={t("security.eyebrow", "Admin / Security")}
          title="Osiris Stress Forge"
          description={t("stress_test.description", "Verify platform resilience under extreme load conditions.")}
          actions={
            <div className="flex items-center gap-1 rounded-pill border border-border bg-card p-1">
              {(["low", "medium", "high", "extreme"] as const).map((lvl) => (
                <Button
                  key={lvl}
                  variant={intensity === lvl && lvl === "extreme" ? "destructive" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-8 px-4 capitalize",
                    intensity === lvl && lvl !== "extreme" && "ov-tab-active"
                  )}
                  onClick={() => setIntensity(lvl)}
                >
                  {t(`stress_test.intensity.${lvl}`, lvl)}
                </Button>
              ))}
            </div>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Controllers */}
          <div className="lg:col-span-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-primary" />
                  {t("stress_test.test_modules", "Test modules")}
                </CardTitle>
                <CardDescription className="text-xs">{t("stress_test.test_modules_desc", "Select a specific area of the platform to pressure test.")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {TEST_MODULES.map((module) => (
                  <button
                    key={module.id}
                    disabled={isRunning}
                    onClick={() => startTest(module.id)}
                    className={cn(
                      "ov-panel ov-panel-hover w-full text-left p-4 group overflow-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-0",
                      currentModule === module.id && isRunning && "ov-panel-active",
                      isRunning && currentModule !== module.id && "opacity-50 grayscale cursor-not-allowed"
                    )}
                  >
                    <div className="flex items-center gap-4 relative z-10">
                      <div className={cn(
                        "ov-cut rounded-sm p-2.5 transition-colors",
                        module.primary ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-primary"
                      )}>
                        <module.icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold">{t(module.labelKey, module.label)}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">{t(module.descriptionKey, module.description)}</div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                    </div>
                    {currentModule === module.id && isRunning && (
                      <div className="absolute bottom-0 left-0 h-1 bg-primary animate-progress-indefinite w-full" />
                    )}
                  </button>
                ))}
              </CardContent>
            </Card>

            {isRunning && (
              <Button 
                variant="destructive" 
                className="w-full h-12 gap-3"
                onClick={killTest}
              >
                <Square className="h-5 w-5 fill-current" />
                {t("stress_test.kill_test", "Kill active test")}
              </Button>
            )}
          </div>

          {/* Terminal Output */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <Card className="ov-panel-solid font-data text-[12px] text-foreground/85 flex-1 min-h-[600px] flex flex-col overflow-hidden group">
              <div className="ov-rule bg-muted/40 px-4 py-2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5 mr-3">
                    <div className="h-2 w-2 rounded-full bg-destructive/70" />
                    <div className="h-2 w-2 rounded-full bg-star/70" />
                    <div className="h-2 w-2 rounded-full bg-primary/70" />
                  </div>
                  <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-data text-[11px] text-muted-foreground">osiris_stress_forge@system: ~{isRunning ? '/running' : '/idle'}</span>
                </div>
                {isRunning && (
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="ov-label text-primary">{t("stress_test.live_stream_active", "Live stream active")}</span>
                  </div>
                )}
              </div>
              
              <CardContent className="p-6 overflow-y-auto scrollbar-thin flex-1 space-y-1 font-data leading-relaxed">
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4 opacity-60 select-none">
                    <Terminal className="h-16 w-16" />
                    <p className="text-sm font-semibold">{t("stress_test.empty", "Select a module to begin the forge process")}</p>
                  </div>
                ) : (
                  logs.map((log, idx) => (
                    <div key={idx} className={cn(
                      "flex gap-4 group/line",
                      log.type === 'error' ? "text-destructive" : ""
                    )}>
                      <span className="text-muted-foreground/70 shrink-0 select-none">[{idx.toString().padStart(3, '0')}]</span>
                      <span className="whitespace-pre-wrap">{log.message}</span>
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </CardContent>

              {/* Status Overlay */}
              {!isRunning && logs.length > 0 && (
                <div className="absolute inset-0 bg-background/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="ov-panel ov-panel-solid px-6 py-3 flex items-center gap-4">
                    <History className="h-5 w-5 text-primary" />
                    <span className="font-sans text-sm font-semibold text-foreground">{t("stress_test.session_complete", "Test log session complete")}</span>
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setLogs([])}>{t("stress_test.clear", "Clear")}</Button>
                  </div>
                </div>
              )}
            </Card>

            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4 flex flex-col items-center gap-2">
                  <span className="ov-label">{t("stress_test.stability_score", "Stability score")}</span>
                  <span className="ov-data text-xl font-semibold">{logs.length > 0 ? (logs.some(l => l.type === 'error') ? t("stress_test.degraded", "DEGRADED") : t("stress_test.nominal", "NOMINAL")) : "—"}</span>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex flex-col items-center gap-2">
                  <span className="ov-label">{t("stress_test.metrics_captured", "Metrics captured")}</span>
                  <span className="ov-data text-xl font-semibold">{logs.length}</span>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex flex-col items-center gap-2">
                  <span className="ov-label">{t("stress_test.system_status", "System status")}</span>
                  <span className="ov-chip ov-chip-success font-data text-sm font-semibold">
                    <Activity className="h-4 w-4" /> {t("stress_test.live", "LIVE")}
                  </span>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
