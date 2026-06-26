"use client";

import { useCallback } from "react";
import {
  MAX_LAYERS,
  createLayer,
  duplicateLayer,
  type CanvasSize,
} from "../canvas/LayerStack";
import type { BlendMode, Layer } from "../canvas/types";
import type { InsertableAsset } from "../AssetInsertModal";

type Args = {
  layers: Layer[];
  canvasSize: CanvasSize;
  setLayers: React.Dispatch<React.SetStateAction<Layer[]>>;
  setActiveLayerId: (id: string) => void;
};

export function useLayerOps({
  layers,
  canvasSize,
  setLayers,
  setActiveLayerId,
}: Args) {
  const addLayer = useCallback(() => {
    if (layers.length >= MAX_LAYERS) return;
    const next = createLayer({
      name: `레이어 ${layers.length}`,
      size: canvasSize,
    });
    setLayers((c) => [...c, next]);
    setActiveLayerId(next.id);
    // canvasSize / setActiveLayerId / setLayers are stable references in caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers.length]);

  const deleteLayer = useCallback(
    (id: string) => {
      if (layers.length <= 1) return;
      setLayers((c) => c.filter((l) => l.id !== id));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [layers.length]
  );

  const duplicateAt = useCallback(
    (id: string) => {
      if (layers.length >= MAX_LAYERS) return;
      const src = layers.find((l) => l.id === id);
      if (!src) return;
      const copy = duplicateLayer(src);
      setLayers((c) => {
        const idx = c.findIndex((l) => l.id === id);
        const next = [...c];
        next.splice(idx + 1, 0, copy);
        return next;
      });
      setActiveLayerId(copy.id);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [layers]
  );

  const toggleVisible = useCallback((id: string) => {
    setLayers((c) =>
      c.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reorderLayer = useCallback((from: number, to: number) => {
    if (from === to) return;
    setLayers((c) => {
      const next = [...c];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLayerOpacity = useCallback((id: string, o: number) => {
    setLayers((c) => c.map((l) => (l.id === id ? { ...l, opacity: o } : l)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLayerBlend = useCallback((id: string, m: BlendMode) => {
    setLayers((c) => c.map((l) => (l.id === id ? { ...l, blendMode: m } : l)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stamps an external image (from /api/student-assets shared scope, or a
  // seeded design asset) onto a fresh layer. Scaled to fit the canvas
  // while preserving aspect ratio - user can resize with new layer tools
  // in a future iteration.
  const insertAsset = useCallback(
    async (asset: InsertableAsset) => {
      if (layers.length >= MAX_LAYERS) {
        return; // silent - panel already shows the cap
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("image_load_failed"));
          img.src = asset.fileUrl;
        });
      } catch {
        return;
      }
      const name = asset.title ? `에셋 - ${asset.title}` : "에셋";
      const layer = createLayer({ name, size: canvasSize });
      const ctx = layer.canvas.getContext("2d");
      if (!ctx) return;
      const scale = Math.min(
        canvasSize.w / img.width,
        canvasSize.h / img.height,
        1
      );
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const dx = (canvasSize.w - drawW) / 2;
      const dy = (canvasSize.h - drawH) / 2;
      ctx.drawImage(img, dx, dy, drawW, drawH);
      setLayers((c) => [...c, layer]);
      setActiveLayerId(layer.id);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [canvasSize, layers.length]
  );

  return {
    addLayer,
    deleteLayer,
    duplicateAt,
    toggleVisible,
    reorderLayer,
    setLayerOpacity,
    setLayerBlend,
    insertAsset,
  };
}
