import { HexColorPicker } from "react-colorful";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RotateCcw, AlertTriangle } from "lucide-react";
import { hslToHex, hexToHsl } from "@/lib/theme-utils";
import { useMemo } from "react";

interface ColorPickerProps {
  label: string;
  description?: string;
  value: string; // HSL format: "215 70% 50%"
  defaultValue?: string;
  contrastAgainst?: string; // HSL value to check contrast ratio against
  onChange: (value: string) => void;
}

function getContrastRatio(hsl1: string, hsl2: string) {
  const getLuminance = (hsl: string) => {
    const parts = hsl.split(" ").map(p => parseFloat(p));
    if (parts.length < 3) return 0;
    const l = parts[2] / 100;
    return l; // Simplified for basic checking, real formula is more complex
  };

  const l1 = getLuminance(hsl1);
  const l2 = getLuminance(hsl2);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return ratio;
}

export function ColorPicker({ label, description, value, defaultValue, contrastAgainst, onChange }: ColorPickerProps) {
  const hexValue = hslToHex(value);

  const handleChange = (hex: string) => {
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      const hsl = hexToHsl(hex);
      onChange(hsl);
    }
  };

  const contrastRatio = useMemo(() => {
    if (!contrastAgainst) return null;
    return getContrastRatio(value, contrastAgainst);
  }, [value, contrastAgainst]);

  return (
    <div className="flex flex-col gap-1 py-3 border-b border-border/50 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <Label className="text-sm font-semibold capitalize">
            {label.replace(/([A-Z])/g, " $1").trim()}
          </Label>
          {description && (
            <span className="text-xs text-muted-foreground leading-tight mt-0.5">
              {description}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {contrastRatio !== null && contrastRatio < 4.5 && (
            <div className="flex items-center text-amber-500 mr-1" title={`Low contrast ratio: ${contrastRatio.toFixed(1)}:1`}>
              <AlertTriangle className="h-4 w-4" />
            </div>
          )}
          
          {defaultValue && value !== defaultValue && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => onChange(defaultValue)}
              title="Reset to default"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}

          <div className="flex items-center bg-background rounded-md border p-1 pr-2 shadow-sm">
            <Popover>
              <PopoverTrigger asChild>
                <button 
                  className="h-6 w-6 rounded border shadow-inner mr-2" 
                  style={{ backgroundColor: hexValue }} 
                />
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="end">
                <HexColorPicker color={hexValue} onChange={handleChange} />
              </PopoverContent>
            </Popover>
            <Input
              value={hexValue.toUpperCase()}
              onChange={(e) => handleChange(e.target.value)}
              className="h-7 w-[85px] text-xs font-mono border-0 p-1 focus-visible:ring-0 bg-transparent"
              maxLength={7}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
