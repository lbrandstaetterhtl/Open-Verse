import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { Redirect } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Network, Newspaper, MessageSquare, Users, Sparkles, Globe, TrendingUp, Info, Eye, EyeOff } from "lucide-react";
import { OpenVerseIcon } from "@/components/icons/open-verse-icon";
import { insertUserSchema, InsertUser, loginSchema, LoginCredentials } from "@shared/schema";
import { useLocation } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2 } from "lucide-react";

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [location, params] = useLocation();
  const isVerified = location.includes("verified=true");

  if (user) {
    return <Redirect to="/" />;
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Mobile Header - Only visible on mobile */}
      <div className="lg:hidden p-6 bg-primary/5">
        <div className="flex items-center space-x-2">
          <OpenVerseIcon className="h-12 w-12 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Open Verse</h1>
            <p className="text-xs text-muted-foreground">Version 1.0</p>
          </div>
        </div>
      </div>

      {/* Auth Forms Section */}
      <div className="flex items-center justify-center p-4 lg:p-8">
        <div className="mx-auto max-w-md w-full space-y-6">
          {isVerified && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700">
                Your email has been verified! You can now log in.
              </AlertDescription>
            </Alert>
          )}
          <LoginForm />

          {/* Feature Highlights - Mobile Only */}
          <div className="lg:hidden space-y-4 py-6">
            <h2 className="text-lg font-semibold text-center">Why Join Open Verse?</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-primary/5 rounded-lg">
                <Newspaper className="h-5 w-5 text-primary mb-2" />
                <h3 className="text-sm font-medium">Quality News</h3>
              </div>
              <div className="p-3 bg-primary/5 rounded-lg">
                <MessageSquare className="h-5 w-5 text-primary mb-2" />
                <h3 className="text-sm font-medium">Discussions</h3>
              </div>
              <div className="p-3 bg-primary/5 rounded-lg">
                <TrendingUp className="h-5 w-5 text-primary mb-2" />
                <h3 className="text-sm font-medium">Trends</h3>
              </div>
              <div className="p-3 bg-primary/5 rounded-lg">
                <Users className="h-5 w-5 text-primary mb-2" />
                <h3 className="text-sm font-medium">Community</h3>
              </div>
            </div>
          </div>

          <RegisterForm />

          {/* Latest Updates - Mobile Only */}
          <div className="lg:hidden mt-6 p-4 bg-primary/5 rounded-lg">
            <div className="flex items-center space-x-2 mb-3">
              <Info className="h-4 w-4 text-primary" />
              <h3 className="font-medium">Latest Updates</h3>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>✨ New in Version 1.0:</p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>Multi-language Support (EN, DE, IT, ES, FR, ZH)</li>
                <li>Dark Mode & Theme Customization</li>
                <li>Advanced Admin Dashboard</li>
                <li>Secure Reporting System</li>
                <li>Global Community Connection</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Features Section - Hidden on mobile */}
      <div className="hidden lg:flex flex-col justify-center p-8 bg-primary/5">
        <div className="mx-auto max-w-md w-full">
          <div className="flex items-center space-x-2 mb-8">
            <OpenVerseIcon className="h-20 w-20 text-primary" />
            <div>
              <h1 className="text-4xl font-bold">Open Verse</h1>
              <p className="text-sm text-muted-foreground">Version 1.0</p>
            </div>
          </div>

          <p className="text-xl text-muted-foreground mb-8">
            Join our vibrant community where informed citizens connect, share, and discuss current events, politics, and entertainment.
          </p>

          <div className="space-y-6">
            <div className="flex items-start space-x-3">
              <Newspaper className="h-6 w-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold">Quality News Coverage</h3>
                <p className="text-muted-foreground">Access fact-checked news and in-depth analysis from reliable sources on politics and current events.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <MessageSquare className="h-6 w-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold">Meaningful Discussions</h3>
                <p className="text-muted-foreground">Engage in civil discourse about important political and social issues that matter.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <TrendingUp className="h-6 w-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold">Entertainment & Trends</h3>
                <p className="text-muted-foreground">Stay updated with the latest in entertainment, culture, and trending topics.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Users className="h-6 w-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold">Community Impact</h3>
                <p className="text-muted-foreground">Connect with others who share your interests in politics, news, and entertainment.</p>
              </div>
            </div>

            {/* Latest Updates Section */}
            <div className="mt-12 border-t pt-6">
              <div className="flex items-center space-x-2 mb-4">
                <Info className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Latest Updates</h3>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>✨ New in Version 1.0:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Multi-language Support (EN, DE, IT, ES, FR, ZH)</li>
                  <li>Dark Mode & Theme Customization</li>
                  <li>Advanced Admin Dashboard</li>
                  <li>Secure Reporting System</li>
                  <li>Global Community Connection</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginForm() {
  const { loginMutation } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
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
        <CardTitle>Login</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => loginMutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
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
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input type={showPassword ? "text" : "password"} {...field} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
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
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
              Login
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function RegisterForm() {
  const { registerMutation } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
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
        <CardTitle>Register</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => registerMutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
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
                  <FormLabel>Email</FormLabel>
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
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input type={showPassword ? "text" : "password"} {...field} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
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
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
              Register
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}