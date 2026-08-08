"use client";

import type { PublicSupabaseClient } from "./client";

type RealtimeChannel = ReturnType<PublicSupabaseClient["channel"]>;

export type PublicBroadcastMessage<T = unknown> = {
  event: string;
  payload?: T;
  [key: string]: unknown;
};

type BroadcastListener = {
  events: Set<string>;
  onMessage: (message: PublicBroadcastMessage) => void;
  onStatus?: (status: string) => void;
};

type ChannelEntry = {
  channelName: string;
  listeners: Set<BroadcastListener>;
  client: PublicSupabaseClient | null;
  channel: RealtimeChannel | null;
  status: string | null;
  started: boolean;
  disposed: boolean;
};

type SubscribeOptions<T = unknown> = {
  channelName: string;
  events: readonly string[];
  onMessage: (message: PublicBroadcastMessage<T>) => void;
  onStatus?: (status: string) => void;
};

const channels = new Map<string, ChannelEntry>();
let sharedClientPromise: Promise<PublicSupabaseClient> | null = null;

async function getSharedClient(): Promise<PublicSupabaseClient> {
  if (!sharedClientPromise) {
    sharedClientPromise = import("./client")
      .then(({ createPublicSupabaseClient }) => createPublicSupabaseClient())
      .catch((error) => {
        sharedClientPromise = null;
        throw error;
      });
  }
  return sharedClientPromise;
}

function notifyStatus(entry: ChannelEntry, status: string): void {
  entry.status = status;
  for (const listener of entry.listeners) {
    try {
      listener.onStatus?.(status);
    } catch {
      // Consumer status handlers must not break other subscribers.
    }
  }
}

function dispatch(entry: ChannelEntry, message: unknown): void {
  if (!message || typeof message !== "object") return;
  const event = (message as { event?: unknown }).event;
  if (typeof event !== "string" || !event) return;

  for (const listener of entry.listeners) {
    if (!listener.events.has("*") && !listener.events.has(event)) continue;
    try {
      listener.onMessage(message as PublicBroadcastMessage);
    } catch {
      // One component must not block delivery to the rest of the board.
    }
  }
}

async function removeEntry(entry: ChannelEntry): Promise<void> {
  if (entry.disposed) return;
  entry.disposed = true;
  if (channels.get(entry.channelName) === entry) {
    channels.delete(entry.channelName);
  }

  const client = entry.client;
  const channel = entry.channel;
  entry.client = null;
  entry.channel = null;
  if (!client || !channel) return;
  try {
    await client.removeChannel(channel);
  } catch {
    // Realtime cleanup is best effort.
  }
}

async function startEntry(entry: ChannelEntry): Promise<void> {
  if (entry.started || entry.disposed) return;
  entry.started = true;

  try {
    const client = await getSharedClient();
    if (entry.disposed || channels.get(entry.channelName) !== entry) return;

    const channel = client
      .channel(entry.channelName)
      .on("broadcast", { event: "*" }, (message) => dispatch(entry, message));
    entry.client = client;
    entry.channel = channel;
    channel.subscribe((status: string) => {
      if (entry.disposed || channels.get(entry.channelName) !== entry) return;
      notifyStatus(entry, status);
    });
  } catch {
    if (!entry.disposed && channels.get(entry.channelName) === entry) {
      notifyStatus(entry, "CHANNEL_ERROR");
    }
  }
}

/**
 * Shares one public Supabase client and one Broadcast channel per topic.
 * Multiple board features can listen independently without opening duplicate
 * WebSockets or removing a channel still owned by another feature.
 */
export function subscribePublicBroadcast<T = unknown>(
  options: SubscribeOptions<T>,
): () => void {
  const channelName = options.channelName.trim();
  const events = new Set(options.events.map((event) => event.trim()).filter(Boolean));
  if (!channelName || events.size === 0) return () => undefined;

  let entry = channels.get(channelName);
  if (!entry) {
    entry = {
      channelName,
      listeners: new Set(),
      client: null,
      channel: null,
      status: null,
      started: false,
      disposed: false,
    };
    channels.set(channelName, entry);
  }

  const listener: BroadcastListener = {
    events,
    onMessage: options.onMessage as (message: PublicBroadcastMessage) => void,
    onStatus: options.onStatus,
  };
  entry.listeners.add(listener);
  if (entry.status) {
    try {
      listener.onStatus?.(entry.status);
    } catch {
      // Match normal status fan-out behavior.
    }
  }
  void startEntry(entry);

  let unsubscribed = false;
  return () => {
    if (unsubscribed) return;
    unsubscribed = true;
    entry!.listeners.delete(listener);
    if (entry!.listeners.size === 0) void removeEntry(entry!);
  };
}

export async function clearPublicBroadcastRegistryForTests(): Promise<void> {
  const entries = Array.from(channels.values());
  channels.clear();
  await Promise.all(entries.map((entry) => removeEntry(entry)));
  sharedClientPromise = null;
}
