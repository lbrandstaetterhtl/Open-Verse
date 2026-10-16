import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";
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
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);

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
      <DialogContent className="sm:max-w-[700px] overflow-hidden p-0">
        <div className="px-6 pt-6 md:px-8 md:pt-8 relative overflow-hidden">
          <DialogHeader className="relative">
            <DialogTitle className="font-display text-2xl font-semibold leading-tight tracking-normal flex items-center gap-3">
              <div className="ov-cut h-10 w-10 shrink-0 bg-primary/10 flex items-center justify-center">
                <UserIcon className="h-5 w-5 text-primary" />
              </div>
              {t('profile.edit_title')}
            </DialogTitle>
            <DialogDescription className="text-[15px] text-muted-foreground mt-1">
              {t('profile.edit_description')}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-0 max-h-[80vh] overflow-hidden">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit)}>
              <Tabs defaultValue="general" className="w-full">
                <div className="ov-rule px-6 md:px-8">
                  <TabsList className="h-12 w-full justify-start gap-1 rounded-none bg-transparent p-0 shadow-none">
                    <TabsTrigger value="general" className="h-full rounded-none px-3">
                      <Info className="w-4 h-4 mr-2" />
                      {t('admin.tabs.users')}
                    </TabsTrigger>
                    <TabsTrigger value="appearance" className="h-full rounded-none px-3">
                      <Palette className="w-4 h-4 mr-2" />
                      Appearance
                    </TabsTrigger>
                    <TabsTrigger value="privacy" className="h-full rounded-none px-3">
                      <Shield className="w-4 h-4 mr-2" />
                      Privacy
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="p-6 md:p-8 h-[450px] overflow-y-auto scrollbar-none">
                  <AnimatePresence mode="wait">
                    <TabsContent value="general" className="mt-0 space-y-8 outline-none">
                      <motion.div variants={fadeIn} initial="initial" animate="animate" className="space-y-8">
                        {/* Display Name */}
                        <FormField
                          control={form.control}
                          name="displayName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="ov-label flex items-center gap-2 text-[11px]">
                                <AtSign className="h-3 w-3" />
                                {t('profile.form.name')}
                              </FormLabel>
                              <FormControl>
                                <Input placeholder="John Doe" {...field} className="h-11 px-4" />
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
                              <FormLabel className="ov-label text-[11px]">{t('profile.form.bio')}</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder={t('profile.form.bio_placeholder')}
                                  className="resize-none p-4 min-h-[140px] leading-relaxed"
                                  {...field}
                                />
                              </FormControl>
                              <FormDescription className="text-xs">
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
                                <FormLabel className="ov-label flex items-center gap-2 text-[11px]">
                                  <MapPin className="h-3 w-3" />
                                  {t('profile.form.location')}
                                </FormLabel>
                                <FormControl>
                                  <Input placeholder="Berlin, Germany" {...field} className="h-11 px-4" />
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
                                <FormLabel className="ov-label flex items-center gap-2 text-[11px]">
                                  <Globe className="h-3 w-3" />
                                  {t('profile.form.website')}
                                </FormLabel>
                                <FormControl>
                                  <Input placeholder="example.com" {...field} className="h-11 px-4" />
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
                        {/* Avatar Upload */}
                        <FormField
                          control={form.control}
                          name="avatarUrl"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="ov-label flex items-center gap-2 text-[11px]">
                                <Camera className="h-3 w-3" />
                                Profile Picture
                              </FormLabel>
                              <div className="ov-panel flex items-center gap-6 p-5">
                                <div className="ov-avatar h-24 w-24 shrink-0 bg-muted relative group">
                                  {isUploadingAvatar ? (
                                    <div className="w-full h-full flex items-center justify-center bg-background/60">
                                      <Loader2 className="h-8 w-8 text-primary animate-spin" />
                                    </div>
                                  ) : field.value ? (
                                    <img src={field.value} alt="Avatar Preview" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                                      <UserIcon className="h-10 w-10" />
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-background/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => document.getElementById('avatar-upload')?.click()}>
                                    <Camera className="h-6 w-6 text-foreground" />
                                  </div>
                                </div>
                                <div className="flex-1 space-y-3">
                                  <div className="flex gap-3">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => document.getElementById('avatar-upload')?.click()}
                                    >
                                      Change Avatar
                                    </Button>
                                    {field.value && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => field.onChange("")}
                                      >
                                        Remove
                                      </Button>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">JPG, PNG or WebP. Max 2MB.</p>
                                </div>
                                <input
                                  id="avatar-upload"
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;

                                    const formData = new FormData();
                                    formData.append("image", file);
                                    formData.append("type", "avatar");

                                    setIsUploadingAvatar(true);
                                    try {
                                      const res = await apiRequest("POST", "/api/profile-upload", formData);
                                      const data = await res.json();
                                      field.onChange(data.url);
                                    } catch (err) {
                                      console.error("Avatar upload error:", err);
                                    } finally {
                                      setIsUploadingAvatar(false);
                                    }
                                  }}
                                />
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Cover Upload */}
                        <FormField
                          control={form.control}
                          name="coverUrl"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="ov-label flex items-center gap-2 text-[11px]">
                                <ImageIcon className="h-3 w-3" />
                                Cover Image
                              </FormLabel>
                              <div className="space-y-4">
                                <div
                                  className="ov-cut-2 relative bg-muted/60 overflow-hidden aspect-[3/1] group cursor-pointer"
                                  onClick={() => document.getElementById('cover-upload')?.click()}
                                >
                                  {isUploadingCover ? (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-background/60 gap-3">
                                      <Loader2 className="h-10 w-10 text-primary animate-spin" />
                                      <span className="ov-label text-primary">Uploading...</span>
                                    </div>
                                  ) : field.value ? (
                                    <img src={field.value} alt="Cover Preview" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/40 gap-2">
                                      <ImageIcon className="h-12 w-12" />
                                      <span className="ov-label">Upload Banner</span>
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="ov-chip bg-background text-foreground">
                                      <Camera className="h-3.5 w-3.5" />
                                      <span>Update Banner</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex justify-between items-center px-1">
                                  <p className="text-xs text-muted-foreground">Recommended: <span className="ov-data">1500x500px</span></p>
                                  {field.value && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      onClick={(e) => { e.stopPropagation(); field.onChange(""); }}
                                    >
                                      Remove Banner
                                    </Button>
                                  )}
                                </div>
                                <input
                                  id="cover-upload"
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;

                                    const formData = new FormData();
                                    formData.append("image", file);
                                    formData.append("type", "cover");

                                    setIsUploadingCover(true);
                                    try {
                                      const res = await apiRequest("POST", "/api/profile-upload", formData);
                                      const data = await res.json();
                                      field.onChange(data.url);
                                    } catch (err) {
                                      console.error("Cover upload error:", err);
                                    } finally {
                                      setIsUploadingCover(false);
                                    }
                                  }}
                                />
                              </div>
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
                            <FormItem className="ov-panel flex flex-row items-center justify-between gap-6 p-6">
                              <div className="space-y-2">
                                <FormLabel className="flex items-center gap-3 font-display text-lg font-semibold">
                                  <div className="ov-cut h-10 w-10 shrink-0 bg-primary/10 flex items-center justify-center">
                                    <Lock className="h-5 w-5 text-primary" />
                                  </div>
                                  {t('profile.form.privacy')}
                                </FormLabel>
                                <FormDescription className="text-sm pl-[52px]">
                                  {t('profile.form.privacy_description')}
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={!!field.value}
                                  onCheckedChange={field.onChange}
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

              <div className="px-6 md:px-8 py-4 border-t border-border flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={isSubmitting} className="px-6">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
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
