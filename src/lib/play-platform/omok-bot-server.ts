import "server-only";

import { db } from "@/lib/db";
import type { PlayActor } from "./actor";
import {
  PLAY_COMMAND_SCHEMA_VERSION,
  isOmokSnapshot,
  isPlayCommandResponse,
  type OmokSlot,
  type OmokSnapshot,
  type PlayCommandResponse,
} from "./contracts";
import { chooseOmokBotMove, OMOK_BOT_ACTOR_SUBJECT } from "./omok-bot";
import { playEngineFetch } from "./server-client";

export class OmokBotTurnError extends Error {
  constructor(message = "omok_bot_turn_failed") {
    super(message);
    this.name = "OmokBotTurnError";
  }
}

const botActor: PlayActor = {
  subject: OMOK_BOT_ACTOR_SUBJECT,
  role: "participant",
  userId: null,
  studentId: null,
};

function parseSlot(value: string | null | undefined): OmokSlot | null {
  if (value === "first" || value === "second") return value;
  return null;
}

function isBotTurn(snapshot: OmokSnapshot, botSlot: OmokSlot): boolean {
  return (
    snapshot.roomStatus === "active" &&
    snapshot.game.status.status === "playing" &&
    snapshot.game.nextTurn === botSlot
  );
}

function projectForHuman(
  response: PlayCommandResponse,
  snapshot: OmokSnapshot,
): PlayCommandResponse {
  return {
    requestId: response.requestId,
    previousVersion: response.previousVersion,
    version: snapshot.version,
    snapshot: {
      ...snapshot,
      viewer: response.snapshot.viewer,
    },
  };
}

/**
 * If this session contains the server-owned Omok bot and the committed human
 * move handed the turn to it, submit one normal participant command through
 * the Rust engine. The engine remains authoritative for legality/versioning.
 */
export async function advanceOmokBotTurn(
  sessionId: string,
  humanResponse: PlayCommandResponse,
): Promise<PlayCommandResponse> {
  const participant = await db.playParticipant.findFirst({
    where: { sessionId, actorSubject: OMOK_BOT_ACTOR_SUBJECT },
    select: { slot: true },
  });
  const botSlot = parseSlot(participant?.slot);
  if (!botSlot || !isBotTurn(humanResponse.snapshot, botSlot)) return humanResponse;

  let current = humanResponse.snapshot;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!isBotTurn(current, botSlot)) return projectForHuman(humanResponse, current);
    const move = chooseOmokBotMove(current.game.board, botSlot);
    if (!move) return projectForHuman(humanResponse, current);

    const requestId = `omok-bot-${sessionId}-${current.version}`;
    const response = await playEngineFetch(
      `/v1/sessions/${encodeURIComponent(sessionId)}/commands`,
      {
        actor: botActor,
        method: "POST",
        body: {
          requestId,
          expectedVersion: current.version,
          commandSchemaVersion: PLAY_COMMAND_SCHEMA_VERSION,
          command: { type: "place_stone", position: move },
        },
      },
    );
    const body = (await response.json().catch(() => null)) as unknown;
    if (response.ok && isPlayCommandResponse(body)) {
      return projectForHuman(humanResponse, body.snapshot);
    }

    if (
      response.status === 409 &&
      body &&
      typeof body === "object" &&
      isOmokSnapshot((body as { snapshot?: unknown }).snapshot)
    ) {
      current = (body as { snapshot: OmokSnapshot }).snapshot;
      continue;
    }

    throw new OmokBotTurnError(`omok_bot_engine_${response.status}`);
  }

  if (!isBotTurn(current, botSlot)) return projectForHuman(humanResponse, current);
  throw new OmokBotTurnError("omok_bot_version_conflict");
}
