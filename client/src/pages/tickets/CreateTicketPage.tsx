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
    <div className="container max-w-4xl mx-auto py-8 px-4 pt-20">
      <BackButton fallback="/tickets" className="mb-6 -ml-4 font-semibold" />
      
      <div className="grid md:grid-cols-[1fr,300px] gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{t("createTicket")}</CardTitle>
            <CardDescription>Submit a new support issue for the team to review.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">{t("fields.title")} *</label>
                <Input 
                  required 
                  placeholder={t("fields.titlePlaceholder")} 
                  value={formData.title} 
                  onChange={e => setFormData({ ...formData, title: e.target.value })} 
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">{t("fields.type")} *</label>
                  <Select value={formData.type} onValueChange={v => setFormData({ ...formData, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['bug_report', 'feature_request', 'user_complaint', 'content_issue', 'security_concern', 'performance_issue', 'other'].map(type => (
                        <SelectItem key={type} value={type}>{t(`types.${type}`, type)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">{t("fields.priority")} *</label>
                  <Select value={formData.priority} onValueChange={v => setFormData({ ...formData, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['low', 'medium', 'high', 'critical'].map(p => (
                        <SelectItem key={p} value={p}>{t(`priority.${p}`, p)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">{t("fields.description")} *</label>
                <Textarea 
                  required 
                  rows={8}
                  placeholder={t("fields.descriptionPlaceholder")} 
                  value={formData.description} 
                  onChange={e => setFormData({ ...formData, description: e.target.value })} 
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">{t("fields.relatedUrl")} (Optional)</label>
                <Input 
                  type="url" 
                  placeholder="https://..." 
                  value={formData.relatedUrl} 
                  onChange={e => setFormData({ ...formData, relatedUrl: e.target.value })} 
                />
              </div>

            </CardContent>
            <CardFooter className="flex justify-end gap-2 border-t pt-6 bg-muted/20">
              <Button type="button" variant="ghost" onClick={() => window.history.back()}>Cancel</Button>
              <Button type="submit" disabled={isPending} className="font-bold w-32">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("createTicket")}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <div className="space-y-6">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-sm">{t("help.title")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-4">
              <div>
                <p className="font-semibold text-foreground">{t("types.bug_report")}</p>
                <p className="text-xs">{t("help.bug_report")}</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">{t("types.feature_request")}</p>
                <p className="text-xs">{t("help.feature_request")}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
