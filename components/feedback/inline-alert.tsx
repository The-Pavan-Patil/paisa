import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { AlertCircle, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

const variantConfig = {
  error: {
    alert: "destructive" as const,
    icon: AlertCircle,
  },
  warning: {
    alert: "warning" as const,
    icon: TriangleAlert,
  },
  info: {
    alert: "default" as const,
    icon: Info,
  },
};

export function InlineAlert({
  variant,
  title,
  children,
  className,
}: {
  variant: keyof typeof variantConfig;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <Alert variant={config.alert} className={cn("text-xs", className)}>
      <Icon className="size-4" />
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
