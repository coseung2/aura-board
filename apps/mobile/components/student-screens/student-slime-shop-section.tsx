import type { SlimeCatalogItem } from "../../lib/slimes";
import type { SlimeShopItem } from "../../lib/slimes";
import { ContentTab } from "../../components/NavigationTabs";
import { ContentTabs } from "../../components/NavigationTabs";
import { SlimeCharacterCatalogCard } from "../../components/slime/SlimeShopCatalogCards";
import { SlimeShopItemCard } from "../../components/slime/SlimeShopCatalogCards";
import { Text } from "react-native";
import { View } from "react-native";
import { styles } from "./student-slime.styles";
import type { StudentSlimeScreenViewModel } from "../../lib/student-slime-screen/student-slime-screen.types";

export function StudentSlimeShopSection({
  model,
}: {
  model: StudentSlimeScreenViewModel;
}) {
  const {
    home,
    shopNavItems,
    shopFilter,
    setShopFilter,
    shopOverviewSections,
    visibleShopItems,
    nestedShopGroups,
    visibleShopTiers,
    selectedColor,
    busyItemKey,
    confirmItemPurchase,
    busyColor,
    confirmSlimePurchase,
  } = model;
  const renderShopItemCard = (item: SlimeShopItem) => (
    <SlimeShopItemCard
      key={item.key}
      item={item}
      selectedColor={selectedColor}
      unitLabel={home?.unitLabel ?? "원"}
      ownedItemKeys={home?.ownedItemKeys ?? []}
      ownedItemQuantities={home?.ownedItemQuantities ?? {}}
      busyItemKey={busyItemKey}
      onPress={confirmItemPurchase}
    />
  );

  const renderSlimeShopCard = (slime: SlimeCatalogItem) => (
    <SlimeCharacterCatalogCard
      key={slime.key}
      slime={slime}
      unitLabel={home?.unitLabel ?? "원"}
      ownedColors={home?.ownedColors ?? []}
      busyColor={busyColor}
      onPress={confirmSlimePurchase}
    />
  );
  return (
    <View style={styles.shopPage} accessibilityLabel="슬라임 상점">
      <Text style={styles.shopBalance}>
        {home?.balance.toLocaleString() ?? 0}
        {home?.unitLabel ?? "원"}
      </Text>
      <ContentTabs
        style={styles.shopNav}
        accessibilityLabel="상점 상품 카테고리"
      >
        {shopNavItems.map((tab) => (
          <ContentTab
            key={tab.key}
            style={styles.shopNavItem}
            selected={shopFilter === tab.key}
            onPress={() => setShopFilter(tab.key)}
          >
            {tab.label}
          </ContentTab>
        ))}
      </ContentTabs>
      <View style={styles.shopContent}>
        {shopFilter === "all" ? (
          <View style={styles.shopOverview} accessibilityLabel="전체 상품">
            {shopOverviewSections.map((overviewSection) => (
              <View
                key={overviewSection.key}
                style={styles.shopOverviewSection}
              >
                <Text style={styles.shopOverviewHeading}>
                  {overviewSection.label}
                </Text>
                <View style={styles.shopTierItems}>
                  {overviewSection.characters.map(renderSlimeShopCard)}
                  {overviewSection.items.map(renderShopItemCard)}
                </View>
              </View>
            ))}
          </View>
        ) : shopFilter === "character" ? (
          <View style={styles.floorList}>
            {home?.catalog.map(renderSlimeShopCard)}
          </View>
        ) : (
          <View style={styles.shopTierList}>
            {visibleShopItems.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>이 분류에는 상품이 없어요.</Text>
              </View>
            ) : nestedShopGroups ? (
              // Outfits and props nest two levels: a ruled divider per
              // sub-category, then price bands inside it separated by spacing.
              nestedShopGroups.map((group, groupIndex) => (
                <View key={group.key} style={styles.shopTierGroup}>
                  {groupIndex > 0 ? (
                    <View style={styles.shopOutfitDivider} />
                  ) : null}
                  <Text style={styles.shopOutfitLabel}>{group.label}</Text>
                  {group.tiers.map((tier) => (
                    <View key={tier.price} style={styles.shopTierGroup}>
                      {tier.label ? (
                        <Text style={styles.shopTierLabel}>{tier.label}</Text>
                      ) : null}
                      <View style={styles.shopTierItems}>
                        {tier.items.map((item) => renderShopItemCard(item))}
                      </View>
                    </View>
                  ))}
                </View>
              ))
            ) : (
              visibleShopTiers.map((group) => (
                <View key={group.price} style={styles.shopTierGroup}>
                  {group.label ? (
                    <Text style={styles.shopTierLabel}>{group.label}</Text>
                  ) : null}
                  <View style={styles.shopTierItems}>
                    {group.items.map((item) => renderShopItemCard(item))}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </View>
    </View>
  );
}
