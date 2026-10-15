import { HexColorPicker } from "react-colorful";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RotateCcw, AlertTriangle } from "lucide-react";
import { getContrastRatio, hslToHex, hexToHsl } from "@/lib/theme-utils";
import { useMemo } from "react";

interface ColorPickerProps {
  label: string;
  description?: string;
  value: string; // HSL format: "215 70% 50%"
  defaultValue?: string;
  contrastAgainst?: string; // HSL value to check contrast ratio against
  onChange: (value: string) => void;
}

export function ColorPicker({ label, description, value, defaultValue, contrastAgainst, onChange }: ColorPickerProps) {
  const hexValue = hslToHex(value);

  const handleChange = (hex: string) => {
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      const hsl = hexToHsl(hex);
      onChange(hsl);
    }
  };

  const contrastInfo = useMemo(() => {
    if (!contrastAgainst) return null;
    const ratio = getContrastRatio(value, contrastAgainst);
    let status: "AAA" | "AA" | "Fail" = "Fail";
    if (ratio >= 7) status = "AAA";
    else if (ratio >= 4.5) status = "AA";
    return { ratio, status };
  }, [value, contrastAgainst]);

  return (
    <div className="flex flex-col gap-1 py-3 border-b border-border/50 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <Label className="text-sm font-semibold capitalize">
            {label.replaceAll(/([A-Z])/g, " $1").trim()}
          </Label>
          {description && (
            <span className="text-xs text-muted-foreground leading-tight mt-0.5">
              {description}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {contrastInfo && (
            <div
              className={`ov-chip ov-data mr-1 h-5 gap-1 px-1.5 text-[10px] font-semibold ${
                contrastInfo.status === "AAA" ? "ov-chip-success text-foreground" :
                contrastInfo.status === "AA" ? "ov-chip-primary" :
                "ov-chip-danger"
              }`}
              title={`Contrast ratio: ${contrastInfo.ratio.toFixed(1)}:1 (${contrastInfo.status})`}
            >
              {contrastInfo.status === "Fail" && <AlertTriangle className="h-2.5 w-2.5" />}
              {contrastInfo.status}
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

          <div className="flex items-center rounded-sm border border-input bg-background p-1 pr-2">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="mr-2 h-6 w-6 rounded-xs border border-border"
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
              className="h-7 w-[85px] border-0 bg-transparent p-1 font-data text-xs focus-visible:ring-0"
              maxLength={7}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
