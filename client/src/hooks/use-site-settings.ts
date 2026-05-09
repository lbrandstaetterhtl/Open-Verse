import { useQuery } from "@tanstack/react-query";

/* HOOK [AS-014]: Site Settings – Provides global access to public system configuration.
   Caches settings and refetches them periodically to reflect admin changes. */

export interface PublicSettings {
  site_name: string;
  maintenance_mode: boolean;
  registration_enabled: boolean;
  site_description: string;
  custom_footer_text: string;
}

export function useSiteSettings() {
  const { data: settings, isLoading, error } = useQuery<PublicSettings>({
    queryKey: ["/api/public/settings"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    settings: {
      site_name: settings?.site_name ?? "Osiris",
      site_description: settings?.site_description ?? "The next generation social platform.",
      maintenance_mode: settings?.maintenance_mode ?? false,
      support_email: settings?.support_email ?? "support@osiris.com",
      custom_footer_text: settings?.custom_footer_text ?? "",
    },
    isLoading,
    error,
  };
}
