import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useCreateTicket } from "@/hooks/use-tickets";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BackButton } from "@/components/ui/back-button";
import { PageHeader } from "@/components/layout/page-header";

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
        <BackButton fallback="/tickets" className="mb-2 -ml-3" />

        <PageHeader
          eyebrow={t("title", "Tickets")}
          title={t("createTicket")}
          description="Submit a new signal for the team to process in zero-gravity."
        />

        <div className="mt-8 grid lg:grid-cols-[1fr,320px] gap-8">
          <Card>
            <form onSubmit={handleSubmit}>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="ov-label block">{t("fields.title")} *</label>
                  <Input
                    required
                    placeholder={t("fields.titlePlaceholder")}
                    className="h-11"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="ov-label block">{t("fields.type")} *</label>
                    <Select value={formData.type} onValueChange={v => setFormData({ ...formData, type: v })}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['bug_report', 'feature_request', 'user_complaint', 'content_issue', 'security_concern', 'performance_issue', 'other'].map(type => (
                          <SelectItem key={type} value={type}>{t(`types.${type}`, type)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="ov-label block">{t("fields.priority")} *</label>
                    <Select value={formData.priority} onValueChange={v => setFormData({ ...formData, priority: v })}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['low', 'medium', 'high', 'critical'].map(p => (
                          <SelectItem key={p} value={p}>{t(`priority.${p}`, p)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="ov-label block">{t("fields.description")} *</label>
                  <Textarea
                    required
                    rows={10}
                    placeholder={t("fields.descriptionPlaceholder")}
                    className="p-4 leading-relaxed"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="ov-label block">{t("fields.relatedUrl")} (Optional)</label>
                  <Input
                    type="url"
                    placeholder="https://..."
                    className="h-11"
                    value={formData.relatedUrl}
                    onChange={e => setFormData({ ...formData, relatedUrl: e.target.value })}
                  />
                </div>

              </CardContent>
              <CardFooter className="flex justify-end gap-3 px-6 py-4 border-t border-border">
                <Button type="button" variant="ghost" onClick={() => window.history.back()}>Cancel</Button>
                <Button type="submit" disabled={isPending} className="w-48">
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("createTicket")}
                </Button>
              </CardFooter>
            </form>
          </Card>

          <div className="space-y-8">
            <Card className="[--ov-line:hsl(var(--primary)/0.35)]">
              <CardHeader className="p-6 pb-3">
                <CardTitle className="text-lg">{t("help.title")}</CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-0 text-sm text-muted-foreground space-y-5">
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-foreground">{t("types.bug_report")}</p>
                  <p className="text-sm leading-relaxed">{t("help.bug_report")}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-foreground">{t("types.feature_request")}</p>
                  <p className="text-sm leading-relaxed">{t("help.feature_request")}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
