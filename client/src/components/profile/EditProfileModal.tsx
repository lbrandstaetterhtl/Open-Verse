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
      <DialogContent className="sm:max-w-[500px] overflow-hidden p-0 rounded-2xl border-none shadow-2xl">
        <div className="bg-primary/5 p-6 pb-2">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <UserIcon className="h-6 w-6 text-primary" />
              {t('profile.edit_title')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('profile.edit_description')}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Display Name */}
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <AtSign className="h-4 w-4 text-muted-foreground" />
                      {t('profile.form.name')}
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} className="rounded-xl border-muted/50 focus:ring-primary/20" />
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
                    <FormLabel>{t('profile.form.bio')}</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder={t('profile.form.bio_placeholder')} 
                        className="resize-none rounded-xl border-muted/50 focus:ring-primary/20 min-h-[100px]" 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      {t('profile.form.bio_description')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Location & Website Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {t('profile.form.location')}
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Berlin, Germany" {...field} className="rounded-xl border-muted/50 focus:ring-primary/20" />
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
                      <FormLabel className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        {t('profile.form.website')}
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="example.com" {...field} className="rounded-xl border-muted/50 focus:ring-primary/20" />
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
                  <FormItem className="flex flex-row items-center justify-between rounded-2xl border border-muted/50 p-4 bg-muted/20">
                    <div className="space-y-0.5">
                      <FormLabel className="flex items-center gap-2 text-base font-semibold">
                        <Lock className="h-4 w-4 text-primary" />
                        {t('profile.form.privacy')}
                      </FormLabel>
                      <FormDescription>
                        {t('profile.form.privacy_description')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting} className="rounded-full px-6">
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={isSubmitting} className="rounded-full px-8 shadow-lg shadow-primary/20">
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
