import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorPicker } from "./color-picker";
import { type ThemeColors } from "@/lib/theme-utils";

interface ThemeGroupProps {
  title: string;
  icon?: React.ReactNode;
  colors: ThemeColors;
  colorKeys: (keyof ThemeColors)[];
  onColorChange: (key: keyof ThemeColors, value: string) => void;
}

export function ThemeGroup({ title, icon, colors, colorKeys, onColorChange }: ThemeGroupProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {colorKeys.map((key) => (
          <ColorPicker
            key={key}
            label={key}
            value={colors[key]}
            onChange={(value) => onColorChange(key, value)}
          />
        ))}
      </CardContent>
    </Card>
  );
}
