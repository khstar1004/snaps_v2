import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDefaultTemplateBranding } from "@/lib/publish/template-branding";
import { renderVideoWithServerNative } from "@/lib/studio/render-native-server";
import type { StudioCaptionCue } from "@/types/studio-caption";
import type { SlideMediaKind } from "@/types/studio-json";
import type { StudioNativeRenderRequest } from "@/types/studio-renderer";

const projectRoot = resolve(dirnameFromUrl(import.meta.url), "..");
const publicDir = join(projectRoot, "public");
const tinyGifBuffer = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

type SmokeCase = {
  name: string;
  request: StudioNativeRenderRequest;
  expectedEffectiveSfxCues?: number;
};

function dirnameFromUrl(url: string): string {
  return resolve(fileURLToPath(new URL(".", url)));
}

function toDataSvgUrl(text: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#dbeafe"/><stop offset="100%" stop-color="#7dd3fc"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#bg)"/><circle cx="540" cy="620" r="220" fill="#0f172a" opacity="0.18"/><text x="540" y="940" text-anchor="middle" font-size="92" font-family="Arial" fill="#0f172a">${text}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function getTemplateLayout() {
  return {
    headerTitleSlot: { x: 0.09, y: 0.018, w: 0.42, h: 0.04 },
    headerAccentSlot: { x: 0.62, y: 0.018, w: 0.28, h: 0.04 },
    titleSlot: { x: 0.09, y: 0.1, w: 0.82, h: 0.07 },
    bodySlot: { x: 0.09, y: 0.25, w: 0.82, h: 0.18 },
    imageSlot: { x: 0.09, y: 0.47, w: 0.82, h: 0.38 },
    infoSlot: { x: 0.09, y: 0.175, w: 0.82, h: 0.035 },
    titleColor: "#ffffff",
    bodyColor: "#ffffff",
    infoColor: "rgba(255,255,255,0.92)",
    titleAlign: "center" as const,
    bodyAlign: "center" as const,
    headerSize: 17,
    titleSize: 46,
    bodySize: 26,
    infoSize: 15,
  };
}

function buildVisualSlide(input: {
  title: string;
  text: string;
  lines?: string[];
  imageUrl: string;
  mediaUrl?: string;
  mediaKind?: SlideMediaKind;
  captionCues?: StudioCaptionCue[];
}) {
  return {
    title: input.title,
    text: input.text,
    lines: input.lines || [input.text],
    layout: "photo+body" as const,
    imageUrl: input.imageUrl,
    mediaUrl: input.mediaUrl,
    mediaKind: input.mediaKind,
    captionCues: input.captionCues,
  };
}

function createSmokeRequest(params: {
  title: string;
  narrationAudioBase64: string;
  frameDurationsSec: number[];
  slides: Array<ReturnType<typeof buildVisualSlide>>;
  bgmEnabled: boolean;
  sfxEnabled: boolean;
  bgmPath?: string;
  sfxCues?: NonNullable<StudioNativeRenderRequest["audioOptions"]>["sfxCues"];
  sfxCatalog?: NonNullable<StudioNativeRenderRequest["audioOptions"]>["sfxCatalog"];
}): StudioNativeRenderRequest {
  const durationMs = Math.round(params.frameDurationsSec.reduce((acc, value) => acc + value, 0) * 1000);
  return {
    fullAudio: params.narrationAudioBase64,
    narration: {
      mode: "singleAudio",
      fullAudio: params.narrationAudioBase64,
    },
    durationMs,
    frameDurationsSec: params.frameDurationsSec,
    audioOptions: {
      playbackRate: 1.5,
      bgmEnabled: params.bgmEnabled,
      bgmPath: params.bgmPath,
      sfxEnabled: params.sfxEnabled,
      sfxCues: params.sfxCues,
      sfxCatalog: params.sfxCatalog,
    },
    visuals: {
      slides: params.slides,
      branding: getDefaultTemplateBranding("conservative"),
      templateId: "default",
      templateImageEnabled: false,
      templateImageLayout: getTemplateLayout(),
      templateLayoutApply: {
        title: true,
        body: true,
        image: true,
        info: true,
      },
    },
    asset: {
      title: params.title,
      publishCategory: "conservative",
    },
    meta: {
      selectedRenderer: "server_native",
      heavyJob: false,
    },
  };
}

