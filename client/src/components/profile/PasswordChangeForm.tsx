import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { KeyRound, Loader2 } from "lucide-react";
import { apiRequest, queryClient, resetCsrfToken } from "@/lib/queryClient";
import { requiredMessage } from "@/lib/input-limits";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

// Same length rules as the server (shared/schema.ts newPasswordField); the server also rejects common passwords.
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

type PasswordForm = { currentPassword: string; newPassword: string; confirmPassword: string };

/**
 * Change the own password (PATCH /api/profile/password). The server ends every other session of the account
 * and continues this one under a new session id, so the cached CSRF token is dropped afterwards.
 *
 * Rendered inside the profile dialog's <form>, so it has no <form> element of its own: Enter and the button
 * submit only this section.
 */
export function PasswordChangeForm() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const schema = useMemo(
    () =>
      z
        .object({
          currentPassword: z.string().min(1, requiredMessage(t("server:fields.currentPassword"))),
          newPassword: z
            .string()
            .min(PASSWORD_MIN, t("auth.validation.password_min", { count: PASSWORD_MIN }))
            .max(PASSWORD_MAX, t("auth.validation.password_max", { count: PASSWORD_MAX })),
          confirmPassword: z.string(),
        })
        .refine((v) => v.newPassword === v.confirmPassword, {
          path: ["confirmPassword"],
          message: t("profile.password.mismatch", "The new passwords do not match"),
        }),
    [t],
  );

  const form = useForm<PasswordForm>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const changePassword = useMutation({
    mutationFn: async ({ currentPassword, newPassword }: PasswordForm) => {
      const res = await apiRequest("PATCH", "/api/profile/password", { currentPassword, newPassword });
      return res.json();
    },
    onSuccess: (self) => {
      // New session on the server: the old CSRF token belongs to the ended session
      resetCsrfToken();
      if (self && typeof self === "object") queryClient.setQueryData(["/api/user"], self);
      form.reset();
      toast({
        title: t("profile.password.changed_title", "Password changed"),
        description: t("profile.password.changed_desc", "You have been signed out on all other devices."),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("profile.password.change_failed", "The password could not be changed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const submit = form.handleSubmit((data) => {
    if (!changePassword.isPending) changePassword.mutate(data);
  });
  // Enter inside a field must not submit the surrounding profile form
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  const passwordField = (name: keyof PasswordForm, label: string, autoComplete: string, description?: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="ov-label text-[11px]">{label}</FormLabel>
          <FormControl>
            <Input type="password" autoComplete={autoComplete} maxLength={name === "currentPassword" ? 1024 : PASSWORD_MAX} className="h-11 px-4" onKeyDown={onKeyDown} {...field} />
          </FormControl>
          {description && <FormDescription className="text-xs">{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <div className="ov-panel space-y-6 p-6">
        <div className="flex items-center gap-3 font-display text-lg font-semibold">
          <div className="ov-cut h-10 w-10 shrink-0 bg-primary/10 flex items-center justify-center">
            <KeyRound className="h-5 w-5 text-primary" />
          </div>
          {t("profile.password.title", "Change password")}
        </div>
        {passwordField("currentPassword", t("profile.password.current", "Current password"), "current-password")}
        {passwordField("newPassword", t("profile.password.new", "New password"), "new-password",
          t("profile.password.rules", { count: PASSWORD_MIN, defaultValue: "At least {{count}} characters. Very common passwords are not accepted." }))}
        {passwordField("confirmPassword", t("profile.password.confirm", "Repeat new password"), "new-password")}
        <p className="text-xs text-muted-foreground">
          {t("profile.password.sessions_hint", "After the change you stay signed in here; all other sessions are signed out.")}
        </p>
        <div className="flex justify-end">
          <Button type="button" onClick={() => submit()} disabled={changePassword.isPending}>
            {changePassword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {t("profile.password.submit", "Change password")}
          </Button>
        </div>
      </div>
    </Form>
  );
}
