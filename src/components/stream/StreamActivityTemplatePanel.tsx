"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import type { CardData } from "../DraggableCard";
import {
  normalizeStreamActivityTemplateState,
  type StreamActivityTemplate,
  type StreamActivityTemplateState,
} from "@/lib/stream-activity-templates";

type Props = {
  template: StreamActivityTemplate;
  sectionId: string;
  cards: CardData[];
  canEdit: boolean;
  isTeacherView?: boolean;
  windowMemberCount?: number;
  state?: StreamActivityTemplateState | null;
  onStateChange?: (state: StreamActivityTemplateState | null) => Promise<boolean>;
  onCreateCard: (data: { title: string; content: string }) => Promise<void>;
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
  isTeacherView = false,
  windowMemberCount,
  state,
  onStateChange,
  onCreateCard,
}: Props) {
  if (template === "window_opening") {
    return (
      <WindowOpeningPanel
        cards={cards}
        canEdit={canEdit}
        memberCount={windowMemberCount}
        onCreateCard={onCreateCard}
      />
    );
  }
  if (template === "word_cloud") {
    return (
      <WordCloudPanel
        cards={cards}
        canEdit={canEdit}
        isTeacherView={isTeacherView}
        state={state}
        onStateChange={onStateChange}
        onCreateCard={onCreateCard}
      />
    );
  }
  if (template === "timeline") {
    return (
      <TimelinePanel
        cards={cards}
        canEdit={canEdit}
        onCreateCard={onCreateCard}
      />
    );
  }
  return <MapActivityPanel sectionId={sectionId} canEdit={canEdit} />;
}

const WINDOW_AGREEMENT_LABEL = "합의";
const DEFAULT_WINDOW_MEMBER_COUNT = 4;
const WINDOW_MEMBER_SLOTS = [
  { row: 1, column: 1 },
  { row: 1, column: 3 },
  { row: 3, column: 1 },
  { row: 3, column: 3 },
  { row: 1, column: 2 },
  { row: 2, column: 1 },
  { row: 2, column: 3 },
  { row: 3, column: 2 },
] as const;

type WindowOpeningCell = {
  id: string;
  label: string;
  kind: "member" | "agreement";
  row: number;
  column: number;
};

