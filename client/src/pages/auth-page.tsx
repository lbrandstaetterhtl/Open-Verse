import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Redirect } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Globe, MessageSquare, Newspaper, Users, TrendingUp } from "lucide-react";
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
      <div className="flex items-center justify-center p-8">
        <div className="mx-auto max-w-md w-full space-y-8">
          {isVerified && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700">
                Your email has been verified! You can now log in.
              </AlertDescription>
            </Alert>
          )}
          <LoginForm />
          <RegisterForm />
        </div>
      </div>

      <div className="hidden lg:flex flex-col justify-center p-8 bg-primary/5">
        <div className="mx-auto max-w-md w-full">
          <div className="flex items-center space-x-2 mb-8">
            <Globe className="h-12 w-12 text-primary" />
            <div>
              <h1 className="text-4xl font-bold">Pure News</h1>
              <p className="text-sm text-muted-foreground">Version 0.1</p>
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
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginForm() {
  const { loginMutation } = useAuth();
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
                    <Input type="password" {...field} />
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
                    <Input type="password" {...field} />
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