import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { UpdateProfile, User } from "@shared/schema";
import { updateProfileSchema } from "@shared/schema";
import { useTranslation } from "react-i18next";
import { Loader2, Globe, MapPin, AtSign, User as UserIcon, Lock } from "lucide-react";

interface EditProfileModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: UpdateProfile) => void;
  isSubmitting: boolean;
}

export function EditProfileModal({
  user,
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
}: EditProfileModalProps) {
  const { t } = useTranslation();
  
  const form = useForm<UpdateProfile>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      username: user.username,
      email: user.email,
      displayName: user.displayName || "",
      bio: user.bio || "",
      location: user.location || "",
      website: user.website || "",
      isPrivate: user.isPrivate || false,
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] overflow-hidden p-0 rounded-3xl border border-border/40 shadow-2xl glass-premium">
        <div className="bg-gradient-to-br from-primary/10 via-accent/5 to-transparent p-8 pb-4 relative overflow-hidden">
          <div className="starfield opacity-10" />
          <DialogHeader className="relative z-10">
            <DialogTitle className="text-3xl font-black tracking-tighter flex items-center gap-3">
              <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                <UserIcon className="h-5 w-5 text-primary-foreground" />
              </div>
              {t('profile.edit_title')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground/80 font-medium">
              {t('profile.edit_description')}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-8 max-h-[70vh] overflow-y-auto scrollbar-none">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {/* Display Name */}
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      <AtSign className="h-3.5 w-3.5" />
                      {t('profile.form.name')}
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} className="glass-input h-12 rounded-2xl px-5 font-medium" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Bio */}
              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{t('profile.form.bio')}</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder={t('profile.form.bio_placeholder')} 
                        className="glass-input resize-none rounded-2xl p-5 font-medium min-h-[120px]" 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription className="text-[11px] font-medium opacity-60 italic">
                      {t('profile.form.bio_description')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Location & Website Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {t('profile.form.location')}
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Berlin, Germany" {...field} className="glass-input h-12 rounded-2xl px-5 font-medium" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        <Globe className="h-3.5 w-3.5" />
                        {t('profile.form.website')}
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="example.com" {...field} className="glass-input h-12 rounded-2xl px-5 font-medium" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Privacy Setting */}
              <FormField
                control={form.control}
                name="isPrivate"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-3xl border border-primary/10 p-6 bg-primary/5 group transition-colors hover:bg-primary/10">
                    <div className="space-y-1">
                      <FormLabel className="flex items-center gap-2 text-base font-black tracking-tight">
                        <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center border border-border/40">
                          <Lock className="h-4 w-4 text-primary" />
                        </div>
                        {t('profile.form.privacy')}
                      </FormLabel>
                      <FormDescription className="text-xs font-medium text-muted-foreground">
                        {t('profile.form.privacy_description')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="data-[state=checked]:bg-primary"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-4 border-t border-border/20">
                <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting} className="rounded-full px-6 h-11 font-bold text-sm">
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={isSubmitting} className="rounded-full px-10 h-11 font-black text-sm uppercase tracking-widest shadow-xl shadow-primary/20 hover:shadow-primary/40 transition-all nebula-glow">
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('common.save')}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