function getContentType(pathname: string): string {
  const lower = extname(pathname).toLowerCase();
  if (lower === ".mp3") return "audio/mpeg";
  if (lower === ".wav") return "audio/wav";
  if (lower === ".m4a") return "audio/mp4";
  if (lower === ".gif") return "image/gif";
  if (lower === ".png") return "image/png";
  if (lower === ".jpg" || lower === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

async function handleStaticRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rawTarget = String(req.url || "/").split("?")[0] || "/";
  const target = decodeURIComponent(rawTarget);
  if (target === "/__smoke/tiny.gif") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/gif");
    res.end(tinyGifBuffer);
    return;
  }
  const filePath = normalize(join(publicDir, target.replace(/^\/+/, "")));
  if (!filePath.startsWith(publicDir)) {
    res.statusCode = 403;
    res.end("forbidden");
    return;
  }
  try {
    const bytes = await readFile(filePath);
    res.statusCode = 200;
    res.setHeader("Content-Type", getContentType(filePath));
    res.end(bytes);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
}

async function startStaticAssetServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    void handleStaticRequest(req, res);
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("SMOKE_SERVER_ADDRESS_UNAVAILABLE");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) => {
          if (error) rejectPromise(error);
          else resolvePromise();
        });
      }),
  };
}

async function runCase(baseUrl: string, smokeCase: SmokeCase) {
  const result = await renderVideoWithServerNative(smokeCase.request, { baseUrl });
  if (!result.ok) {
    throw new Error(`${smokeCase.name}: ${result.errorCode}: ${result.error}`);
  }
  const fileInfo = await stat(result.videoPath);
  if (fileInfo.size <= 0) {
    throw new Error(`${smokeCase.name}: rendered file is empty`);
  }
  if (
    smokeCase.expectedEffectiveSfxCues !== undefined &&
    result.audioDiagnostics.effectiveSfxCues !== smokeCase.expectedEffectiveSfxCues
  ) {
    throw new Error(
      `${smokeCase.name}: expected ${smokeCase.expectedEffectiveSfxCues} effective SFX cues, received ${result.audioDiagnostics.effectiveSfxCues}`
    );
  }
  await rm(result.workDir, { recursive: true, force: true }).catch(() => undefined);
  return {
    name: smokeCase.name,
    videoSizeBytes: fileInfo.size,
    renderMs: result.usage.renderMs,
    peakRisk: result.audioDiagnostics.peakRisk,
    effectiveBgmEnabled: result.audioDiagnostics.effectiveBgmEnabled,
    effectiveSfxCues: result.audioDiagnostics.effectiveSfxCues,
  };
}

