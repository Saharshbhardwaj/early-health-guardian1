import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface RiskIndicatorProps {
  disease: string;
  risk: number;
  color: "success" | "warning" | "destructive";
}

export const RiskIndicator = ({ disease, risk, color }: RiskIndicatorProps) => {
  const getRiskLevel = (risk: number) => {
    if (risk <= 30) return { level: "Low", variant: "success" as const };
    if (risk <= 60) return { level: "Medium", variant: "warning" as const };
    return { level: "High", variant: "destructive" as const };
  };

  const { level, variant } = getRiskLevel(risk);

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="font-medium text-sm">{disease}</span>
        <Badge variant={variant} className="text-xs">
          {level} Risk
        </Badge>
      </div>
      <Progress value={risk} className="h-2" />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>0%</span>
        <span>{risk}%</span>
        <span>100%</span>
      </div>
    </div>
  );
};