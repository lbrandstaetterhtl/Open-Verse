import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useCreateTicket } from "@/hooks/use-tickets";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BackButton } from "@/components/ui/back-button";

export default function CreateTicketPage() {
  const { t } = useTranslation("tickets");
  const [, match] = useLocation();
  const { mutateAsync: createTicket, isPending } = useCreateTicket();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    type: "other",
    priority: "medium",
    relatedUrl: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.title.length < 10) return toast({ title: t("validation.titleTooShort"), variant: "destructive" });
    if (formData.description.length < 20) return toast({ title: t("validation.descriptionTooShort"), variant: "destructive" });

    try {
      const response = await createTicket(formData);
      const ticket = response.ticket;
      toast({ title: t("success.created", { number: ticket.ticketNumber }) });
      match(`/tickets/${ticket.id}`);
    } catch (err: any) {
      toast({ title: t("errors.createFailed"), description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="container max-w-5xl mx-auto py-12 px-4 pt-24 pb-24">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <BackButton fallback="/tickets" className="mb-10 -ml-4 font-black uppercase tracking-widest text-[10px] opacity-60 hover:opacity-100 hover:-translate-x-2 transition-all" />
        
        <div className="grid lg:grid-cols-[1fr,320px] gap-12">
          <Card className="glass-premium border-white/10 shadow-2xl overflow-hidden relative group">
            <div className="absolute inset-0 nebula-banner opacity-5 group-hover:opacity-10 transition-opacity duration-1000" />
            <CardHeader className="relative z-10 p-10 pb-4">
              <CardTitle className="text-4xl font-black tracking-tighter uppercase italic italic-primary leading-none">{t("createTicket")}</CardTitle>
              <CardDescription className="text-sm font-medium mt-2 opacity-60">Submit a new signal for the team to process in zero-gravity.</CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit} className="relative z-10">
              <CardContent className="p-10 space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pl-2">{t("fields.title")} *</label>
                  <Input 
                    required 
                    placeholder={t("fields.titlePlaceholder")} 
                    className="glass-input h-14 rounded-3xl px-6 font-bold"
                    value={formData.title} 
                    onChange={e => setFormData({ ...formData, title: e.target.value })} 
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pl-2">{t("fields.type")} *</label>
                    <Select value={formData.type} onValueChange={v => setFormData({ ...formData, type: v })}>
                      <SelectTrigger className="glass-input h-14 rounded-3xl px-6 font-bold text-xs uppercase tracking-widest border-white/5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="glass-premium border-white/10">
                        {['bug_report', 'feature_request', 'user_complaint', 'content_issue', 'security_concern', 'performance_issue', 'other'].map(type => (
                          <SelectItem key={type} value={type} className="font-bold text-xs uppercase tracking-widest">{t(`types.${type}`, type)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pl-2">{t("fields.priority")} *</label>
                    <Select value={formData.priority} onValueChange={v => setFormData({ ...formData, priority: v })}>
                      <SelectTrigger className="glass-input h-14 rounded-3xl px-6 font-bold text-xs uppercase tracking-widest border-white/5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="glass-premium border-white/10">
                        {['low', 'medium', 'high', 'critical'].map(p => (
                          <SelectItem key={p} value={p} className="font-bold text-xs uppercase tracking-widest">{t(`priority.${p}`, p)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pl-2">{t("fields.description")} *</label>
                  <Textarea 
                    required 
                    rows={10}
                    placeholder={t("fields.descriptionPlaceholder")} 
                    className="glass-input rounded-[2rem] p-8 font-medium leading-relaxed border-white/5"
                    value={formData.description} 
                    onChange={e => setFormData({ ...formData, description: e.target.value })} 
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pl-2">{t("fields.relatedUrl")} (Optional)</label>
                  <Input 
                    type="url" 
                    placeholder="https://..." 
                    className="glass-input h-14 rounded-3xl px-6 font-bold"
                    value={formData.relatedUrl} 
                    onChange={e => setFormData({ ...formData, relatedUrl: e.target.value })} 
                  />
                </div>

              </CardContent>
              <CardFooter className="flex justify-end gap-4 p-10 border-t border-white/5 bg-white/5">
                <Button type="button" variant="ghost" onClick={() => window.history.back()} className="h-14 px-8 rounded-full font-black uppercase tracking-widest text-[10px] opacity-60 hover:opacity-100">Cancel</Button>
                <Button type="submit" disabled={isPending} className="h-14 px-12 rounded-full font-black uppercase tracking-widest text-[10px] shadow-2xl shadow-primary/30 nebula-glow w-48">
                  {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : t("createTicket")}
                </Button>
              </CardFooter>
            </form>
          </Card>

          <div className="space-y-8">
            <Card className="glass-premium border-primary/20 shadow-2xl shadow-primary/10 overflow-hidden relative">
              <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
              <CardHeader className="p-8 pb-4">
                <CardTitle className="text-xs font-black uppercase tracking-[0.3em] text-primary">{t("help.title")}</CardTitle>
              </CardHeader>
              <CardContent className="p-8 pt-4 text-sm text-muted-foreground space-y-8 relative z-10">
                <div className="space-y-2">
                  <p className="font-black uppercase tracking-widest text-[10px] text-foreground">{t("types.bug_report")}</p>
                  <p className="text-xs font-medium leading-relaxed opacity-70">{t("help.bug_report")}</p>
                </div>
                <div className="space-y-2">
                  <p className="font-black uppercase tracking-widest text-[10px] text-foreground">{t("types.feature_request")}</p>
                  <p className="text-xs font-medium leading-relaxed opacity-70">{t("help.feature_request")}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
