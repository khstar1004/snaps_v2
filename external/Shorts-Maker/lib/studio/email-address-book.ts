import { getAppCacheEntry, setAppCacheEntry } from "@/lib/supabase/app-cache";
import { hasSupabaseServiceConfig } from "@/lib/supabase/server";
import {
  STUDIO_EMAIL_ADDRESS_BOOK_LIMIT,
  isValidStudioEmailAddress,
  normalizeStudioEmailAddress,
  resolveStudioEmailLabel,
  type StudioEmailAddressBookEntry,
} from "@/lib/studio/email-address-book-shared";

const STUDIO_EMAIL_ADDRESS_BOOK_SCOPE = "studio_email_address_book";
const STUDIO_EMAIL_ADDRESS_BOOK_KEY = "default";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sortStudioEmailAddressBook(entries: StudioEmailAddressBookEntry[]): StudioEmailAddressBookEntry[] {
  return [...entries].sort((left, right) => {
    if (left.updatedAtMs !== right.updatedAtMs) return right.updatedAtMs - left.updatedAtMs;
    if (left.createdAtMs !== right.createdAtMs) return right.createdAtMs - left.createdAtMs;
    return left.email.localeCompare(right.email);
  });
}

function normalizeStudioEmailAddressBookEntry(value: unknown): StudioEmailAddressBookEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const email = normalizeStudioEmailAddress(asString(row.email));
  if (!isValidStudioEmailAddress(email)) return null;
  const createdAtMs = asNumber(row.createdAtMs ?? row.createdAt, Date.now());
  const updatedAtMs = asNumber(row.updatedAtMs ?? row.updatedAt ?? createdAtMs, createdAtMs);
  return {
    email,
    label: resolveStudioEmailLabel(email, asString(row.label)),
    createdAtMs,
    updatedAtMs,
  };
}

async function writeStudioEmailAddressBook(userId: string, entries: StudioEmailAddressBookEntry[]): Promise<StudioEmailAddressBookEntry[]> {
  const next = sortStudioEmailAddressBook(entries).slice(0, STUDIO_EMAIL_ADDRESS_BOOK_LIMIT);
  if (!hasSupabaseServiceConfig()) {
    return next;
  }
  await setAppCacheEntry({
    scope: STUDIO_EMAIL_ADDRESS_BOOK_SCOPE,
    userScope: userId,
    key: STUDIO_EMAIL_ADDRESS_BOOK_KEY,
    value: next,
  });
  return next;
}

export function isStudioEmailAddressBookEnabled(): boolean {
  return hasSupabaseServiceConfig();
}

export async function listStudioEmailAddressBook(userId: string): Promise<StudioEmailAddressBookEntry[]> {
  if (!hasSupabaseServiceConfig()) {
    return [];
  }
  const entry = await getAppCacheEntry(STUDIO_EMAIL_ADDRESS_BOOK_SCOPE, userId, STUDIO_EMAIL_ADDRESS_BOOK_KEY);
  const rawItems = Array.isArray(entry?.valueJson) ? entry?.valueJson : [];
  return sortStudioEmailAddressBook(
    rawItems
      .map((item) => normalizeStudioEmailAddressBookEntry(item))
      .filter((item): item is StudioEmailAddressBookEntry => Boolean(item))
      .slice(0, STUDIO_EMAIL_ADDRESS_BOOK_LIMIT)
  );
}

export async function upsertStudioEmailAddressBookEntries(
  userId: string,
  entries: Array<{ email: string; label?: string }>
): Promise<StudioEmailAddressBookEntry[]> {
  const current = await listStudioEmailAddressBook(userId);
  const nextMap = new Map(current.map((item) => [item.email, item] as const));
  const now = Date.now();

  for (const item of entries) {
    const email = normalizeStudioEmailAddress(item.email);
    if (!isValidStudioEmailAddress(email)) {
      throw new Error(`유효하지 않은 메일 주소입니다: ${item.email}`);
    }
    const existing = nextMap.get(email);
    nextMap.set(email, {
      email,
      label: resolveStudioEmailLabel(email, item.label || existing?.label),
      createdAtMs: existing?.createdAtMs || now,
      updatedAtMs: now,
    });
  }

  return writeStudioEmailAddressBook(userId, Array.from(nextMap.values()));
}
