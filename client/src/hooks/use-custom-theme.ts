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
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/user/themes"] });
        }
    });

    const deleteThemeMutation = useMutation({
        mutationFn: async (id: number) => {
            await apiRequest("DELETE", `/api/user/themes/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/user/themes"] });
        }
    });

    const savedThemes = useMemo(() => {
        if (!user) return localSavedThemes;

        return (serverThemes || []).map(t => {
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

    const saveThemeAs = async (name: string, id?: string | number): Promise<SavedTheme> => {
        if (user) {
            // Note: Update not supported on backend yet, always creating new
            const newTheme = await createThemeMutation.mutateAsync({
                name,
                colors: JSON.stringify(customTheme)
            });
            return {
                id: newTheme.id,
                name: newTheme.name,
                colors: JSON.parse(newTheme.colors),
                createdAt: new Date(newTheme.createdAt),
            };
        } else {
            return saveNamedTheme(name, customTheme, id as string);
        }
    };

    const deleteTheme = async (id: string | number) => {
        if (user) {
            if (typeof id === 'number') {
                await deleteThemeMutation.mutateAsync(id);
            }
        } else {
            deleteNamedTheme(id as string);
        }
    };

    const loadTheme = (theme: SavedTheme) => {
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
