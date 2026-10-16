import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
  hasPermission: (permission: string) => boolean;
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 5 * 60 * 1000, 
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      return await res.json();
    },
    onSuccess: (data: SelectUser) => {
      queryClient.clear();
      queryClient.setQueryData(["/api/user"], data);
      toast({
        title: t("auth.welcome_back.title", { defaultValue: "Willkommen zurück, {{name}}!", name: data.displayName || data.username }),
        description: t("auth.welcome_back.description", "Schön, dich wiederzusehen."),
        duration: 4000,
      });
    },
    onError: (err: Error) => {
      toast({
        title: t("auth.login_failed", "Anmeldung fehlgeschlagen"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      const res = await apiRequest("POST", "/api/register", credentials);
      return await res.json();
    },
    onSuccess: (data: SelectUser) => {
      queryClient.clear();
      queryClient.setQueryData(["/api/user"], data);
      sessionStorage.setItem("isNewUser", "true");
    },
    onError: (err: Error) => {
      toast({
        title: t("auth.register_failed", "Registrierung fehlgeschlagen"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(["/api/user"], null);
    },
    onError: (err: Error) => {
      toast({
        title: t("auth.logout_failed", "Abmelden fehlgeschlagen"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    if (user.role === 'owner') return true;
    
    const perms = (user as any).adminGroup?.permissions;
    if (!perms) return false;
    
    try {
      const parsed = typeof perms === 'string' ? JSON.parse(perms) : perms;
      return Array.isArray(parsed) && parsed.includes(permission);
    } catch (e) {
      return false;
    }
  };

  const contextValue = useMemo<AuthContextType>(
    () => ({
      user: user ?? null,
      isLoading,
      error,
      loginMutation,
      logoutMutation,
      registerMutation,
      hasPermission,
    }),
    [user, isLoading, error, loginMutation, logoutMutation, registerMutation],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
