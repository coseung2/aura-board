import { SlimeNoticeHost } from "./SlimeNoticeHost";
import { SlimePurchaseConfirmDialog } from "./SlimePurchaseConfirmDialog";
import { SlimeShopCartDrawer } from "./SlimeShopCartDrawer";
import type { SlimePetController } from "./useSlimePetController";

type SlimePetPageOverlaysProps = Pick<
  SlimePetController,
  "data" | "status" | "shop" | "cart" | "feedback" | "actions"
>;

/** Purchase confirmation, notices, and cart overlays owned by the pet page. */
export function SlimePetPageOverlays({
  data,
  status,
  shop,
  cart,
  feedback,
  actions,
}: SlimePetPageOverlaysProps) {
  const pendingPurchase = shop.pendingPurchase;

  return (
    <>
      {pendingPurchase ? (
        <SlimePurchaseConfirmDialog
          item={pendingPurchase}
          previewColors={data.ownedKeys}
          balance={data.balance}
          unitLabel={data.unitLabel}
          busy={status.busyItemKey === pendingPurchase.key}
          onCancel={() => shop.setPendingPurchase(null)}
          onAddToCart={(quantity) => cart.addItem(pendingPurchase, quantity)}
          onConfirm={(quantity) => {
            void actions
              .purchaseShopItem(pendingPurchase, quantity)
              .finally(() => shop.setPendingPurchase(null));
          }}
        />
      ) : null}

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
    </>
  );
}
