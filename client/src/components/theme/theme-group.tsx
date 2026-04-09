import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorPicker } from "./color-picker";
import { type ThemeColors } from "@/lib/theme-utils";

interface ThemeGroupProps {
  title: string;
  icon?: React.ReactNode;
  colors: ThemeColors;
  defaultColors?: ThemeColors;
  colorKeys: (keyof ThemeColors)[];
  onColorChange: (key: keyof ThemeColors, value: string) => void;
  descriptions?: Partial<Record<keyof ThemeColors, string>>;
  contrastPairs?: Partial<Record<keyof ThemeColors, keyof ThemeColors>>;
}

export function ThemeGroup({ 
  title, 
  icon, 
  colors, 
  defaultColors,
  colorKeys, 
  onColorChange,
  descriptions = {},
  contrastPairs = {}
}: ThemeGroupProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-bold">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 pt-0">
        {colorKeys.map((key) => (
          <ColorPicker
            key={key}
            label={key}
            description={descriptions[key]}
            value={colors[key]}
            defaultValue={defaultColors?.[key]}
            contrastAgainst={contrastPairs[key] ? colors[contrastPairs[key]!] : undefined}
            onChange={(value) => onColorChange(key, value)}
          />
        ))}
      </CardContent>
    </Card>
  );
}
