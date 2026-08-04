import { SlimePetShopPanel } from "./SlimePetShopPanel";
import type { SlimePetController } from "./useSlimePetController";

type SlimePetShopContentProps = Pick<
  SlimePetController,
  "data" | "status" | "shop" | "cart" | "actions"
>;

/** Inline store shown by the page-level shop tab. */
export function SlimePetShopContent({
  data,
  status,
  shop,
  cart,
  actions,
}: SlimePetShopContentProps) {
  return (
    <SlimePetShopPanel
      presentation="inline"
      catalog={data.catalog}
      shopCatalog={data.shopCatalog}
      shopItems={shop.visibleItems}
      ownedKeys={data.ownedKeys}
      ownedItemKeys={data.ownedItemKeys}
      ownedItemQuantities={data.ownedItemQuantities}
      equippedItemKeys={data.equippedItemKeys}
      equippedItemsByColor={data.equippedItemsByColor}
      hiddenItemsByColor={data.hiddenItemsByColor}
      growthByColor={data.growthByColor}
      wardrobeColor={null}
      shopFilter={shop.filter}
      unitLabel={data.unitLabel}
      busyColor={status.busyColor}
      busyItemKey={status.busyItemKey}
      notice={shop.notice}
      cartCount={cart.count}
      onOpenCart={() => cart.setOpen(true)}
      searchQuery={shop.searchQuery}
      onSearchQueryChange={shop.setSearchQuery}
      onFilterChange={shop.setFilter}
      onPurchaseSlime={(color) => void actions.purchaseSlime(color)}
      onRefundSlime={(slime) => void actions.refundSlimePurchase(slime)}
      onPurchaseItem={shop.setPendingPurchase}
      onRefundItem={(item) => void actions.refundShopItem(item)}
      onEquipItem={(color, item, nextEquipped) =>
        void actions.equipShopItem(color, item, nextEquipped)
      }
    />
  );
}
