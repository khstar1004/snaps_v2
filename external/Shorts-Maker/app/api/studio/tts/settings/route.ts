import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { fetchStudioTtsRuntimeSnapshot, getStudioTtsSettings, listStudioVoiceAssets, listStudioVoiceOptions, saveStudioTtsSettings } from "@/lib/studio/tts-config";

export const runtime = "nodejs";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  try {
    const settings = await getStudioTtsSettings();
    const runtimeSnapshot = await fetchStudioTtsRuntimeSnapshot(settings);
    const [voiceAssets, voiceOptions] = await Promise.all([
      listStudioVoiceAssets(),
      listStudioVoiceOptions(settings, runtimeSnapshot),
    ]);
    return NextResponse.json({
      ok: true,
      settings,
      runtime: runtimeSnapshot,
      voiceAssets,
      voiceOptions,
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
    const typecastBody =
      body.typecast && typeof body.typecast === "object"
        ? (body.typecast as Record<string, unknown>)
        : {};
    const next = await saveStudioTtsSettings({
      defaultProvider: "typecast",
      defaultVoiceId: asString(body.defaultVoiceId),
      previewText: asString(body.previewText),
      typecast: {
        apiKey: asString(typecastBody.apiKey),
        defaultVoiceId: asString(typecastBody.defaultVoiceId),
        modelId: asString(typecastBody.modelId),
        defaultLanguage: asString(typecastBody.defaultLanguage),
        defaultEmotionType: asString(typecastBody.defaultEmotionType),
        speed: asNumber(typecastBody.speed) ?? 1,
      },
    });
    const runtimeSnapshot = await fetchStudioTtsRuntimeSnapshot(next);
    return NextResponse.json({
      ok: true,
      settings: next,
      runtime: runtimeSnapshot,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