async function main(): Promise<void> {
  const smokeDir = await mkdtemp(join(tmpdir(), "studio-render-smoke-"));
  const assetServer = await startStaticAssetServer();
  try {
    const narrationAudioBase64 = (await readFile(join(publicDir, "sfx", "재미", "7. 뿅.mp3"))).toString("base64");
    const gifUrl = `${assetServer.baseUrl}/__smoke/tiny.gif`;
    const cases: SmokeCase[] = [
      {
        name: "static-no-mix",
        request: createSmokeRequest({
          title: "smoke-static-no-mix",
          narrationAudioBase64,
          frameDurationsSec: [1.2],
          slides: [buildVisualSlide({ title: "Smoke Static", text: "정적 이미지 렌더", imageUrl: toDataSvgUrl("STATIC") })],
          bgmEnabled: false,
          sfxEnabled: false,
        }),
      },
      {
        name: "gif-web-link",
        request: createSmokeRequest({
          title: "smoke-gif-link",
          narrationAudioBase64,
          frameDurationsSec: [1.2],
          slides: [buildVisualSlide({ title: "Smoke Gif", text: "웹 gif 렌더", imageUrl: gifUrl, mediaUrl: gifUrl, mediaKind: "animated_image" })],
          bgmEnabled: false,
          sfxEnabled: false,
        }),
      },
      {
        name: "gif-with-bgm-m4a-sfx",
        expectedEffectiveSfxCues: 1,
        request: createSmokeRequest({
          title: "smoke-gif-bgm-sfx",
          narrationAudioBase64,
          frameDurationsSec: [0.9, 0.9],
          slides: [
            buildVisualSlide({ title: "Smoke Mix 1", text: "정적 시작", imageUrl: toDataSvgUrl("MIX A") }),
            buildVisualSlide({ title: "Smoke Mix 2", text: "gif 합성", imageUrl: gifUrl, mediaUrl: gifUrl, mediaKind: "animated_image" }),
          ],
          bgmEnabled: true,
          sfxEnabled: true,
          bgmPath: "/bgm/Tango de la Noche - Wayne Jones.mp3",
          sfxCues: [
            {
              cueId: "smoke-transition-m4a",
              tag: "전환",
              frameIndex: 1,
              enabled: true,
              gainDb: -3,
            },
          ],
          sfxCatalog: [
            {
              id: "전환",
              files: [
                {
                  path: "/sfx/전환/5. 유리컵 띵.m4a",
                  defaultGainDb: -3,
                },
              ],
            },
          ],
        }),
      },
      {
        name: "fun-caption-static",
        request: (() => {
          const request = createSmokeRequest({
            title: "smoke-fun-caption",
            narrationAudioBase64,
            frameDurationsSec: [0.7, 0.7],
            slides: [
              buildVisualSlide({
                title: "펀캡션 상단 텍스트",
                text: "충격적인 첫 줄\n두 번째 줄",
                lines: ["충격적인 첫 줄", "두 번째 줄"],
                imageUrl: toDataSvgUrl("FUN"),
                captionCues: [
                  {
                    text: "충격적인 첫 줄",
                    overrides: {
                      style: "flame-gold",
                      animation: "bounce",
                      exitAnimation: "fade",
                      scale: 1.14,
                      y: 43,
                      color: "#ffd54a",
                      strokeColor: "#111111",
                    },
                  },
                  {
                    text: "두 번째 줄",
                    overrides: {
                      style: "neon-pink",
                      animation: "pulse",
                      background: "rgba(0,0,0,0.35)",
                    },
                  },
                ],
              }),
            ],
            bgmEnabled: false,
            sfxEnabled: false,
          });
          request.visuals = {
            ...request.visuals,
            branding: getDefaultTemplateBranding("fun"),
            templateId: "fun-caption",
            templateData: {
              captionFeatureEnabled: true,
              overlayFeatureEnabled: false,
              cueMetadataEnabled: true,
              autoCaptionFxEnabled: true,
              overlayPreset: "none",
              overlayOpacity: 0.78,
              overlayScale: 1,
              overlayDensity: 0.8,
              overlayPlacement: "full",
              topCaptionScale: 1,
              mainCaptionScale: 1,
              topCaptionBgOpacity: 0.68,
              overlayStrength: 0.28,
              captionStyle: "neon-pink",
              animationPreset: "pop",
              topCaptionY: 22,
              mainCaptionY: 50,
              captionMaxWidth: 92,
              topCaptionAlign: "left",
              mainCaptionAlign: "center",
              mainCaptionColor: "#fff7fb",
              mainCaptionStrokeColor: "#ffffff",
              mainCaptionStrokeWidth: 1,
              mainCaptionGlow: 0.68,
              autoCaptionProfile: "hook",
              autoCaptionIntensity: 0.72,
              autoHighlightEnabled: true,
              autoHighlightColor: "#fde047",
              autoHighlightScale: 1.16,
              topCaptionTextColor: "#f8fafc",
              topCaptionBgColor: "#0f1723",
              captionLineHeight: 1.02,
              cueDurationSec: 0.7,
            },
          };
          request.asset = {
            ...request.asset,
            publishCategory: "fun",
          };
          return request;
        })(),
      },
    ];

    const summaries = [];
    for (const smokeCase of cases) {
      summaries.push(await runCase(assetServer.baseUrl, smokeCase));
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          workDir: smokeDir,
          cases: summaries,
        },
        null,
        2,
      ),
    );
  } finally {
    await assetServer.close().catch(() => undefined);
    await rm(smokeDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
