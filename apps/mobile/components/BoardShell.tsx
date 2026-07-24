import { useRouter } from "expo-router";
import { layoutLabel } from "../theme/layout-meta";
import { AppHeader, Pill } from "./ui";

export function BoardHeader({
  title,
  layout,
  onBack,
}: {
  title: string;
  layout: string;
  onBack?: () => void;
}) {
  const router = useRouter();
  const layoutTitle = layoutLabel(layout);

  return (
    <AppHeader
      title={title}
      onBack={onBack ?? (() => router.back())}
      showDailyBanner={false}
      right={layoutTitle !== title ? <Pill>{layoutTitle}</Pill> : undefined}
    />
  );
}
