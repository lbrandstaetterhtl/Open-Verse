import { useEffect, useState } from "react";
import { getBgBlobUrl } from "@/lib/theme-bg-store";
import type { BackgroundConfig } from "@/lib/theme-utils";
import { defaultBackground, defaultLightBackground } from "@/lib/theme-utils";

interface ThemeBackgroundProps {
    background?: BackgroundConfig;
    isDark?: boolean;
}

/**
 * Global background rendering layer.
 * Reads background config and renders gradient/image with overlay.
 * Must be placed early in the component tree (App.tsx).
 */
export function ThemeBackground({ background, isDark = true }: ThemeBackgroundProps) {
    const bg = background || (isDark ? defaultBackground : defaultLightBackground);
    const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(null);

    // Resolve image URL based on type
    useEffect(() => {
        let objectUrl: string | null = null;

        async function resolve() {
            if (bg.mode !== "image" || !bg.image) {
                setResolvedImageUrl(null);
                return;
            }

            switch (bg.image.type) {
                case "url":
                    setResolvedImageUrl(bg.image.value);
                    break;
                case "fileRef":
                    // Server-stored file, served from /uploads/
                    setResolvedImageUrl(`/uploads/${bg.image.value}`);
                    break;
                case "dataRef":
                    // Guest-stored blob in IndexedDB
                    try {
                        objectUrl = await getBgBlobUrl(bg.image.value);
                        setResolvedImageUrl(objectUrl);
                    } catch (err) {
                        console.error("Failed to load background image from DB:", err);
                        setResolvedImageUrl(null);
                    }
                    break;
                default:
                    setResolvedImageUrl(null);
            }
        }

        resolve();

        return () => {
            // Revoke object URL on cleanup to prevent memory leaks
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [bg.mode, bg.image?.type, bg.image?.value]);



    const showGradient = bg.mode === "gradient" && bg.gradient;
    const showImage = bg.mode === "image" && resolvedImageUrl;

    const filter = `brightness(${bg.overlay.brightness ?? 1}) contrast(${bg.overlay.contrast ?? 1})`;

    return (
        <div
            className="fixed inset-0 pointer-events-none -z-10"
            aria-hidden="true"
        >
            {/* Solid layer — uses --background CSS var so Layout Colors changes are visible */}
            {bg.mode === "solid" && (
                <div className="absolute inset-0 bg-background" />
            )}
            {/* Gradient layer */}
            {showGradient && (
                <div
                    className="absolute inset-0"
                    style={{ 
                        background: bg.gradient,
                        filter: filter
                    }}
                />
            )}

            {/* Image layer */}
            {showImage && (
                <div
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                    style={{ 
                        backgroundImage: `url(${resolvedImageUrl})`,
                        filter: filter
                    }}
                />
            )}

            {/* Stardust Texture Layer (Global Space Theme) */}
            <div className="absolute inset-0 starfield opacity-40 mix-blend-overlay pointer-events-none dark:block hidden" />

            {/* Overlay layer (tint + blur) */}
            {(bg.overlay.opacity > 0 || bg.overlay.blur > 0) && (
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundColor: `hsl(${bg.overlay.tint} / ${bg.overlay.opacity})`,
                        ...(bg.overlay.blur > 0
                            ? { backdropFilter: `blur(${bg.overlay.blur}px)` }
                            : {}),
                    }}
                >
                    {/* Starfield for Dark Mode */}
                    <div className="absolute inset-0 overflow-hidden opacity-40 dark:block hidden pointer-events-none">
                        <div className="starfield" />
                        <div className="starfield" style={{ animationDelay: '-60s', opacity: 0.2 }} />
                    </div>
                </div>
            )}
        </div>
    );
}
