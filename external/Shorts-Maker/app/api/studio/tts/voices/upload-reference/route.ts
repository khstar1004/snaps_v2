import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { getSharedStudioLibraryScope } from "@/lib/studio/library-scope";
import { buildStudioMediaStorageObjectKey } from "@/lib/storage/object-key";
import { uploadSupabaseStorageFile } from "@/lib/supabase/storage";

export const runtime = "nodejs";

const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/webm",
]);

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveAudioExtension(file: File): string {
  const type = (file.type || "").toLowerCase();
  if (type === "audio/wav" || type === "audio/x-wav" || type === "audio/wave") return "wav";
  if (type === "audio/ogg") return "ogg";
  if (type === "audio/webm") return "webm";
  if (type === "audio/mpeg" || type === "audio/mp3") return "mp3";
  return file.name.split(".").pop()?.trim().toLowerCase() || "wav";
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
    }
    if (!SUPPORTED_AUDIO_TYPES.has((file.type || "").toLowerCase())) {
      return NextResponse.json({ ok: false, error: "wav/mp3/ogg/webm only" }, { status: 400 });
    }
    const title = asString(formData.get("title")) || file.name || "voice-reference";
    const assetId = randomUUID();
    const stored = await uploadSupabaseStorageFile({
      path: buildStudioMediaStorageObjectKey({
        scope: getSharedStudioLibraryScope(),
        folderPath: "voice-assets/reference-audio",
        title,
        id: assetId,
        ext: resolveAudioExtension(file),
      }),
      file,
      contentType: file.type || "application/octet-stream",
    });
    return NextResponse.json({
      ok: true,
      url: stored.publicUrl,
      contentType: file.type || "application/octet-stream",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
