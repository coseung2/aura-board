"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import type { CardData } from "../DraggableCard";
import type { StreamActivityTemplate } from "@/lib/stream-activity-templates";

type Props = {
  template: StreamActivityTemplate;
  sectionId: string;
  cards: CardData[];
  canEdit: boolean;
};

type MapPlace = {
  id: string;
  title: string;
  note: string | null;
  address: string | null;
  lat: number;
  lng: number;
  color: string | null;
  order: number;
};

type MapRoute = {
  id: string;
  orderedPlaceIds: unknown;
  travelMode: string;
  lineColor: string | null;
} | null;

export function StreamActivityTemplatePanel({
  template,
  sectionId,
  cards,
  canEdit,
}: Props) {
  if (template === "window_opening") return <WindowOpeningPanel cards={cards} />;
  if (template === "word_cloud") return <WordCloudPanel cards={cards} />;
  if (template === "timeline") return <TimelinePanel cards={cards} />;
  return <MapActivityPanel sectionId={sectionId} canEdit={canEdit} />;
}

const WINDOW_OPENING_CELLS = [
  "내 생각",
  "친구 생각",
  "질문",
  "근거",
  "모둠 합의",
  "새 관점",
  "해결책",
  "정리",
  "추가 의견",
] as const;

function WindowOpeningPanel({ cards }: { cards: CardData[] }) {
  const groupedCards = useMemo(() => groupWindowOpeningCards(cards), [cards]);

  return (
    <div className="stream-activity-panel stream-window-panel">
      <div className="stream-window-board">
        {WINDOW_OPENING_CELLS.map((label) => {
          const cellCards = groupedCards[label] ?? [];
          return (
            <div
              key={label}
              className={label === "모둠 합의" ? "stream-window-center" : undefined}
            >
              <span className="stream-window-cell-label">{label}</span>
              <div className="stream-window-note-stack">
                {cellCards.map((card) => (
                  <article key={card.id} className="stream-window-note">
                    {card.title && <strong>{card.title}</strong>}
                    <p>{card.content}</p>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WordCloudPanel({ cards }: { cards: CardData[] }) {
  const words = useMemo(() => buildWordCloud(cards), [cards]);
  return (
    <div className="stream-activity-panel stream-word-panel">
      {words.length === 0 ? (
        <p className="stream-activity-muted">게시글 없음</p>
      ) : (
        <div className="stream-word-cloud" aria-label="워드클라우드">
          {words.map((word) => (
            <span
              key={word.text}
              style={{ fontSize: `${14 + word.weight * 4}px` }}
              title={`${word.count}회`}
            >
              {word.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelinePanel({ cards }: { cards: CardData[] }) {
  const items = useMemo(() => buildTimeline(cards), [cards]);
  return (
    <div className="stream-activity-panel stream-timeline-panel">
      {items.length === 0 ? (
        <p className="stream-activity-muted">게시글 없음</p>
      ) : (
        <ol className="stream-timeline-list">
          {items.map((item) => (
            <li key={`${item.card.id}:${item.dateText}`}>
              <time>{item.dateText}</time>
              <span>{item.card.title || item.card.content.slice(0, 48)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function MapActivityPanel({ sectionId, canEdit }: { sectionId: string; canEdit: boolean }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, MapLibreMarker>>(new Map());
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [route, setRoute] = useState<MapRoute>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const placesRef = useRef<MapPlace[]>([]);
  const busyRef = useRef(false);

  const selected = places.find((place) => place.id === selectedId) ?? null;
  const routeIds = useMemo(() => normalizeRouteIds(route, places), [route, places]);
  const routePlaces = routeIds
    .map((id) => places.find((place) => place.id === id))
    .filter((place): place is MapPlace => Boolean(place));

  useEffect(() => {
    placesRef.current = places;
  }, [places]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`/api/sections/${sectionId}/map`, { cache: "no-store" });
        if (!res.ok) throw new Error("map_load_failed");
        const data = (await res.json()) as { places: MapPlace[]; route: MapRoute };
        if (!alive) return;
        setPlaces(data.places);
        setRoute(data.route);
      } catch {
        if (alive) setError("지도 데이터를 불러오지 못했어요.");
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [sectionId]);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    let disposed = false;
    async function initMap() {
      const maplibregl = (await import("maplibre-gl")).default;
      if (disposed || !mapEl.current) return;
      const tileUrl =
        process.env.NEXT_PUBLIC_MAP_TILE_URL ||
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
      const attribution =
        process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
      const map = new maplibregl.Map({
        container: mapEl.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: [tileUrl],
              tileSize: 256,
              attribution,
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        center: [126.978, 37.5665],
        zoom: 11,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.on("click", (event) => {
        if (!canEdit) return;
        void createPlace(event.lngLat.lat, event.lngLat.lng);
      });
      mapRef.current = map;
    }
    initMap();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, sectionId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    void syncMarkers(map);
    syncRouteLine(map, routePlaces, route?.lineColor ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, routeIds.join("|")]);

  async function createPlace(lat: number, lng: number) {
    if (busyRef.current) return;
    const currentPlaces = placesRef.current;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sections/${sectionId}/map/places`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat, lng, title: `장소 ${currentPlaces.length + 1}` }),
      });
      if (!res.ok) throw new Error("place_create_failed");
      const { place } = (await res.json()) as { place: MapPlace };
      const nextPlaces = [...currentPlaces, place];
      setPlaces(nextPlaces);
      setSelectedId(place.id);
      await saveRoute(nextPlaces.map((item) => item.id), true);
    } catch {
      setError("핀을 추가하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePlace(placeId: string, data: Partial<MapPlace>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sections/${sectionId}/map/places/${placeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("place_update_failed");
      const { place } = (await res.json()) as { place: MapPlace };
      setPlaces((list) => list.map((item) => (item.id === place.id ? place : item)));
    } catch {
      setError("장소를 저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function deletePlace(placeId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sections/${sectionId}/map/places/${placeId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("place_delete_failed");
      setPlaces((list) => list.filter((item) => item.id !== placeId));
      setSelectedId((current) => (current === placeId ? null : current));
      setRoute((current) =>
        current
          ? {
              ...current,
              orderedPlaceIds: normalizeRouteIds(current, places).filter((id) => id !== placeId),
            }
          : current,
      );
    } catch {
      setError("장소를 삭제하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function moveRoutePlace(placeId: string, direction: -1 | 1) {
    const ids = normalizeRouteIds(route, places);
    const index = ids.indexOf(placeId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];
    await saveRoute(next, true);
  }

  async function saveRoute(orderedPlaceIds: string[], updateState: boolean) {
    const res = await fetch(`/api/sections/${sectionId}/map`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderedPlaceIds, travelMode: "walking" }),
    });
    if (!res.ok) throw new Error("route_update_failed");
    const { route: nextRoute } = (await res.json()) as { route: MapRoute };
    if (updateState) setRoute(nextRoute);
  }

  async function syncMarkers(map: MapLibreMap) {
    const maplibregl = (await import("maplibre-gl")).default;
    const activeIds = new Set(places.map((place) => place.id));
    for (const [id, marker] of markersRef.current) {
      if (!activeIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
    for (const place of places) {
      const existing = markersRef.current.get(place.id);
      if (existing) {
        existing.setLngLat([place.lng, place.lat]);
        continue;
      }
      const marker = new maplibregl.Marker({
        color: place.color || "#1f8a70",
        draggable: canEdit,
      })
        .setLngLat([place.lng, place.lat])
        .addTo(map);
      marker.getElement().addEventListener("click", (event) => {
        event.stopPropagation();
        setSelectedId(place.id);
      });
      marker.on("dragend", () => {
        const lngLat = marker.getLngLat();
        void updatePlace(place.id, { lat: lngLat.lat, lng: lngLat.lng });
      });
      markersRef.current.set(place.id, marker);
    }
    if (places.length > 0 && !selectedId) {
      const bounds = new maplibregl.LngLatBounds();
      places.forEach((place) => bounds.extend([place.lng, place.lat]));
      map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 400 });
    }
  }

  return (
    <div className="stream-activity-panel stream-map-panel">
      <div className="stream-map-canvas" ref={mapEl} />
      <div className="stream-map-sidebar">
        <div className="stream-map-toolbar">
          <strong>여행 지도</strong>
          <span>{canEdit ? "지도를 눌러 핀 추가" : "핀과 경로 보기"}</span>
        </div>
        {error && <div className="stream-map-error">{error}</div>}
        <ol className="stream-map-place-list">
          {routePlaces.map((place, index) => (
            <li key={place.id} className={place.id === selectedId ? "is-selected" : ""}>
              <button type="button" onClick={() => setSelectedId(place.id)}>
                <span>{index + 1}</span>
                {place.title}
              </button>
              {canEdit && (
                <div>
                  <button
                    type="button"
                    onClick={() => moveRoutePlace(place.id, -1)}
                    disabled={busy || index === 0}
                    aria-label="앞으로 이동"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveRoutePlace(place.id, 1)}
                    disabled={busy || index === routePlaces.length - 1}
                    aria-label="뒤로 이동"
                  >
                    ↓
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
        {selected && (
          <MapPlaceEditor
            place={selected}
            canEdit={canEdit}
            busy={busy}
            onSave={(data) => updatePlace(selected.id, data)}
            onDelete={() => deletePlace(selected.id)}
          />
        )}
        {places.length === 0 && (
          <p className="stream-activity-muted">핀 없음</p>
        )}
      </div>
    </div>
  );
}

function groupWindowOpeningCards(cards: CardData[]) {
  const groups: Partial<Record<(typeof WINDOW_OPENING_CELLS)[number], CardData[]>> = {};
  const outerCells = WINDOW_OPENING_CELLS.filter((label) => label !== "모둠 합의");
  let outerIndex = 0;

  for (const card of cards) {
    const text = `${card.title} ${card.content}`;
    const label = WINDOW_OPENING_CELLS.find((cell) => text.includes(cell));
    const target =
      label ??
      (/(합의|결론|공통|모둠)/.test(text)
        ? "모둠 합의"
        : outerCells[outerIndex++ % outerCells.length]);
    groups[target] = [...(groups[target] ?? []), card];
  }

  return groups;
}

function MapPlaceEditor({
  place,
  canEdit,
  busy,
  onSave,
  onDelete,
}: {
  place: MapPlace;
  canEdit: boolean;
  busy: boolean;
  onSave: (data: Partial<MapPlace>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(place.title);
  const [note, setNote] = useState(place.note ?? "");

  useEffect(() => {
    setTitle(place.title);
    setNote(place.note ?? "");
  }, [place.id, place.title, place.note]);

  return (
    <form
      className="stream-map-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ title, note });
      }}
    >
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        disabled={!canEdit || busy}
        aria-label="장소 이름"
      />
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        disabled={!canEdit || busy}
        placeholder="방문 이유, 할 일, 준비물"
      />
      <div>
        <button type="submit" disabled={!canEdit || busy || !title.trim()}>
          저장
        </button>
        <button type="button" onClick={onDelete} disabled={!canEdit || busy}>
          삭제
        </button>
      </div>
    </form>
  );
}

function syncRouteLine(
  map: MapLibreMap,
  routePlaces: MapPlace[],
  lineColor: string | null,
) {
  const sourceId = "stream-trip-route";
  const layerId = "stream-trip-route-line";
  const data = {
    type: "FeatureCollection" as const,
    features:
      routePlaces.length >= 2
        ? [
            {
              type: "Feature" as const,
              properties: {},
              geometry: {
                type: "LineString" as const,
                coordinates: routePlaces.map((place) => [place.lng, place.lat]),
              },
            },
          ]
        : [],
  };
  const source = map.getSource(sourceId) as
    | { setData: (next: typeof data) => void }
    | undefined;
  if (source) {
    source.setData(data);
    return;
  }
  if (!map.isStyleLoaded()) {
    map.once("load", () => syncRouteLine(map, routePlaces, lineColor));
    return;
  }
  map.addSource(sourceId, { type: "geojson", data });
  map.addLayer({
    id: layerId,
    type: "line",
    source: sourceId,
    paint: {
      "line-color": lineColor || "#1f8a70",
      "line-width": 4,
      "line-opacity": 0.8,
    },
  });
}

function normalizeRouteIds(route: MapRoute, places: MapPlace[]): string[] {
  if (route && Array.isArray(route.orderedPlaceIds)) {
    const validIds = new Set(places.map((place) => place.id));
    const routeIds = route.orderedPlaceIds.filter(
      (id): id is string => typeof id === "string" && validIds.has(id),
    );
    const missing = places
      .filter((place) => !routeIds.includes(place.id))
      .sort((a, b) => a.order - b.order)
      .map((place) => place.id);
    return [...routeIds, ...missing];
  }
  return [...places].sort((a, b) => a.order - b.order).map((place) => place.id);
}

function buildWordCloud(cards: CardData[]) {
  const stop = new Set([
    "그리고",
    "하지만",
    "그래서",
    "나는",
    "우리",
    "있는",
    "없는",
    "것은",
    "것이",
    "the",
    "and",
    "for",
    "with",
  ]);
  const counts = new Map<string, number>();
  for (const card of cards) {
    const text = `${card.title} ${card.content}`.toLowerCase();
    for (const raw of text.match(/[가-힣a-zA-Z0-9]{2,}/g) ?? []) {
      if (stop.has(raw)) continue;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
  }
  const max = Math.max(1, ...counts.values());
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 32)
    .map(([text, count]) => ({
      text,
      count,
      weight: Math.max(1, Math.round((count / max) * 5)),
    }));
}

function buildTimeline(cards: CardData[]) {
  return cards
    .map((card) => {
      const text = `${card.title} ${card.content}`;
      const dateText =
        text.match(/\b\d{4}[-.\/]\d{1,2}[-.\/]\d{1,2}\b/)?.[0] ??
        text.match(/\b\d{4}년\s*\d{1,2}월\s*\d{0,2}일?\b/)?.[0] ??
        text.match(/\b\d{1,2}월\s*\d{1,2}일\b/)?.[0] ??
        null;
      return dateText ? { card, dateText, time: timelineSortValue(dateText) } : null;
    })
    .filter((item): item is { card: CardData; dateText: string; time: number } =>
      Boolean(item),
    )
    .sort((a, b) => a.time - b.time);
}

function timelineSortValue(dateText: string): number {
  const normalized = dateText
    .replace(/년|월/g, "-")
    .replace(/일/g, "")
    .replace(/\./g, "-")
    .replace(/\//g, "-")
    .replace(/\s+/g, "");
  const parts = normalized.split("-").filter(Boolean).map(Number);
  const year = parts.length === 2 ? new Date().getFullYear() : parts[0];
  const month = parts.length === 2 ? parts[0] : parts[1] ?? 1;
  const day = parts.length === 2 ? parts[1] : parts[2] ?? 1;
  return new Date(year, month - 1, day).getTime();
}