function WindowOpeningPanel({
  cards,
  canEdit,
  memberCount,
  onCreateCard,
}: {
  cards: CardData[];
  canEdit: boolean;
  memberCount?: number;
  onCreateCard: (data: { title: string; content: string }) => Promise<void>;
}) {
  const cells = useMemo(() => buildWindowOpeningCells(memberCount), [memberCount]);
  const groupedCards = useMemo(
    () => groupWindowOpeningCards(cards, cells),
    [cards, cells],
  );

  return (
    <div className="stream-activity-panel stream-window-panel">
      <div className="stream-window-board">
        {cells.map((cell) => {
          const cellCards = groupedCards[cell.id] ?? [];
          return (
            <div
              key={cell.id}
              className={cell.kind === "agreement" ? "stream-window-center" : undefined}
              style={{ gridColumn: cell.column, gridRow: cell.row }}
            >
              <span className="stream-window-cell-label">{cell.label}</span>
              <div className="stream-window-note-stack">
                {cellCards.map((card) => (
                  <article key={card.id} className="stream-window-note">
                    {card.title && card.title !== cell.label && <strong>{card.title}</strong>}
                    <p>{card.content}</p>
                  </article>
                ))}
              </div>
              {canEdit && (
                <WindowCellComposer
                  label={cell.label}
                  onCreateCard={onCreateCard}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WordCloudPanel({
  cards,
  canEdit,
  isTeacherView,
  state,
  onStateChange,
  onCreateCard,
}: {
  cards: CardData[];
  canEdit: boolean;
  isTeacherView: boolean;
  state?: StreamActivityTemplateState | null;
  onStateChange?: (state: StreamActivityTemplateState | null) => Promise<boolean>;
  onCreateCard: (data: { title: string; content: string }) => Promise<void>;
}) {
  const words = useMemo(() => buildWordCloud(cards), [cards]);
  const layout = useMemo(() => wordCloudLayout(words), [words]);
  const visibleWords = useMemo(
    () =>
      words
        .map((word, index) => ({ word, pos: layout[index] }))
        .filter(
          (item): item is { word: (typeof words)[number]; pos: { x: number; y: number } } =>
            item.pos != null,
        ),
    [layout, words],
  );
  const normalizedState = normalizeStreamActivityTemplateState(state);
  const published = normalizedState.wordCloudPublished === true;
  const canSeeCloud = published;
  const [publishing, setPublishing] = useState(false);

  async function publish() {
    if (!onStateChange || publishing) return;
    setPublishing(true);
    try {
      await onStateChange({ ...normalizedState, wordCloudPublished: true });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="stream-activity-panel stream-word-panel">
      {isTeacherView && (
        <div className="stream-word-toolbar">
          <span>
            {published
              ? "공개됨"
              : `비공개 수집 중 · ${cards.length}개 입력`}
          </span>
          <button
            type="button"
            onClick={publish}
            disabled={published || publishing || !onStateChange}
          >
            {published ? "공개됨" : "공개"}
          </button>
        </div>
      )}
      <div className="stream-word-stage">
        {!canSeeCloud ? (
          <p className="stream-activity-muted">
            교사가 공개하면 워드클라우드가 표시됩니다.
          </p>
        ) : words.length === 0 ? (
          <p className="stream-activity-muted">게시글 없음</p>
        ) : visibleWords.length === 0 ? (
          <p className="stream-activity-muted">표시할 공간이 부족해요.</p>
        ) : (
          <div className="stream-word-cloud" aria-label="워드클라우드">
            {visibleWords.map(({ word, pos }) => {
              return (
                <span
                  key={word.text}
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    color: word.color,
                    fontSize: `${14 + word.weight * 10}px`,
                  }}
                  title={`${word.count}회`}
                >
                  {word.text}
                </span>
              );
            })}
          </div>
        )}
      </div>
      {canEdit && (
        <QuickTextForm
          className="stream-word-input"
          placeholder="단어 또는 두 어절"
          submitLabel="추가"
          normalizeInput={limitWordCloudInput}
          successMessage="반영됐어요."
          errorMessage="반영에 실패했어요."
          onSubmit={(content) => onCreateCard({ title: "", content })}
        />
      )}
    </div>
  );
}

function TimelinePanel({
  cards,
  canEdit,
  onCreateCard,
}: {
  cards: CardData[];
  canEdit: boolean;
  onCreateCard: (data: { title: string; content: string }) => Promise<void>;
}) {
  const items = useMemo(() => buildTimeline(cards), [cards]);
  return (
    <div className="stream-activity-panel stream-timeline-panel">
      <div className="stream-timeline-stage">
        {items.length === 0 ? (
          <p className="stream-activity-muted">게시글 없음</p>
        ) : (
          <ol className="stream-timeline-list">
            {items.map((item, index) => {
              const eventText =
                item.card.title ||
                item.card.content.replace(item.dateText, "").trim() ||
                item.card.content.slice(0, 48);
              return (
                <li
                  key={`${item.card.id}:${item.dateText}`}
                  className={index % 2 === 0 ? "is-above" : "is-below"}
                >
                  <span className="stream-timeline-stem" aria-hidden="true" />
                  <span className="stream-timeline-node" aria-hidden="true" />
                  <article className="stream-timeline-event">
                    <time>{item.dateText}</time>
                    <span>{eventText}</span>
                  </article>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {canEdit && (
        <TimelineEntryForm onCreateCard={onCreateCard} />
      )}
    </div>
  );
}

function WindowCellComposer({
  label,
  onCreateCard,
}: {
  label: string;
  onCreateCard: (data: { title: string; content: string }) => Promise<void>;
}) {
  return (
    <QuickTextForm
      className="stream-window-cell-input"
      placeholder="입력"
      submitLabel="등록"
      onSubmit={(content) => onCreateCard({ title: label, content })}
    />
  );
}

function TimelineEntryForm({
  onCreateCard,
}: {
  onCreateCard: (data: { title: string; content: string }) => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const trimmed = content.trim();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!date || !trimmed || busy) return;
    setBusy(true);
    try {
      await onCreateCard({ title: trimmed, content: date });
      setContent("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stream-timeline-input" onSubmit={submit}>
      <input
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        disabled={busy}
        aria-label="날짜"
      />
      <input
        type="text"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="내용"
        disabled={busy}
        aria-label="연표 내용"
      />
      <button type="submit" disabled={!date || !trimmed || busy}>
        추가
      </button>
    </form>
  );
}

function QuickTextForm({
  className,
  placeholder,
  submitLabel,
  normalizeInput,
  successMessage,
  errorMessage,
  onSubmit,
}: {
  className: string;
  placeholder: string;
  submitLabel: string;
  normalizeInput?: (value: string) => string;
  successMessage?: string;
  errorMessage?: string;
  onSubmit: (content: string) => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const trimmed = content.trim();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed || busy) return;
    setBusy(true);
    setStatus("idle");
    try {
      await onSubmit(normalizeInput ? normalizeInput(trimmed).trim() : trimmed);
      setContent("");
      setStatus("success");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={className} onSubmit={submit}>
      <div className="quick-text-form-row">
        <input
          type="text"
          value={content}
          onChange={(event) => {
            setStatus("idle");
            setContent(normalizeInput ? normalizeInput(event.target.value) : event.target.value);
          }}
          placeholder={placeholder}
          disabled={busy}
        />
        <button type="submit" disabled={!trimmed || busy}>
          {submitLabel}
        </button>
      </div>
      {(successMessage || errorMessage) && (
        <p className={`quick-text-form-status is-${status}`} aria-live="polite">
          {status === "success"
            ? successMessage
            : status === "error"
              ? errorMessage
              : "\u00a0"}
        </p>
      )}
    </form>
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

function buildWindowOpeningCells(memberCount: number | undefined): WindowOpeningCell[] {
  const count =
    typeof memberCount === "number"
      ? Math.max(0, Math.min(WINDOW_MEMBER_SLOTS.length, Math.floor(memberCount)))
      : DEFAULT_WINDOW_MEMBER_COUNT;
  const memberCells = WINDOW_MEMBER_SLOTS.slice(0, count).map((slot, index) => ({
    id: `member-${index + 1}`,
    label: `모둠원 ${index + 1}`,
    kind: "member" as const,
    row: slot.row,
    column: slot.column,
  }));
  return [
    ...memberCells,
    {
      id: "agreement",
      label: WINDOW_AGREEMENT_LABEL,
      kind: "agreement" as const,
      row: 2,
      column: 2,
    },
  ];
}

function groupWindowOpeningCards(cards: CardData[], cells: WindowOpeningCell[]) {
  const groups: Record<string, CardData[]> = {};
  const memberCells = cells.filter((cell) => cell.kind === "member");
  let outerIndex = 0;

  for (const card of cards) {
    const text = `${card.title} ${card.content}`;
    const matchingCell = cells.find((cell) => text.includes(cell.label));
    const target =
      matchingCell?.id ??
      (/(합의|결론|공통|모둠 합의)/.test(text)
        ? "agreement"
        : memberCells.length > 0
          ? memberCells[outerIndex++ % memberCells.length]?.id ?? "agreement"
          : "agreement");
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
  const counts = new Map<string, { text: string; count: number }>();
  for (const card of cards) {
    const text = normalizeWordCloudEntry(card.content || card.title);
    if (!text) continue;
    const key = text.toLocaleLowerCase("ko-KR");
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { text, count: 1 });
  }
  const max = Math.max(1, ...[...counts.values()].map((item) => item.count));
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .slice(0, 32)
    .map((item) => ({
      text: item.text,
      color: wordCloudColor(item.text),
      count: item.count,
      weight: max === 1 ? 2 : 1 + Math.round(((item.count - 1) / (max - 1)) * 5),
    }));
}

function wordCloudLayout(
  words: Array<{ text: string; weight: number }>,
): Array<{ x: number; y: number } | null> {
  // Deterministic spiral placement with conservative collision checks. The
  // browser owns the exact glyph metrics, so we overestimate each label box to
  // keep large Korean words and short phrases from stacking on top of each other.
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
  const out: Array<{ x: number; y: number } | null> = [];

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const box = estimateWordBox(word.text, word.weight);
    let chosen: { x: number; y: number } | null = null;

    for (let step = 0; step < 260; step += 1) {
      const r = 2.7 * Math.sqrt(step + i * 10);
      const a = (step + i * 7) * goldenAngle;
      const x = Math.max(8 + box.w / 2, Math.min(92 - box.w / 2, 50 + r * Math.cos(a)));
      const y = Math.max(10 + box.h / 2, Math.min(90 - box.h / 2, 50 + r * Math.sin(a)));
      const candidate = { x, y, w: box.w, h: box.h };
      if (!placed.some((other) => boxesOverlap(candidate, other))) {
        chosen = { x, y };
        placed.push(candidate);
        break;
      }
    }
    out.push(chosen);
  }
  return out;
}

function estimateWordBox(text: string, weight: number): { w: number; h: number } {
  const fontSize = 14 + weight * 10;
  let units = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) units += 0.38;
    else if (/[\u0000-\u00ff]/.test(ch)) units += 0.58;
    else units += 1;
  }
  const widthPx = Math.max(fontSize * 1.6, fontSize * units * 1.08);
  return {
    w: Math.min(58, Math.max(8, (widthPx / 900) * 100 + 3)),
    h: Math.max(7, ((fontSize * 1.35) / 675) * 100 + 2),
  };
}

function boxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2
  );
}

function normalizeWordCloudEntry(value: string | null | undefined): string {
  return limitWordCloudInput(value ?? "").trim();
}

function limitWordCloudInput(value: string): string {
  const singleSpaced = value.replace(/\s+/g, " ");
  const hasTrailingSpace = /\s$/.test(singleSpaced);
  const words = singleSpaced.trim().split(" ").filter(Boolean);
  if (words.length <= 2) {
    return `${words.join(" ")}${
      hasTrailingSpace && words.length > 0 && words.length < 2 ? " " : ""
    }`;
  }
  return words.slice(0, 2).join(" ");
}

const WORD_CLOUD_COLORS = [
  "#0f82c9",
  "#d92d7b",
  "#2f9e44",
  "#8a5cf6",
  "#e67700",
  "#0ca678",
  "#c2255c",
  "#4263eb",
  "#5c940d",
  "#ae3ec9",
];

function wordCloudColor(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return WORD_CLOUD_COLORS[hash % WORD_CLOUD_COLORS.length] ?? WORD_CLOUD_COLORS[0];
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
