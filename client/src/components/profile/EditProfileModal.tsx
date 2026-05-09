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
import { Loader2, Globe, MapPin, AtSign, User as UserIcon, Lock, Camera, Palette, Shield, Info, Image as ImageIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { fadeIn, scaleIn } from "@/lib/animations";
import { cn } from "@/lib/utils";

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
  
  // Create a form-specific schema that allows boolean for the switch
  const formSchema = updateProfileSchema.extend({
    isPrivate: z.boolean().optional(),
    avatarUrl: z.string().optional(),
    coverUrl: z.string().optional(),
  });

  const form = useForm<any>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: user.username,
      email: user.email,
      displayName: user.displayName || "",
      bio: user.bio || "",
      location: user.location || "",
      website: user.website || "",
      isPrivate: !!user.isPrivate,
      avatarUrl: user.avatarUrl || "",
      coverUrl: user.coverUrl || "",
    },
  });

  const handleFormSubmit = (data: any) => {
    console.log("Submitting Profile Data:", data);
    // Transform boolean back to integer for the backend schema
    const processedData = {
      ...data,
      isPrivate: data.isPrivate ? 1 : 0
    };
    
    onSubmit(processedData as any);
    // The parent now handles closing, but we call it here too to be safe
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] overflow-hidden p-0 rounded-[2.5rem] border border-white/10 shadow-2xl glass-premium">
        <div className="bg-gradient-to-br from-primary/15 via-accent/5 to-transparent p-10 pb-6 relative overflow-hidden">
          <div className="absolute inset-0 nebula-banner opacity-20 pointer-events-none" />
          <div className="absolute inset-0 starfield opacity-10 pointer-events-none" />
          
          <DialogHeader className="relative z-10">
            <DialogTitle className="text-4xl font-black tracking-tighter flex items-center gap-4">
              <div className="h-14 w-14 bg-primary rounded-2xl flex items-center justify-center shadow-2xl shadow-primary/30 nebula-glow">
                <UserIcon className="h-7 w-7 text-primary-foreground" />
              </div>
              {t('profile.edit_title')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground font-medium text-lg mt-2">
              {t('profile.edit_description')}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-0 max-h-[80vh] overflow-hidden">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit)}>
              <Tabs defaultValue="general" className="w-full">
                <div className="px-10 border-b border-white/5 bg-white/5">
                  <TabsList className="bg-transparent h-16 w-full justify-start gap-8 p-0">
                    <TabsTrigger value="general" className="data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-0 font-black text-xs uppercase tracking-[0.2em] transition-all">
                      <Info className="w-4 h-4 mr-2" />
                      {t('admin.tabs.users')}
                    </TabsTrigger>
                    <TabsTrigger value="appearance" className="data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-0 font-black text-xs uppercase tracking-[0.2em] transition-all">
                      <Palette className="w-4 h-4 mr-2" />
                      Appearance
                    </TabsTrigger>
                    <TabsTrigger value="privacy" className="data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-0 font-black text-xs uppercase tracking-[0.2em] transition-all">
                      <Shield className="w-4 h-4 mr-2" />
                      Privacy
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="p-10 h-[450px] overflow-y-auto scrollbar-none">
                  <AnimatePresence mode="wait">
                    <TabsContent value="general" className="mt-0 space-y-8 outline-none">
                      <motion.div variants={fadeIn} initial="initial" animate="animate" className="space-y-8">
                        {/* Display Name */}
                        <FormField
                          control={form.control}
                          name="displayName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80 pl-2">
                                <AtSign className="h-3 w-3" />
                                {t('profile.form.name')}
                              </FormLabel>
                              <FormControl>
                                <Input placeholder="John Doe" {...field} className="glass-input h-14 rounded-2xl px-6 font-bold text-base border-white/10" />
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
                              <FormLabel className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80 pl-2">{t('profile.form.bio')}</FormLabel>
                              <FormControl>
                                <Textarea 
                                  placeholder={t('profile.form.bio_placeholder')} 
                                  className="glass-input resize-none rounded-3xl p-6 font-medium min-h-[140px] border-white/10 leading-relaxed" 
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription className="text-[10px] font-bold opacity-40 uppercase tracking-widest pl-2">
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
                                <FormLabel className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80 pl-2">
                                  <MapPin className="h-3 w-3" />
                                  {t('profile.form.location')}
                                </FormLabel>
                                <FormControl>
                                  <Input placeholder="Berlin, Germany" {...field} className="glass-input h-14 rounded-2xl px-6 font-bold text-sm border-white/10" />
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
                                <FormLabel className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80 pl-2">
                                  <Globe className="h-3 w-3" />
                                  {t('profile.form.website')}
                                </FormLabel>
                                <FormControl>
                                  <Input placeholder="example.com" {...field} className="glass-input h-14 rounded-2xl px-6 font-bold text-sm border-white/10" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </motion.div>
                    </TabsContent>

                    <TabsContent value="appearance" className="mt-0 space-y-8 outline-none">
                      <motion.div variants={fadeIn} initial="initial" animate="animate" className="space-y-8">
                        {/* Avatar URL */}
                        <FormField
                          control={form.control}
                          name="avatarUrl"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80 pl-2">
                                <Camera className="h-3 w-3" />
                                Avatar Image URL
                              </FormLabel>
                              <div className="flex gap-4">
                                <FormControl className="flex-1">
                                  <Input placeholder="https://..." {...field} className="glass-input h-14 rounded-2xl px-6 font-bold text-sm border-white/10" />
                                </FormControl>
                                {field.value && (
                                  <div className="h-14 w-14 rounded-2xl border border-white/10 overflow-hidden bg-white/5">
                                    <img src={field.value} alt="Preview" className="w-full h-full object-cover" />
                                  </div>
                                )}
                              </div>
                              <FormDescription className="text-[10px] font-bold opacity-40 uppercase tracking-widest pl-2">
                                Direct image URL for your profile picture.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Cover URL */}
                        <FormField
                          control={form.control}
                          name="coverUrl"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80 pl-2">
                                <ImageIcon className="h-3 w-3" />
                                Cover Image URL
                              </FormLabel>
                              <FormControl>
                                <Input placeholder="https://..." {...field} className="glass-input h-14 rounded-2xl px-6 font-bold text-sm border-white/10" />
                              </FormControl>
                              {field.value && (
                                <div className="mt-4 rounded-3xl border border-white/10 overflow-hidden bg-white/5 aspect-[3/1]">
                                  <img src={field.value} alt="Preview" className="w-full h-full object-cover" />
                                </div>
                              )}
                              <FormDescription className="text-[10px] font-bold opacity-40 uppercase tracking-widest pl-2">
                                Background image for your profile header.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </motion.div>
                    </TabsContent>

                    <TabsContent value="privacy" className="mt-0 space-y-8 outline-none">
                      <motion.div variants={fadeIn} initial="initial" animate="animate">
                        <FormField
                          control={form.control}
                          name="isPrivate"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-[2rem] border border-white/5 p-8 bg-white/5 group transition-all hover:bg-white/10">
                              <div className="space-y-2">
                                <FormLabel className="flex items-center gap-3 text-lg font-black tracking-tight">
                                  <div className="h-10 w-10 rounded-xl bg-background flex items-center justify-center border border-white/10">
                                    <Lock className="h-5 w-5 text-primary" />
                                  </div>
                                  {t('profile.form.privacy')}
                                </FormLabel>
                                <FormDescription className="text-sm font-medium text-muted-foreground/80 pl-[52px]">
                                  {t('profile.form.privacy_description')}
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={!!field.value}
                                  onCheckedChange={field.onChange}
                                  className="data-[state=checked]:bg-primary scale-125"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </motion.div>
                    </TabsContent>
                  </AnimatePresence>
                </div>
              </Tabs>

              <div className="p-10 pt-6 bg-white/5 border-t border-white/5 flex justify-end gap-4">
                <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting} className="rounded-full px-8 h-14 font-black text-xs uppercase tracking-[0.2em] hover:bg-white/5">
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={isSubmitting} className="rounded-full px-12 h-14 font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-primary/30 hover:shadow-primary/50 transition-all nebula-glow">
                  {isSubmitting ? <Loader2 className="mr-3 h-5 w-5 animate-spin" /> : <Shield className="mr-3 h-5 w-5" />}
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
