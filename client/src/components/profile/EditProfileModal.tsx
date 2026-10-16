import { useEffect, useRef, useState } from "react";
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
import { useToast } from "@/hooks/use-toast";

// Must match PROFILE_IMAGE_MAX_BYTES on the server.
const MAX_IMAGE_MB = 10;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type EditProfileTab = "general" | "appearance" | "privacy";

interface EditProfileModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: UpdateProfile) => void;
  isSubmitting: boolean;
  /** Tab shown when the dialog opens, e.g. "appearance" from the cover or avatar button. */
  initialTab?: EditProfileTab;
}

const formValuesFor = (user: User) => ({
  username: user.username,
  email: user.email,
  displayName: user.displayName || "",
  bio: user.bio || "",
  location: user.location || "",
  website: user.website || "",
  isPrivate: !!user.isPrivate,
  avatarUrl: user.avatarUrl || "",
  coverUrl: user.coverUrl || "",
});

export function EditProfileModal({
  user,
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  initialTab = "general",
}: EditProfileModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [tab, setTab] = useState<EditProfileTab>(initialTab);
  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  // Create a form-specific schema that allows boolean for the switch
  const formSchema = updateProfileSchema.extend({
    isPrivate: z.boolean().optional(),
    avatarUrl: z.string().optional(),
    coverUrl: z.string().optional(),
  });

  const form = useForm<any>({
    resolver: zodResolver(formSchema),
    defaultValues: formValuesFor(user),
  });

  // The dialog stays mounted between openings: start from the current profile every time,
  // otherwise a second save would send the values from the first opening (e.g. an old avatar).
  useEffect(() => {
    if (!isOpen) return;
    form.reset(formValuesFor(user));
    setTab(initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const uploadImage = async (kind: "avatar" | "cover", input: HTMLInputElement, onDone: (url: string) => void) => {
    const file = input.files?.[0];
    input.value = ""; // picking the same file again must fire onChange again
    if (!file) return;
    const fail = (description: string) =>
      toast({ title: t("profile.image.upload_failed", "Could not upload the image"), description, variant: "destructive" });
    if (!IMAGE_TYPES.includes(file.type)) {
      return fail(t("profile.image.wrong_type", "Only JPG, PNG or WebP are allowed."));
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      return fail(t("profile.image.too_large", { defaultValue: "The file is too large (max. {{mb}} MB).", mb: MAX_IMAGE_MB }));
    }
    const formData = new FormData();
    formData.append("type", kind);
    formData.append("image", file);
    const setBusy = kind === "avatar" ? setIsUploadingAvatar : setIsUploadingCover;
    setBusy(true);
    try {
      const res = await apiRequest("POST", "/api/profile-upload", formData);
      const data = await res.json();
      onDone(data.url);
    } catch (err) {
      fail(uploadErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handleFormSubmit = (data: any) => {
    console.log("Submitting Profile Data:", data);
    // Transform boolean back to integer for the backend schema
    const processedData = {
      ...data,
      isPrivate: data.isPrivate ? 1 : 0
    };

    onSubmit(processedData as any);
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
              <Tabs value={tab} onValueChange={(v) => setTab(v as EditProfileTab)} className="w-full">
                <div className="ov-rule px-6 md:px-8">
                  <TabsList className="h-12 w-full justify-start gap-1 rounded-none bg-transparent p-0 shadow-none">
                    <TabsTrigger value="general" className="h-full rounded-none px-3">
                      <Info className="w-4 h-4 mr-2" />
                      {t("profile.edit_tabs.general", "General")}
                    </TabsTrigger>
                    <TabsTrigger value="appearance" className="h-full rounded-none px-3">
                      <Palette className="w-4 h-4 mr-2" />
                      {t("profile.edit_tabs.images", "Images")}
                    </TabsTrigger>
                    <TabsTrigger value="privacy" className="h-full rounded-none px-3">
                      <Shield className="w-4 h-4 mr-2" />
                      {t("profile.edit_tabs.privacy", "Privacy")}
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
                                <Input placeholder={t("profile.form.name_placeholder", "John Doe")} {...field} className="h-11 px-4" />
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
                                  <Input placeholder={t("profile.form.location_placeholder", "Berlin, Germany")} {...field} className="h-11 px-4" />
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
                                {t("profile.image.avatar", "Profile picture")}
                              </FormLabel>
                              <div className="ov-panel flex items-center gap-6 p-5">
                                <div className="ov-avatar h-24 w-24 shrink-0 bg-muted relative group">
                                  {isUploadingAvatar ? (
                                    <div className="w-full h-full flex items-center justify-center bg-background/60">
                                      <Loader2 className="h-8 w-8 text-primary animate-spin" />
                                    </div>
                                  ) : field.value ? (
                                    <img src={field.value} alt={t("profile.image.avatar_preview", "Avatar Preview")} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                                      <UserIcon className="h-10 w-10" />
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-background/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => avatarInput.current?.click()}>
                                    <Camera className="h-6 w-6 text-foreground" />
                                  </div>
                                </div>
                                <div className="flex-1 space-y-3">
                                  <div className="flex gap-3">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={isUploadingAvatar}
                                      onClick={() => avatarInput.current?.click()}
                                    >
                                      {field.value ? t("profile.image.change_avatar", "Change profile picture") : t("profile.image.choose_avatar", "Choose profile picture")}
                                    </Button>
                                    {field.value && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => field.onChange("")}
                                      >
                                        {t("profile.image.remove", "Remove")}
                                      </Button>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">{t("profile.image.hint", { defaultValue: "JPG, PNG or WebP, max. {{mb}} MB.", mb: MAX_IMAGE_MB })}</p>
                                </div>
                                <input
                                  ref={avatarInput}
                                  id="avatar-upload"
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  className="hidden"
                                  onChange={(e) => uploadImage("avatar", e.currentTarget, (url) => field.onChange(url))}
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
                                {t("profile.image.cover", "Cover image")}
                              </FormLabel>
                              <div className="space-y-4">
                                <button
                                  type="button"
                                  disabled={isUploadingCover}
                                  aria-label={field.value ? t("profile.image.change_cover", "Change cover image") : t("profile.image.choose_cover", "Choose cover image")}
                                  className="ov-cut-2 relative block w-full bg-muted/60 overflow-hidden aspect-[3/1] group cursor-pointer"
                                  onClick={() => coverInput.current?.click()}
                                >
                                  {isUploadingCover ? (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-background/60 gap-3">
                                      <Loader2 className="h-10 w-10 text-primary animate-spin" />
                                      <span className="ov-label text-primary">{t("profile.image.uploading", "Uploading …")}</span>
                                    </div>
                                  ) : field.value ? (
                                    <img src={field.value} alt={t("profile.image.cover_preview", "Cover Preview")} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/40 gap-2">
                                      <ImageIcon className="h-12 w-12" />
                                      <span className="ov-label">{t("profile.image.choose_cover", "Choose cover image")}</span>
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="ov-chip bg-background text-foreground">
                                      <Camera className="h-3.5 w-3.5" />
                                      <span>{field.value ? t("profile.image.change_cover", "Change cover image") : t("profile.image.choose_cover", "Choose cover image")}</span>
                                    </div>
                                  </div>
                                </button>
                                <div className="flex justify-between items-center px-1">
                                  <p className="text-xs text-muted-foreground">{t("profile.image.cover_hint", { defaultValue: "Landscape, e.g. 1500 × 500 px. JPG, PNG or WebP, max. {{mb}} MB.", mb: MAX_IMAGE_MB })}</p>
                                  {field.value && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      onClick={(e) => { e.stopPropagation(); field.onChange(""); }}
                                    >
                                      {t("profile.image.remove", "Remove")}
                                    </Button>
                                  )}
                                </div>
                                <input
                                  ref={coverInput}
                                  id="cover-upload"
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  className="hidden"
                                  onChange={(e) => uploadImage("cover", e.currentTarget, (url) => field.onChange(url))}
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
                <Button type="submit" disabled={isSubmitting || isUploadingAvatar || isUploadingCover} className="px-6">
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

// Server errors arrive as "413: {\"error\":\"...\"}" from apiRequest; show the readable part.
function uploadErrorMessage(err: unknown, t: (key: string, fallback: string) => string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const status = Number(raw.split(":")[0]);
  const body = raw.slice(raw.indexOf(":") + 1).trim();
  try {
    const parsed = JSON.parse(body);
    if (parsed?.error) return String(parsed.error);
  } catch {
    // not JSON, e.g. an HTML page from a proxy
  }
  if (status === 413) return t("profile.image.too_large_proxy", "The file is too large.");
  return t("profile.image.try_again", "Please try again.");
}
