import { useAuth } from "@/hooks/use-auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Redirect, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { Newspaper, MessagesSquare, Users, TrendingUp, Info, Eye, EyeOff, CheckCircle2, ShieldCheck } from "lucide-react";
import { OpenVerseIcon } from "@/components/icons/open-verse-icon";
import type { InsertUser, LoginCredentials } from "@shared/schema";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { motion, AnimatePresence } from "framer-motion";
import { fadeIn, fadeInUp, staggerContainer, scaleIn, hoverScale } from "@/lib/animations";

export default function AuthPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [location] = useLocation();
  const { settings } = useSiteSettings();
  const isVerified = location.includes("verified=true");

  if (user) {
    return <Redirect to="/" />;
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Mobile Header - Only visible on mobile */}
      <div className="lg:hidden p-6 bg-primary/5 border-b border-border">
        <div className="flex items-center space-x-2">
          <OpenVerseIcon className="h-24 w-auto object-contain text-primary" />
          <div>
            <h1 className="font-display text-2xl font-semibold">{settings.site_name}</h1>
            <p className="text-xs text-muted-foreground">{settings.site_description || t("auth.version_label", { version: "0.2.0", defaultValue: "Version {{version}}" })}</p>
          </div>
        </div>
      </div>

      {/* Auth Forms Section */}
      <motion.div 
        variants={fadeIn}
        initial="initial"
        animate="animate"
        className="flex items-center justify-center p-4 lg:p-8"
      >
        <div className="mx-auto max-w-md w-full space-y-6">
          {isVerified && (
            <Alert className="bg-primary/5 border-primary/30">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <AlertDescription className="text-foreground">
                {t("auth.email_verified", "Your email has been verified! You can now log in.")}
              </AlertDescription>
            </Alert>
          )}

          {/* REDESIGN [UX-002]: Tab toggle replaces stacked dual forms */}
          <Tabs defaultValue="login" className="w-full">
            {(settings.registration_enabled && !settings.maintenance_mode) && (
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">{t("auth.login", "Login")}</TabsTrigger>
                <TabsTrigger value="register">{t("auth.register", "Register")}</TabsTrigger>
              </TabsList>
            )}
            <AnimatePresence mode="wait">
              <TabsContent value="login" key="login" className="mt-4 focus-visible:outline-none">
                <motion.div variants={scaleIn} initial="initial" animate="animate" exit="exit">
                  {settings.maintenance_mode && (
                    <Alert className="mb-4 bg-primary/5 border-primary/20">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      <AlertDescription className="text-xs font-semibold text-primary">
                        {t("auth.maintenance_active", "Maintenance mode active: only staff login allowed")}
                      </AlertDescription>
                    </Alert>
                  )}
                  <LoginForm />
                  {(!settings.registration_enabled || settings.maintenance_mode) && (
                    <p className="text-center text-xs text-muted-foreground mt-4">
                      {settings.maintenance_mode 
                        ? t("auth.registration_disabled_maintenance", "Site is currently under maintenance. Registration is disabled.")
                        : t("auth.registration_disabled_admin", "Registration is currently disabled by the administrator.")}
                    </p>
                  )}
                </motion.div>
              </TabsContent>
              {(settings.registration_enabled && !settings.maintenance_mode) && (
                <TabsContent value="register" key="register" className="mt-4 focus-visible:outline-none">
                  <motion.div variants={scaleIn} initial="initial" animate="animate" exit="exit">
                    <RegisterForm />
                  </motion.div>
                </TabsContent>
              )}
            </AnimatePresence>
          </Tabs>

          {/* Feature Highlights - Mobile Only */}
          <div className="lg:hidden space-y-4 py-4">
            <h2 className="font-display text-lg font-semibold text-center">{t("auth.why_join", { name: "Osiris", defaultValue: "Why join {{name}}?" })}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="ov-panel p-3">
                <Newspaper className="h-5 w-5 text-primary mb-2" />
                <h3 className="text-sm font-semibold">{t("auth.features_short.news", "Quality News")}</h3>
              </div>
              <div className="ov-panel p-3">
                <MessagesSquare className="h-5 w-5 text-primary mb-2" />
                <h3 className="text-sm font-semibold">{t("auth.features_short.discussions", "Discussions")}</h3>
              </div>
              <div className="ov-panel p-3">
                <TrendingUp className="h-5 w-5 text-primary mb-2" />
                <h3 className="text-sm font-semibold">{t("auth.features_short.trends", "Trends")}</h3>
              </div>
              <div className="ov-panel p-3">
                <Users className="h-5 w-5 text-primary mb-2" />
                <h3 className="text-sm font-semibold">{t("auth.features_short.community", "Community")}</h3>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Desktop Features Section - Hidden on mobile */}
      <div className="hidden lg:flex flex-col justify-center p-8 bg-primary/5 border-l border-border">
        <div className="mx-auto max-w-md w-full">
          <div className="flex items-center space-x-2 mb-8">
            <OpenVerseIcon className="h-48 w-auto object-contain text-primary" />
            <div>
              <h1 className="font-display text-4xl font-semibold tracking-[-0.01em]">{settings.site_name}</h1>
              <p className="text-sm text-muted-foreground">{settings.site_description || t("auth.version_label", { version: "0.2.0", defaultValue: "Version {{version}}" })}</p>
            </div>
          </div>

          <p className="text-xl text-muted-foreground mb-8">
            {settings.site_description || t("auth.default_description", "Join our vibrant community where informed citizens connect, share, and discuss current events, politics, and entertainment.")}
          </p>

          <motion.div 
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="space-y-6"
          >
            <motion.div variants={fadeInUp} className="flex items-start space-x-3">
              <Newspaper className="h-6 w-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold">{t("auth.features.news.title", "Quality News Coverage")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("auth.features.news.description", "Access fact-checked news and in-depth analysis from reliable sources on politics and current events.")}
                </p>
              </div>
            </motion.div>
            <motion.div variants={fadeInUp} className="flex items-start space-x-3">
              <MessagesSquare className="h-6 w-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold">{t("auth.features.discussions.title", "Meaningful Discussions")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("auth.features.discussions.description", "Engage in civil discourse about important political and social issues that matter.")}
                </p>
              </div>
            </motion.div>
            <motion.div variants={fadeInUp} className="flex items-start space-x-3">
              <TrendingUp className="h-6 w-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold">{t("auth.features.trends.title", "Entertainment & Trends")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("auth.features.trends.description", "Stay updated with the latest in entertainment, culture, and trending topics.")}
                </p>
              </div>
            </motion.div>
            <motion.div variants={fadeInUp} className="flex items-start space-x-3">
              <Users className="h-6 w-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold">{t("auth.features.community.title", "Community Impact")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("auth.features.community.description", "Connect with others who share your interests in politics, news, and entertainment.")}
                </p>
              </div>
            </motion.div>
          </motion.div>

            {/* Latest Updates Section */}
            <div className="mt-12 border-t border-border pt-6">
              <div className="flex items-center space-x-2 mb-4">
                <Info className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">{t("auth.latest_updates.title", "Latest Updates")}</h3>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>✨ {t("auth.latest_updates.new_in", { version: "0.2.0", defaultValue: "New in version {{version}}:" })}</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>{t("auth.latest_updates.items.theme_builder", "Advanced Custom Theme Builder")}</li>
                  <li>{t("auth.latest_updates.items.cursor_particles", "Interactive Dynamic Cursor Particles")}</li>
                  <li>{t("auth.latest_updates.items.light_dark", "Light & Dark Mode Overhaul")}</li>
                  <li>{t("auth.latest_updates.items.roles", "Global Role & Permission System")}</li>
                  <li>{t("auth.latest_updates.items.languages", "Global Language Support (6 Languages)")}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}

