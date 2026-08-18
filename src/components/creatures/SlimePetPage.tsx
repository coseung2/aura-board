"use client";

import { styles } from "./SlimePetPage.styles";
import { SlimePetLoadState } from "./SlimePetLoadState";
import { SlimePetMineContent } from "./SlimePetMineContent";
import { SlimePetPageOverlays } from "./SlimePetPageOverlays";
import { SlimePetShopContent } from "./SlimePetShopContent";
import { SlimePetWardrobeDialog } from "./SlimePetWardrobeDialog";
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

  return (
    <main className={styles.page} data-testid="slime-pet-page">
      <StudentPetSectionHeader active={initialSection} />

      <SlimePetLoadState
        loading={status.loading}
        loadError={status.loadError}
        onRetry={status.retryLoad}
      />

      {initialSection === "mine" ? (
        <SlimePetMineContent
          data={data}
          status={status}
          wardrobe={wardrobe}
          actions={actions}
        />
      ) : (
        <SlimePetShopContent
          data={data}
          status={status}
          shop={shop}
          cart={cart}
          actions={actions}
        />
      )}

      <SlimePetWardrobeDialog
        data={data}
        status={status}
        shop={shop}
        wardrobe={wardrobe}
        actions={actions}
      />

      <SlimePetPageOverlays
        data={data}
        status={status}
        shop={shop}
        cart={cart}
        feedback={feedback}
        actions={actions}
      />
    </main>
  );
}
