import type { RefObject } from "react";

import type {
  SlimeColor,
  SlimeDefinition,
  SlimeShopItem,
} from "@/lib/pets/types";

import { styles } from "./SlimePetPage.styles";
import {
  slimeShopNavItems,
  slimeWardrobeNavItems,
  type ClaimedTitle,
  type EquippedItemsByColor,
  type Notice,
  type ShopFilter,
  type WardrobeFilter,
} from "./SlimePetModel";
import { SlimeShopCatalogContent } from "./SlimeShopCatalogContent";
import type { SlimeShopItemCardContext } from "./SlimeShopItemLists";
import { SlimeShopNavigation } from "./SlimeShopNavigation";
import { SlimeShopPanelShell } from "./SlimeShopPanelShell";

export type SlimePetShopPanelProps = {
  presentation?: "modal" | "inline";
  catalog: SlimeDefinition[];
  /** Full shop catalog used for top-level tab availability. */
  shopCatalog: SlimeShopItem[];
  /** Items currently shown in the active tab/panel. */
  shopItems: SlimeShopItem[];
  ownedKeys: SlimeColor[];
  ownedItemKeys: string[];
  ownedItemQuantities: Record<string, number>;
  equippedItemKeys: string[];
  equippedItemsByColor: EquippedItemsByColor;
  hiddenItemsByColor?: Partial<Record<SlimeColor, string[]>>;
  growthByColor?: Partial<Record<SlimeColor, { stage?: number }>>;
  claimedTitles?: ClaimedTitle[];
  equippedTitleByColor?: Partial<Record<SlimeColor, string>>;
  wardrobeColor: SlimeColor | null;
  shopFilter: ShopFilter;
  wardrobeFilter?: WardrobeFilter;
  unitLabel: string;
  busyColor: SlimeColor | null;
  busyItemKey: string | null;
  busyTitleColor?: SlimeColor | null;
  notice: Notice | null;
  cartCount?: number;
  onOpenCart?: () => void;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  onClose?: () => void;
  onFilterChange: (filter: ShopFilter) => void;
  onWardrobeFilterChange?: (filter: WardrobeFilter) => void;
  onPurchaseSlime: (color: SlimeColor) => void;
  onRefundSlime: (slime: SlimeDefinition) => void;
  onPurchaseItem: (item: SlimeShopItem) => void;
  onRefundItem: (item: SlimeShopItem) => void;
  onEquipItem: (
    color: SlimeColor,
    item: SlimeShopItem,
    nextEquipped: boolean,
  ) => void;
  onToggleItemVisibility?: (
    color: SlimeColor,
    item: SlimeShopItem,
    isHidden: boolean,
  ) => void;
  onEquipTitle?: (color: SlimeColor, titleKey: string | null) => void;
};

/** Shared shell and navigation for the inline shop and wardrobe modal. */
export function SlimePetShopPanel({
  presentation = "modal",
  catalog,
  shopCatalog,
  shopItems,
  ownedKeys,
  ownedItemKeys,
  ownedItemQuantities,
  equippedItemKeys,
  equippedItemsByColor,
  hiddenItemsByColor = {},
  growthByColor = {},
  claimedTitles = [],
  equippedTitleByColor = {},
  wardrobeColor,
  shopFilter,
  wardrobeFilter = "floor",
  unitLabel,
  busyColor,
  busyItemKey,
  busyTitleColor = null,
  cartCount = 0,
  onOpenCart,
  searchQuery = "",
  onSearchQueryChange,
  closeButtonRef,
  onClose,
  onFilterChange,
  onWardrobeFilterChange,
  onPurchaseSlime,
  onRefundSlime,
  onPurchaseItem,
  onRefundItem,
  onEquipItem,
  onToggleItemVisibility,
  onEquipTitle,
}: SlimePetShopPanelProps) {
  const wardrobe = Boolean(wardrobeColor);
  const wardrobeName =
    catalog.find((slime) => slime.color === wardrobeColor)?.nameKo ?? "슬라임";
  const navigationItems = wardrobe
    ? slimeWardrobeNavItems(shopCatalog)
    : slimeShopNavItems(shopCatalog);
  const activeFilter = wardrobe ? wardrobeFilter : shopFilter;
  const cardContext: SlimeShopItemCardContext = {
    wardrobe,
    wardrobeColor,
    wardrobeFilter,
    unitLabel,
    ownedItemKeys,
    ownedItemQuantities,
    equippedItemKeys,
    equippedItemsByColor,
    hiddenItemsByColor,
    busyItemKey,
    onPurchaseItem,
    onRefundItem,
    onEquipItem,
    onToggleItemVisibility,
  };

  return (
    <SlimeShopPanelShell
      presentation={presentation}
      wardrobe={wardrobe}
      wardrobeName={wardrobeName}
      closeButtonRef={closeButtonRef}
      onClose={onClose}
    >
      <SlimeShopNavigation
        items={navigationItems}
        activeKey={activeFilter}
        wardrobe={wardrobe}
        catalog={catalog}
        shopCatalog={shopCatalog}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        cartCount={cartCount}
        onOpenCart={onOpenCart}
        onSelect={(key) => {
          if (wardrobe) {
            onWardrobeFilterChange?.(key as WardrobeFilter);
          } else {
            onFilterChange(key as ShopFilter);
          }
        }}
      />
      <div
        id="slime-shop-panel"
        role="tabpanel"
        aria-labelledby={`slime-shop-tab-${activeFilter}`}
        tabIndex={0}
        className={styles.shopPanel}
      >
        <SlimeShopCatalogContent
          catalog={catalog}
          shopCatalog={shopCatalog}
          shopItems={shopItems}
          navigationItems={navigationItems}
          ownedKeys={ownedKeys}
          ownedItemKeys={ownedItemKeys}
          equippedItemsByColor={equippedItemsByColor}
          growthByColor={growthByColor}
          claimedTitles={claimedTitles}
          equippedTitleByColor={equippedTitleByColor}
          wardrobe={wardrobe}
          wardrobeColor={wardrobeColor}
          shopFilter={shopFilter}
          wardrobeFilter={wardrobeFilter}
          searchQuery={searchQuery}
          unitLabel={unitLabel}
          busyColor={busyColor}
          busyItemKey={busyItemKey}
          busyTitleColor={busyTitleColor}
          cardContext={cardContext}
          onFilterChange={onFilterChange}
          onWardrobeFilterChange={onWardrobeFilterChange}
          onPurchaseSlime={onPurchaseSlime}
          onRefundSlime={onRefundSlime}
          onEquipTitle={onEquipTitle}
        />
      </div>
    </SlimeShopPanelShell>
  );
}

/** @deprecated Prefer SlimePetShopPanel. Kept for local import compatibility. */
export const SlimePetShopDrawer = SlimePetShopPanel;
