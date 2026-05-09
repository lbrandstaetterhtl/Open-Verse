import { useState, useEffect, useRef } from "react";
import { AdminLayout } from "@/components/admin/admin-layout";
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
  UserCheck
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface LogEntry {
  message: string;
  timestamp: string;
  type?: 'info' | 'warn' | 'error' | 'success';
}

const TEST_MODULES = [
  { id: "api-endpoints", label: "API Load", icon: Globe, description: "Floods REST endpoints with concurrent HTTP traffic." },
  { id: "database-connections", label: "Database Stress", icon: Database, description: "Concurrent Drizzle/SQLite query pressure." },
  { id: "websocket-flood", label: "WebSocket Flood", icon: Activity, description: "Rapid connection establishment and message bursts." },
  { id: "file-upload", label: "File I/O", icon: Upload, description: "Multipart file upload processing and disk pressure." },
  { id: "authentication", label: "Auth (Bcrypt)", icon: UserCheck, description: "Heavy Bcrypt computational cycles (Login/Register)." },
  { id: "memory-leak", label: "Memory Pressure", icon: ShieldAlert, description: "Heap allocation monitoring and RSS tracking." },
  { id: "cpu-intensive", label: "CPU Burn", icon: Cpu, description: "Math-heavy blocking loops to monitor event loop lag." },
  { id: "concurrent-users", label: "User Sessions", icon: Zap, description: "Scripted multi-step user flows (Register -> Post)." },
  { id: "all", label: "Full Suite", icon: Zap, description: "Sequential execution of all available stress tests.", primary: true },
];

export default function StressTestPage() {
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
          <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-black uppercase italic tracking-tighter">Access Restricted</h2>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">You do not have the required permissions to execute system stress tests.</p>
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
      title: "Stress Test Initiated", 
      description: `Starting ${moduleId} with ${intensity} intensity.` 
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
                toast({ title: "Test Complete", description: "The stress test finished successfully." });
              }
              if (data.error) {
                setLogs(prev => [...prev, { 
                  message: `\n❌ ERROR: ${data.error}`, 
                  timestamp: new Date().toISOString(),
                  type: 'error'
                }]);
                setIsRunning(false);
                toast({ title: "Test Failed", description: data.error, variant: "destructive" });
              }
            }
          }
        }
      } catch (err: any) {
        setLogs(prev => [...prev, { 
          message: `\n❌ System Error: ${err.message}`, 
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
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <Zap className="h-8 w-8 text-primary" />
              Osiris Stress Forge
            </h2>
            <p className="text-muted-foreground font-medium">Verify platform resilience under extreme load conditions.</p>
          </div>
          
          <div className="flex items-center gap-3 bg-card p-1 rounded-2xl border shadow-sm">
            {(["low", "medium", "high", "extreme"] as const).map((lvl) => (
              <Button
                key={lvl}
                variant={intensity === lvl ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "px-4 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all h-8",
                  intensity === lvl && lvl === "extreme" && "bg-red-600 hover:bg-red-700"
                )}
                onClick={() => setIntensity(lvl)}
              >
                {lvl}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Controllers */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="border-none shadow-sm bg-card/60 backdrop-blur-md">
              <CardHeader>
                <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-primary" />
                  Test Modules
                </CardTitle>
                <CardDescription className="text-xs">Select a specific area of the platform to pressure test.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {TEST_MODULES.map((module) => (
                  <button
                    key={module.id}
                    disabled={isRunning}
                    onClick={() => startTest(module.id)}
                    className={cn(
                      "w-full text-left p-4 rounded-2xl transition-all border-2 group relative overflow-hidden",
                      currentModule === module.id && isRunning
                        ? "border-primary bg-primary/5 shadow-lg shadow-primary/5"
                        : "border-transparent bg-muted/40 hover:bg-muted hover:border-muted-foreground/20",
                      isRunning && currentModule !== module.id && "opacity-50 grayscale cursor-not-allowed"
                    )}
                  >
                    <div className="flex items-center gap-4 relative z-10">
                      <div className={cn(
                        "p-2.5 rounded-xl transition-colors",
                        module.primary ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground group-hover:text-primary"
                      )}>
                        <module.icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-sm">{module.label}</div>
                        <div className="text-[10px] text-muted-foreground font-medium line-clamp-1">{module.description}</div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-all" />
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
                className="w-full h-14 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-red-500/20 gap-3"
                onClick={killTest}
              >
                <Square className="h-5 w-5 fill-current" />
                Kill Active Test
              </Button>
            )}
          </div>

          {/* Terminal Output */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <Card className="border-none shadow-lg bg-black/95 text-zinc-300 font-mono text-[12px] flex-1 min-h-[600px] flex flex-col relative overflow-hidden group">
              <div className="bg-zinc-800/50 px-4 py-2 border-b border-white/5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5 mr-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                  </div>
                  <Terminal className="h-3.5 w-3.5 text-zinc-500" />
                  <span className="text-[10px] font-bold text-zinc-500 tracking-wider">osiris_stress_forge@system: ~{isRunning ? '/running' : '/idle'}</span>
                </div>
                {isRunning && (
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-[10px] font-black text-primary uppercase animate-pulse">Live Stream Active</span>
                  </div>
                )}
              </div>
              
              <CardContent className="p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 flex-1 space-y-1 font-mono leading-relaxed">
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-4 opacity-50 select-none">
                    <Terminal className="h-16 w-16" />
                    <p className="font-bold text-sm tracking-widest uppercase">Select a module to begin forge process</p>
                  </div>
                ) : (
                  logs.map((log, idx) => (
                    <div key={idx} className={cn(
                      "flex gap-4 group/line",
                      log.type === 'error' ? "text-red-400" : ""
                    )}>
                      <span className="text-zinc-600 shrink-0 select-none">[{idx.toString().padStart(3, '0')}]</span>
                      <span className="whitespace-pre-wrap">{log.message}</span>
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </CardContent>

              {/* Status Overlay */}
              {!isRunning && logs.length > 0 && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-zinc-900 border border-white/10 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4">
                    <History className="h-5 w-5 text-primary" />
                    <span className="font-bold text-sm tracking-tight">Test Log Session Complete</span>
                    <Button variant="outline" size="sm" className="h-8 text-[10px] font-black border-white/10" onClick={() => setLogs([])}>Clear</Button>
                  </div>
                </div>
              )}
            </Card>

            <div className="grid grid-cols-3 gap-4">
              <Card className="border-none shadow-sm bg-card/60">
                <CardContent className="p-4 flex flex-col items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Stability Score</span>
                  <span className="text-xl font-black">{logs.length > 0 ? (logs.some(l => l.type === 'error') ? "DEGRADED" : "NOMINAL") : "—"}</span>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm bg-card/60">
                <CardContent className="p-4 flex flex-col items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Metrics Captured</span>
                  <span className="text-xl font-black">{logs.length}</span>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm bg-card/60">
                <CardContent className="p-4 flex flex-col items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">System Status</span>
                  <span className="text-xl font-black text-emerald-500 flex items-center gap-2">
                    <Activity className="h-4 w-4" /> LIVE
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
