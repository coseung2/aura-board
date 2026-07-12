import {
  Bell,
  BookOpen,
  BriefcaseBusiness,
  BrushCleaning,
  CheckCircle2,
  CircleHelp,
  Footprints,
  Home,
  Landmark,
  LayoutGrid,
  MoreHorizontal,
  Palette,
  ShoppingCart,
  WalletCards,
  type LucideIcon,
} from "lucide-react-native";
import type { StudentNavTarget } from "./student-navigation-core";

const targetIcons: Record<string, LucideIcon> = {
  home: Home,
  boards: LayoutGrid,
  portfolio: BriefcaseBusiness,
  reading: BookOpen,
  walking: Footprints,
  more: MoreHorizontal,
  wallet: WalletCards,
  canva: Palette,
  notifications: Bell,
};

const dutyIcons: Record<string, LucideIcon> = {
  banker: Landmark,
  "store-clerk": ShoppingCart,
  checker: CheckCircle2,
  "cleaning-inspector": BrushCleaning,
  "shoe-inspector": Footprints,
};

export function studentNavIcon(target: StudentNavTarget): LucideIcon {
  if (target.id.startsWith("duty:")) {
    const roleKey = target.id.slice(target.id.lastIndexOf(":") + 1);
    return dutyIcons[roleKey] ?? CircleHelp;
  }
  return targetIcons[target.id] ?? CircleHelp;
}
