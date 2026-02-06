import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";
import Logo from "/logo.png";
import LogoLight from "/logo-light.png";

const sizeMap = {
  sm: { img: "h-4", text: "text-sm leading-none" },
  md: { img: "h-6", text: "text-lg leading-none" },
  lg: { img: "h-10", text: "text-3xl leading-none" },
  xl: { img: "h-14", text: "text-5xl leading-none" },
};

interface ProfileAvatarProps {
  avatarEmoji: string;
  size?: keyof typeof sizeMap;
  className?: string;
}

export default function ProfileAvatar({ avatarEmoji, size = "md", className }: ProfileAvatarProps) {
  const { theme } = useTheme();
  const s = sizeMap[size];

  if (avatarEmoji === "logo") {
    return (
      <img
        src={theme === "dark" ? Logo : LogoLight}
        alt="Duck-UI"
        className={cn(s.img, className)}
      />
    );
  }

  return <span className={cn(s.text, className)}>{avatarEmoji}</span>;
}
