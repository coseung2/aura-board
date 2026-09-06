import type { Dispatch, SetStateAction } from "react";
import type { CardData } from "../DraggableCard";
import type { EditCardUpdates } from "../EditCardModal";

type Options = {
  card: CardData;
  updates: EditCardUpdates;
  headers?: Record<string, string>;
  normalizeCard?: (card: CardData) => CardData;
  setCards: Dispatch<SetStateAction<CardData[]>>;
  setOpenCard: Dispatch<SetStateAction<CardData | null>>;
};

/** Roll back only fields still owned by this optimistic update, not new events. */
export function rollbackCardPatch(current: CardData, previous: CardData, patch: Partial<CardData>): CardData {
  const rollback: Partial<CardData> = {};
  for (const key of Object.keys(patch) as Array<keyof CardData>) {
    if (Object.is(current[key], patch[key])) Object.assign(rollback, { [key]: previous[key] });
  }
  return { ...current, ...rollback };
}

export async function saveCardEdit({ card, updates, headers = {}, setCards, setOpenCard, normalizeCard = (value) => value }: Options): Promise<void> {
  const { attachments, ...rest } = updates;
  const patch: Partial<CardData> = { ...rest };
  if (attachments) {
    patch.attachments = attachments.map((attachment, index) => ({
      id: attachment.tempId && !attachment.tempId.startsWith("legacy-") && !attachment.tempId.startsWith("tmp-")
        ? attachment.tempId : `opt-${index}-${attachment.kind}`,
      kind: attachment.kind,
      url: attachment.url,
      previewUrl: attachment.previewUrl ?? null,
      fileName: attachment.fileName ?? null,
      fileSize: attachment.fileSize ?? null,
      mimeType: attachment.mimeType ?? null,
      order: index,
    }));
  }
  const update = (transform: (current: CardData) => CardData) => {
    setCards((current) => current.map((item) => item.id === card.id ? transform(item) : item));
    setOpenCard((current) => current?.id === card.id ? transform(current) : current);
  };
  update((current) => ({ ...current, ...patch }));
  try {
    const response = await fetch(`/api/cards/${card.id}`, {
      method: "PATCH", headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error("card_save_failed");
  } catch (error) {
    update((current) => rollbackCardPatch(current, card, patch));
    // Modals keep the draft open on rejection; never turn failure into success.
    throw error;
  }

  // The write is committed. A failed reconciliation is not a failed write.
  const response = await fetch(`/api/cards/${card.id}`, { headers }).catch(() => null);
  const payload = response?.ok ? await response.json().catch(() => null) : null;
  if (payload?.card?.id === card.id) update(() => normalizeCard(payload.card as CardData));
}
