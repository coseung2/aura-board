import { SlimePetShopPanel } from "./SlimePetShopPanel";
import type { SlimePetController } from "./useSlimePetController";

type SlimePetWardrobeDialogProps = Pick<
  SlimePetController,
  "data" | "status" | "shop" | "wardrobe" | "actions"
>;

/** Owned-item wardrobe rendered with the shared shop presentation. */
export function SlimePetWardrobeDialog({
  data,
  status,
  shop,
  wardrobe,
  actions,
}: SlimePetWardrobeDialogProps) {
  if (!wardrobe.open) return null;

  return (
    <SlimePetShopPanel
      presentation="modal"
      catalog={data.catalog}
      shopCatalog={data.shopCatalog}
      shopItems={wardrobe.items}
      ownedKeys={data.ownedKeys}
      ownedItemKeys={data.ownedItemKeys}
      ownedItemQuantities={data.ownedItemQuantities}
      equippedItemKeys={data.equippedItemKeys}
      equippedItemsByColor={data.equippedItemsByColor}
      hiddenItemsByColor={data.hiddenItemsByColor}
      claimedTitles={data.claimedTitles}
      equippedTitleByColor={data.equippedTitleByColor}
      wardrobeColor={wardrobe.color}
      shopFilter={shop.filter}
      wardrobeFilter={wardrobe.filter}
      unitLabel={data.unitLabel}
      busyColor={status.busyColor}
      busyItemKey={status.busyItemKey}
      busyTitleColor={status.busyTitleColor}
      notice={shop.notice}
      closeButtonRef={wardrobe.closeButtonRef}
      onClose={wardrobe.close}
      onFilterChange={shop.setFilter}
      onWardrobeFilterChange={wardrobe.setFilter}
      onPurchaseSlime={(color) => void actions.purchaseSlime(color)}
      onRefundSlime={(slime) => void actions.refundSlimePurchase(slime)}
      onPurchaseItem={shop.setPendingPurchase}
      onRefundItem={(item) => void actions.refundShopItem(item)}
      onEquipItem={(color, item, nextEquipped) =>
        void actions.equipShopItem(color, item, nextEquipped)
      }
      onToggleItemVisibility={(color, item, isHidden) =>
        void actions.setItemHidden(color, item, isHidden)
      }
      onEquipTitle={(color, titleKey) =>
        void actions.equipPetTitle(color, titleKey)
      }
    />
  );
}
