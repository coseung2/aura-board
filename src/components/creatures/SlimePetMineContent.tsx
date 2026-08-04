import {
  SlimeCollectionSection,
  SlimeEffectsSection,
} from "./SlimePetSections";
import type { SlimePetController } from "./useSlimePetController";

type SlimePetMineContentProps = Pick<
  SlimePetController,
  "data" | "status" | "wardrobe" | "actions"
>;

/** Owned-pet collection and its account-wide effect summary. */
export function SlimePetMineContent({
  data,
  status,
  wardrobe,
  actions,
}: SlimePetMineContentProps) {
  return (
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
  );
}
