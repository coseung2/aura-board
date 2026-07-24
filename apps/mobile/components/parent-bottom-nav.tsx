import { forwardRef } from "react";
import { useRouter, type Href } from "expo-router";
import { Footprints, StretchHorizontal, type LucideIcon, type LucideProps } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { borders } from "../theme/tokens";
import { MobileBottomNav } from "./MobileBottomNav";

export type ParentNavItem = "feed" | "home" | "walking";
type LegacyParentDestination = "notifications" | "add" | "account";
type Props = { active: ParentNavItem | LegacyParentDestination; notificationCount?: number; onFeedPress?: () => void; onHomePress?: () => void };

export function ParentBottomNav({ active, onFeedPress, onHomePress }: Props) {
  const router = useRouter();
  return (
    <MobileBottomNav
      accessibilityLabel="학부모 주요 메뉴"
      items={ITEMS.map(({ name, label, route, Icon }) => {
        const selected = active === name;
        return { id: name, label, Icon, active: selected, solidActiveIcon: true, onPress: () => { if (name === "feed" && selected) { (onFeedPress ?? onHomePress)?.(); return; } if (!selected) router.replace(route); } };
      })}
    />
  );
}

const NineGridIcon = forwardRef<View, LucideProps>(function NineGridIcon(
  { size = 24, color, fill },
  ref,
) {
  const dimension = typeof size === "number" ? size : 24;
  const gap = Math.max(2, Math.round(dimension * 0.12));
  const isFilled = Boolean(fill && fill !== "none" && fill !== "transparent");
  const cellBorder = isFilled ? borders.none : borders.hairline;
  const cell = Math.max(3, Math.floor((dimension - gap * 2) / 3));
  const cellAppearance = isFilled
    ? { backgroundColor: color }
    : {
        backgroundColor: "transparent",
        borderColor: color,
        borderWidth: cellBorder,
      };
  return (
    <View
      ref={ref}
      accessible={false}
      style={[styles.nineGrid, { width: dimension, height: dimension, gap }]}
    >
      {Array.from({ length: 9 }, (_, index) => (
        <View
          key={index}
          style={[styles.cell, { width: cell, height: cell }, cellAppearance]}
        />
      ))}
    </View>
  );
}) as LucideIcon;

const ITEMS: Array<{ name: ParentNavItem; label: string; route: Href; Icon: LucideIcon }> = [
  { name: "feed", label: "피드", route: "/(parent)", Icon: StretchHorizontal },
  { name: "home", label: "홈", route: "/(parent)/home", Icon: NineGridIcon },
  { name: "walking", label: "걷기", route: "/(parent)/walking" as Href, Icon: Footprints },
];

const styles = StyleSheet.create({
  nineGrid: { flexDirection: "row", flexWrap: "wrap", alignContent: "center", justifyContent: "center" },
  cell: {},
});
