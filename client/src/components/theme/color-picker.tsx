import { HexColorPicker } from "react-colorful";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { hslToHex, hexToHsl } from "@/lib/theme-utils";

interface ColorPickerProps {
    label: string;
    value: string; // HSL format: "215 70% 50%"
    onChange: (value: string) => void;
}

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
    const hexValue = hslToHex(value);

    const handleChange = (hex: string) => {
        const hsl = hexToHsl(hex);
        onChange(hsl);
    };

    return (
        <div className="flex items-center justify-between gap-4 py-2">
            <Label className="text-sm font-medium capitalize">
                {label.replace(/([A-Z])/g, " $1").trim()}
            </Label>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className="w-[120px] justify-start text-left font-normal"
                    >
                        <div
                            className="h-6 w-6 rounded border mr-2"
                            style={{ backgroundColor: hexValue }}
                        />
                        <span className="text-xs">{hexValue.toUpperCase()}</span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="end">
                    <HexColorPicker color={hexValue} onChange={handleChange} />
                    <div className="mt-2 flex items-center gap-2">
                        <div
                            className="h-8 w-16 rounded border flex-shrink-0"
                            style={{ backgroundColor: hexValue }}
                        />
                        <code className="text-xs text-muted-foreground">
                            {hexValue.toUpperCase()}
                        </code>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}
