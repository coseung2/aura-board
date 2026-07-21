import { useRouter, type Href } from "expo-router";
import {
  Grid3X3,
  StretchHorizontal,
  type LucideIcon,
} from "lucide-react-native";
import { MobileBottomNav } from "./MobileBottomNav";

export type ParentNavItem = "feed" | "home";
type LegacyParentDestination = "notifications" | "add" | "account";

type Props = {
  active: ParentNavItem | LegacyParentDestination;
  notificationCount?: number;
  onFeedPress?: () => void;
  /** @deprecated Compatibility for the former default Home/feed tab. */
  onHomePress?: () => void;
};

const ITEMS: Array<{
  name: ParentNavItem;
  label: string;
  route: Href;
  Icon: LucideIcon;
}> = [
  { name: "feed", label: "피드", route: "/(parent)", Icon: StretchHorizontal },
  { name: "home", label: "홈", route: "/(parent)/home", Icon: Grid3X3 },
];

export function ParentBottomNav({ active, onFeedPress, onHomePress }: Props) {
  const router = useRouter();

  return (
    <MobileBottomNav
      accessibilityLabel="학부모 주요 메뉴"
      items={ITEMS.map(({ name, label, route, Icon }) => {
        const selected = active === name;
        return {
          id: name,
          label,
          Icon,
          active: selected,
          onPress: () => {
            if (name === "feed" && selected) {
              (onFeedPress ?? onHomePress)?.();
              return;
            }
            if (!selected) router.replace(route);
          },
        };
      })}
    />
  );
}