function LoginForm() {
  const { t } = useTranslation();
  const { loginMutation } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  // Mirrors loginSchema from @shared/schema, with translated messages
  const loginSchema = useMemo(() => z.object({
    username: z.string().min(1, t("auth.validation.username_required", "Username is required")),
    password: z.string().min(1, t("auth.validation.password_required", "Password is required")),
  }), [t]);
  const form = useForm<LoginCredentials>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.login", "Login")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => loginMutation.mutate(data))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.username", "Username")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.password", "Password")}</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input type={showPassword ? "text" : "password"} {...field} />
                    </FormControl>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={showPassword ? t("auth.hide_password", "Hide password") : t("auth.show_password", "Show password")}
                        aria-pressed={showPassword}
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
              {t("auth.login", "Login")}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function RegisterForm() {
  const { t } = useTranslation();
  const { registerMutation } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  // Mirrors insertUserSchema from @shared/schema, with translated messages
  const insertUserSchema = useMemo(() => z.object({
    username: z.string().trim()
      .min(3, t("auth.validation.username_min", { count: 3, defaultValue: "Username must be at least {{count}} characters" }))
      .max(30, t("auth.validation.username_max", { count: 30, defaultValue: "Username can be at most {{count}} characters" }))
      .regex(/^[a-zA-Z0-9_.-]+$/, t("auth.validation.username_chars", "Only letters, numbers, '.', '_' and '-' are allowed")),
    email: z.string().trim().email(t("auth.validation.email_invalid", "Please enter a valid email address")),
    password: z.string()
      .min(8, t("auth.validation.password_min", { count: 8, defaultValue: "Password must be at least {{count}} characters" }))
      .max(128, t("auth.validation.password_max", { count: 128, defaultValue: "Password can be at most {{count}} characters" })),
  }), [t]);
  const form = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.register", "Register")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => registerMutation.mutate(data))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.username", "Username")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.email", "Email")}</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.password", "Password")}</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input type={showPassword ? "text" : "password"} {...field} />
                    </FormControl>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={showPassword ? t("auth.hide_password", "Hide password") : t("auth.show_password", "Show password")}
                        aria-pressed={showPassword}
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
              {t("auth.register", "Register")}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
