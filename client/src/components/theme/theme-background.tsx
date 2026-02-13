import { useEffect, useState } from "react";
import { getBgBlobUrl } from "@/lib/theme-bg-store";
import type { BackgroundConfig } from "@/lib/theme-utils";
import { defaultBackground } from "@/lib/theme-utils";

interface ThemeBackgroundProps {
    background?: BackgroundConfig;
}

/**
 * Global background rendering layer.
 * Reads background config and renders gradient/image with overlay.
 * Must be placed early in the component tree (App.tsx).
 */
export function ThemeBackground({ background }: ThemeBackgroundProps) {
    const bg = background || defaultBackground;
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

    // Don't render anything for solid mode with no overlay
    if (bg.mode === "solid" && bg.overlay.opacity === 0) {
        return null;
    }

    const showGradient = bg.mode === "gradient" && bg.gradient;
    const showImage = bg.mode === "image" && resolvedImageUrl;

    return (
        <div
            className="fixed inset-0 pointer-events-none"
            style={{ zIndex: -1 }}
            aria-hidden="true"
        >
            {/* Gradient layer */}
            {showGradient && (
                <div
                    className="absolute inset-0"
                    style={{ background: bg.gradient }}
                />
            )}

            {/* Image layer */}
            {showImage && (
                <div
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                    style={{ backgroundImage: `url(${resolvedImageUrl})` }}
                />
            )}

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
                />
            )}
        </div>
    );
}
