"use client";

import styles from "./SlimePetPage.module.css";
import { SlimeNoticeHost } from "./SlimeNoticeHost";
import {
  SlimeCollectionSection,
  SlimeEffectsSection,
} from "./SlimePetSections";
import { SlimePetShopPanel } from "./SlimePetShopPanel";
import { SlimePurchaseConfirmDialog } from "./SlimePurchaseConfirmDialog";
import { SlimeShopCartDrawer } from "./SlimeShopCartDrawer";
import { StudentPetSectionHeader } from "./StudentPetSectionHeader";
import { useSlimePetController } from "./useSlimePetController";

type Props = {
  initialSection?: "mine" | "shop";
};

/**
 * Pet page composition only.
 *
 * Snapshot loading, mutation queues, notices, cart state, and modal focus live in
 * the controller so this component stays responsible for section composition.
 */
export function SlimePetPage({ initialSection = "mine" }: Props) {
  const controller = useSlimePetController();
  const { data, status, shop, wardrobe, cart, feedback, actions } = controller;
  const pendingPurchase = shop.pendingPurchase;

  return (
    <main className={styles.page} data-testid="slime-pet-page">
      <StudentPetSectionHeader active={initialSection} />

      {status.loading && (
        <p className={styles.status} role="status">
          슬라임 정보를 불러오는 중…
        </p>
      )}
      {status.loadError && (
        <div className={styles.status} role="alert">
          <span>슬라임 정보를 불러오지 못했어요.</span>
          <button
            type="button"
            className={styles.retryButton}
            onClick={status.retryLoad}
          >
            다시 시도
          </button>
        </div>
      )}

      {initialSection === "mine" ? (
        <>
          <SlimeCollectionSection
            catalog={data.catalog}
            ownedKeys={data.ownedKeys}
            representativeColor={data.representativeColor}
            shopCatalog={data.shopCatalog}
            ownedItemQuantities={data.ownedItemQuantities}
            equippedItemsByColor={data.equippedItemsByColor}
            equippedFloorByColor={data.equippedFloorByColor}
            growthByColor={data.growthByColor}
            claimedTitles={data.claimedTitles}
            equippedTitleByColor={data.equippedTitleByColor}
            effects={data.effects}
            loading={status.loading}
            loadFailed={status.loadError}
            busyRepresentative={status.busyRepresentative}
            onSetRepresentative={(color) =>
              void actions.setRepresentative(color)
            }
            onFeedCookie={actions.consumeCookie}
            hiddenItemsByColor={data.hiddenItemsByColor}
            onOpenWardrobe={wardrobe.openFor}
          />

          <SlimeEffectsSection effects={data.effects} />
        </>
      ) : (
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
          onRefundSlime={(slime) =>
            void actions.refundSlimePurchase(slime)
          }
          onPurchaseItem={shop.setPendingPurchase}
          onRefundItem={(item) => void actions.refundShopItem(item)}
          onEquipItem={(color, item, nextEquipped) =>
            void actions.equipShopItem(color, item, nextEquipped)
          }
        />
      )}

      {wardrobe.open && (
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
          onRefundSlime={(slime) =>
            void actions.refundSlimePurchase(slime)
          }
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
      )}

      {pendingPurchase && (
        <SlimePurchaseConfirmDialog
          item={pendingPurchase}
          previewColors={data.ownedKeys}
          balance={data.balance}
          unitLabel={data.unitLabel}
          busy={status.busyItemKey === pendingPurchase.key}
          onCancel={() => shop.setPendingPurchase(null)}
          onAddToCart={(quantity) =>
            cart.addItem(pendingPurchase, quantity)
          }
          onConfirm={(quantity) => {
            void actions
              .purchaseShopItem(pendingPurchase, quantity)
              .finally(() => shop.setPendingPurchase(null));
          }}
        />
      )}

      <SlimeNoticeHost
        notices={feedback.notices}
        onDismiss={feedback.dismiss}
      />

      <SlimeShopCartDrawer
        open={cart.open}
        lines={cart.lines}
        unitLabel={data.unitLabel}
        balance={data.balance}
        busy={cart.busy}
        onClose={() => cart.setOpen(false)}
        onChangeQuantity={cart.changeQuantity}
        onRemove={cart.removeLine}
        onCheckout={() => void cart.checkout()}
      />
    </main>
  );
}
