import "server-only";
import { randomBytes } from "crypto";
import {
  _resetParentSecurityStoreForTests,
  consumeBoundValue,
  readBoundValue,
  sensitiveKey,
  setExpiringValue,
} from "./parent-security-store";

const TTL_SECONDS = 5 * 60;
const KEY_PREFIX = "parent-security:match-ticket";

export type Ticket = {
  classroomId: string;
  classroomName: string;
  expiresAt: number;
};

function ticketKey(ticket: string): string {
  return sensitiveKey(KEY_PREFIX, ticket);
}

function sessionBinding(parentSessionId: string): string {
  return sensitiveKey("session", parentSessionId).slice("session:".length);
}

function parseTicket(value: string | null): Ticket | null {
  if (!value) return null;
  try {
    const ticket = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Ticket;
    if (
      typeof ticket.classroomId !== "string" ||
      typeof ticket.classroomName !== "string" ||
      typeof ticket.expiresAt !== "number" ||
      ticket.expiresAt <= Date.now()
    ) {
      return null;
    }
    return ticket;
  } catch {
    return null;
  }
}

export async function issueTicket(params: {
  parentSessionId: string;
  classroomId: string;
  classroomName: string;
}): Promise<string> {
  const expiresAt = Date.now() + TTL_SECONDS * 1000;
  const payload = Buffer.from(
    JSON.stringify({
      classroomId: params.classroomId,
      classroomName: params.classroomName,
      expiresAt,
    } satisfies Ticket),
    "utf8",
  ).toString("base64url");
  const binding = sessionBinding(params.parentSessionId);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ticket = randomBytes(32).toString("base64url");
    if (await setExpiringValue(ticketKey(ticket), `${binding}:${payload}`, TTL_SECONDS)) {
      return ticket;
    }
  }
  throw new Error("Unable to allocate a unique parent match ticket");
}

export async function readTicket(
  ticket: string,
  parentSessionId: string,
): Promise<Ticket | null> {
  return parseTicket(await readBoundValue(ticketKey(ticket), sessionBinding(parentSessionId)));
}

export async function consumeTicket(
  ticket: string,
  parentSessionId: string,
): Promise<Ticket | null> {
  return parseTicket(await consumeBoundValue(ticketKey(ticket), sessionBinding(parentSessionId)));
}

export function _resetTicketsForTests(): void {
  _resetParentSecurityStoreForTests();
}
