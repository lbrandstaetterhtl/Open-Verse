import { useState, useEffect, useMemo } from "react";
import {
  type CustomTheme,
  type ThemeColors,
  defaultTheme,
  applyTheme,
  loadCustomTheme,
  saveCustomTheme,
  CUSTOM_THEME_EVENT,
  type SavedTheme,
  getSavedThemes,
  saveNamedTheme,
  deleteNamedTheme,
  applySavedTheme,
  SAVED_THEMES_EVENT,
  setActiveThemeInfo,
} from "@/lib/theme-utils";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Theme } from "@shared/schema";

export function useCustomTheme() {
  const { user } = useAuth();
  const [customTheme, setCustomTheme] = useState<CustomTheme>(defaultTheme);
  const [localSavedThemes, setLocalSavedThemes] = useState<SavedTheme[]>([]);
  const [isDark, setIsDark] = useState(false);

  // Load custom theme from localStorage on mount and listen for changes
  useEffect(() => {
    const loadTheme = () => {
      const stored = loadCustomTheme();
      if (stored) {
        setCustomTheme(stored);
      }
    };

    const loadSaved = () => {
      setLocalSavedThemes(getSavedThemes());
    };

    loadTheme();
    loadSaved();

    // Listen for theme changes from other components
    window.addEventListener(CUSTOM_THEME_EVENT, loadTheme);
    window.addEventListener(SAVED_THEMES_EVENT, loadSaved);

    // Check initial dark mode
    const dark = document.documentElement.classList.contains("dark");
    setIsDark(dark);

    // Watch for dark mode changes
    const observer = new MutationObserver(() => {
      const newDark = document.documentElement.classList.contains("dark");
      setIsDark(newDark);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
      window.removeEventListener(CUSTOM_THEME_EVENT, loadTheme);
      window.removeEventListener(SAVED_THEMES_EVENT, loadSaved);
    };
  }, []);

  // Apply theme whenever it changes or dark mode toggles
  useEffect(() => {
    const colors = isDark ? customTheme.dark : customTheme.light;
    applyTheme(colors, isDark);
  }, [customTheme, isDark]);

  // Fetch server themes if logged in
  const { data: serverThemes } = useQuery<Theme[]>({
    queryKey: ["/api/user/themes"],
    enabled: !!user,
  });

  // Mutations
  const createThemeMutation = useMutation({
    mutationFn: async (data: { name: string; colors: string }) => {
      const res = await apiRequest("POST", "/api/user/themes", data);
      return await res.json();
    },
    onSuccess: (newTheme, variables) => {
      // Immediately update cache with new theme
      queryClient.setQueryData<Theme[]>(["/api/user/themes"], (old) => {
        if (!old) return [newTheme];
        // Check if theme with same name exists and replace it, otherwise add
        const existing = old.findIndex((t) => t.name === variables.name);
        if (existing >= 0) {
          const updated = [...old];
          updated[existing] = newTheme;
          return updated;
        }
        return [...old, newTheme];
      });
      // Also invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["/api/user/themes"] });
    },
  });

  const deleteThemeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/user/themes/${id}`);
    },
    onSuccess: (_data, deletedId) => {
      // Immediately remove from cache
      queryClient.setQueryData<Theme[]>(["/api/user/themes"], (old) => {
        return old?.filter((t) => t.id !== deletedId) || [];
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/themes"] });
    },
  });

  const savedThemes = useMemo(() => {
    if (!user) return localSavedThemes;

    return (serverThemes || []).map((t) => {
      let colors: CustomTheme;
      try {
        colors = JSON.parse(t.colors);
      } catch {
        colors = defaultTheme;
      }
      return {
        id: t.id,
        name: t.name,
        colors,
        createdAt: new Date(t.createdAt),
      };
    });
  }, [user, serverThemes, localSavedThemes]);

  const updateColor = (mode: "light" | "dark", key: keyof ThemeColors, value: string) => {
    setCustomTheme((prev) => {
      const updated = {
        ...prev,
        [mode]: {
          ...prev[mode],
          [key]: value,
        },
      };
      saveCustomTheme(updated);
      return updated;
    });
  };

  const resetTheme = () => {
    setCustomTheme(defaultTheme);
    saveCustomTheme(defaultTheme);
  };

  const importTheme = (theme: CustomTheme) => {
    setCustomTheme(theme);
    saveCustomTheme(theme);
  };

  const updateThemeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name: string; colors: string } }) => {
      const res = await apiRequest("PATCH", `/api/user/themes/${id}`, data);
      return await res.json();
    },
    onSuccess: (updatedTheme) => {
      // Immediately update cache
      queryClient.setQueryData<Theme[]>(["/api/user/themes"], (old) => {
        if (!old) return [updatedTheme];
        return old.map((t) => (t.id === updatedTheme.id ? updatedTheme : t));
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/themes"] });
    },
  });

  const saveThemeAs = async (
    name: string,
    id?: string | number,
    themeColors?: CustomTheme,
  ): Promise<SavedTheme> => {
    const colorsToSave = themeColors || customTheme;

    if (user) {
      // Check if ID is likely a server ID (number or numeric string)
      const numericId = typeof id === "string" ? parseInt(id, 10) : id;
      const isNumericId = typeof numericId === "number" && !isNaN(numericId);

      // Update existing theme if we have a valid numeric ID
      if (isNumericId && numericId && numericId > 0) {
        try {
          const updatedTheme = await updateThemeMutation.mutateAsync({
            id: numericId,
            data: {
              name,
              colors: JSON.stringify(colorsToSave),
            },
          });
          // Wait for queries to be refetched
          await queryClient.invalidateQueries({ queryKey: ["/api/user/themes"] });
          return {
            id: updatedTheme.id,
            name: updatedTheme.name,
            colors: JSON.parse(updatedTheme.colors),
            createdAt: new Date(updatedTheme.createdAt),
          };
        } catch (error: any) {
          // If update fails with 404 (theme not found), fall back to create/update by name
          console.warn("[use-custom-theme] PATCH failed, falling back to POST:", error);
          if (error?.response?.status === 404 || error?.status === 404) {
            // Fall through to POST logic below
          } else {
            throw error; // Re-throw other errors
          }
        }
      }

      // Create new (or overwrite by name via backend check)
      const newTheme = await createThemeMutation.mutateAsync({
        name,
        colors: JSON.stringify(colorsToSave),
      });
      // Wait for queries to be refetched
      await queryClient.invalidateQueries({ queryKey: ["/api/user/themes"] });
      return {
        id: newTheme.id,
        name: newTheme.name,
        colors: JSON.parse(newTheme.colors),
        createdAt: new Date(newTheme.createdAt),
      };
    } else {
      return saveNamedTheme(name, colorsToSave, id as string);
    }
  };

  const deleteTheme = async (id: string | number) => {
    if (user) {
      if (typeof id === "number") {
        await deleteThemeMutation.mutateAsync(id);
      }
    } else {
      deleteNamedTheme(id as string);
    }
  };

  const loadTheme = async (theme: SavedTheme) => {
    // If logged in and theme has numeric ID, fetch fresh data from server
    if (user && typeof theme.id === "number") {
      try {
        // Force refetch to get latest data
        const freshThemes = await queryClient.fetchQuery<Theme[]>({
          queryKey: ["/api/user/themes"],
          staleTime: 0,
          gcTime: 0,
        });

        const freshTheme = freshThemes.find((t) => t.id === theme.id);

        if (freshTheme) {
          const freshColors = JSON.parse(freshTheme.colors);
          saveCustomTheme(freshColors);
          setActiveThemeInfo(freshTheme.id, freshTheme.name);
          return;
        }
      } catch (error) {}
    }

    // Fallback to cached data
    applySavedTheme(theme);
  };

  return {
    customTheme,
    savedThemes,
    isDark,
    updateColor,
    resetTheme,
    importTheme,
    saveThemeAs,
    deleteTheme,
    loadTheme,
  };
}
