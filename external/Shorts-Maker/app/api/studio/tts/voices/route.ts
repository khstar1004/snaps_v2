import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { deleteStudioVoiceAsset, importTypecastVoiceCatalogAssets, listStudioVoiceAssets, saveStudioVoiceAsset } from "@/lib/studio/tts-config";

export const runtime = "nodejs";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  try {
    return NextResponse.json({
      ok: true,
      voiceAssets: await listStudioVoiceAssets(),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (asString(body.action) === "import_typecast_catalog") {
      const imported = await importTypecastVoiceCatalogAssets({
        limit: Number(body.limit),
      });
      return NextResponse.json({
        ok: true,
        importedCount: imported.length,
        voiceAssets: await listStudioVoiceAssets(),
      });
    }
    const typecastBody =
      body.typecast && typeof body.typecast === "object"
        ? (body.typecast as Record<string, unknown>)
        : {};
    const asset = await saveStudioVoiceAsset({
      id: asString(body.id) || undefined,
      provider: "typecast",
      name: asString(body.name),
      description: asString(body.description),
      previewText: asString(body.previewText),
      tags: asStringArray(body.tags),
      typecast:
        Object.keys(typecastBody).length > 0
          ? {
              voiceId: asString(typecastBody.voiceId),
              modelId: asString(typecastBody.modelId),
              language: asString(typecastBody.language),
              emotionType: asString(typecastBody.emotionType),
            }
          : undefined,
    });
    return NextResponse.json({
      ok: true,
      voiceAsset: asset,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  try {
    const { searchParams } = new URL(request.url);
    const id = asString(searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }
    await deleteStudioVoiceAsset(id);
    return NextResponse.json({ ok: true, deletedId: id });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
