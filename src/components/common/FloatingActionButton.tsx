import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface FloatingActionButtonProps {
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  className?: string;
  variant?: "default" | "outline" | "secondary";
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  onClick,
  icon: Icon,
  label,
  disabled = false,
  className,
  variant = "default",
}) => {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      variant={variant}
      size="lg"
      className={cn(
        // Base styles
        "fixed bottom-6 right-6 z-50",
        "h-14 px-6 rounded-full shadow-lg",
        "flex items-center gap-2",
        // Mobile-first (show by default)
        "md:hidden",
        // Animation
        "transition-all duration-200",
        "hover:scale-105 active:scale-95",
        // Shadow
        "shadow-[0_8px_16px_rgba(0,0,0,0.15)]",
        "dark:shadow-[0_8px_16px_rgba(0,0,0,0.3)]",
        className
      )}
      aria-label={label}
    >
      <Icon className="h-5 w-5" />
      <span className="font-medium">{label}</span>
    </Button>
  );
};

export default FloatingActionButton;
