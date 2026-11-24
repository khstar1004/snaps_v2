import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import {
  isStudioEmailAddressBookEnabled,
  listStudioEmailAddressBook,
  upsertStudioEmailAddressBookEntries,
} from "@/lib/studio/email-address-book";
import { STUDIO_EMAIL_QUICK_RECIPIENTS } from "@/lib/studio/email-address-book-shared";

export const runtime = "nodejs";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asEntryList(value: unknown): Array<{ email: string; label?: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): { email: string; label?: string } | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const email = asString(row.email);
      if (!email) return null;
      return {
        email,
        label: asString(row.label) || undefined,
      };
    })
    .filter((item): item is { email: string; label?: string } => Boolean(item));
}

function toAddressBookResponse(items: Awaited<ReturnType<typeof listStudioEmailAddressBook>>) {
  return NextResponse.json({
    ok: true,
    enabled: isStudioEmailAddressBookEnabled(),
    items,
    quickRecipients: STUDIO_EMAIL_QUICK_RECIPIENTS,
  });
}

export async function GET(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  try {
    const items = await listStudioEmailAddressBook(user.id);
    return toAddressBookResponse(items);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toApiErrorResponse(message, {
      status: 500,
      errorCode: "STUDIO_EMAIL_ADDRESS_BOOK_FETCH_FAILED",
      retryable: true,
    });
  }
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const entries = asEntryList(body.entries);
    if (entries.length === 0) {
      return toApiErrorResponse("저장할 메일 주소가 없습니다.", {
        status: 400,
        errorCode: "STUDIO_EMAIL_ADDRESS_BOOK_INVALID_INPUT",
        retryable: false,
      });
    }
    const items = await upsertStudioEmailAddressBookEntries(user.id, entries);
    return toAddressBookResponse(items);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toApiErrorResponse(message, {
      status: 400,
      errorCode: "STUDIO_EMAIL_ADDRESS_BOOK_SAVE_FAILED",
      retryable: false,
    });
  }
}
