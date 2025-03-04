import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Redirect } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Coffee, MessageSquare, Image, UserPlus, Bell } from "lucide-react";
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
            <Coffee className="h-12 w-12 text-primary" />
            <div>
              <h1 className="text-4xl font-bold">Pure Coffee</h1>
              <p className="text-sm text-muted-foreground">Version 0.1</p>
            </div>
          </div>

          <p className="text-xl text-muted-foreground mb-8">
            Join our vibrant community where coffee enthusiasts connect, share, and discuss their passion.
          </p>

          <div className="space-y-6">
            <div className="flex items-start space-x-3">
              <MessageSquare className="h-6 w-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold">Engage in Discussions</h3>
                <p className="text-muted-foreground">Start and join meaningful conversations about coffee brewing, roasting, and culture.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Image className="h-6 w-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold">Share Your Coffee Moments</h3>
                <p className="text-muted-foreground">Post photos and videos of your favorite brews, setups, and coffee adventures.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <UserPlus className="h-6 w-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold">Build Your Network</h3>
                <p className="text-muted-foreground">Follow other coffee enthusiasts and grow your coffee community.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Bell className="h-6 w-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold">Stay Connected</h3>
                <p className="text-muted-foreground">Get notified about interactions and never miss important discussions.</p>
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