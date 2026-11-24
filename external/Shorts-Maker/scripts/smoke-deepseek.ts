import { generateScriptFromTopic, convertScriptToStudioJson } from "@/lib/studio/codex-script";
import { planMissingSlideSfx } from "@/lib/studio/sfx-query-planner";
import { planMissingSlideImageRequests } from "@/lib/studio/image-query-planner";
import { getAiProvider, isDeepseekConfigured, getDeepseekModel } from "@/lib/studio/ai-provider";

async function main() {
  console.log("[smoke] AI_PROVIDER =", getAiProvider());
  console.log("[smoke] isDeepseekConfigured =", isDeepseekConfigured());
  console.log("[smoke] model =", getDeepseekModel());
  if (!isDeepseekConfigured()) {
    throw new Error("DeepSeek is not configured (check AI_PROVIDER/DEEPSEEK_API_KEY env vars)");
  }

  const accessToken = process.env.DEEPSEEK_API_KEY || "";

  console.log("\n=== 1) topic-to-script ===");
  const scriptResult = await generateScriptFromTopic(
    "가을철 감기 예방을 위한 생활 습관 5가지",
    accessToken,
    undefined,
    undefined,
    undefined,
    "normal"
  );
  console.log("usage:", scriptResult.usage);
  console.log("script:\n" + scriptResult.script);

  console.log("\n=== 2) script-to-json ===");
  const jsonResult = await convertScriptToStudioJson(
    scriptResult.script,
    undefined,
    accessToken,
    undefined,
    undefined,
    "normal"
  );
  console.log("usage:", jsonResult.usage);
  console.log("title:", jsonResult.title);
  console.log("slide count:", jsonResult.payload.slides?.length);
  console.log(JSON.stringify(jsonResult.payload.slides?.slice(0, 2), null, 2));

  console.log("\n=== 3) sfx planning ===");
  const payloadWithSfxCategories = {
    ...jsonResult.payload,
    sfxCategories: ["놀람", "성공", "실패", "긴장감", "전환", "재미", "임팩트", "경고"],
  };
  const sfxResult = await planMissingSlideSfx(payloadWithSfxCategories, {
    codexAccessToken: accessToken,
    bestEffort: true,
  });
  console.log("sfx warnings:", sfxResult.warnings);
  console.log(
    "sfx-tagged slides:",
    (sfxResult.payload.slides || []).filter((slide) => (slide.sfxPlan || []).length > 0).length
  );

  console.log("\n=== 4) image query planning (API transport) ===");
  const imageResult = await planMissingSlideImageRequests(jsonResult.payload, {
    codexAccessToken: accessToken,
    bestEffort: true,
  });
  console.log("image planner warnings:", imageResult.warnings);
  console.log(
    "image-request-tagged slides:",
    (imageResult.payload.slides || []).filter((slide) => slide.imageRequest?.query).length,
    "/",
    (imageResult.payload.slides || []).length
  );
  console.log(
    "sample queries:",
    (imageResult.payload.slides || []).slice(0, 3).map((slide) => slide.imageRequest?.query)
  );

  console.log("\n[smoke] ALL STAGES COMPLETED OK");
}

main().catch((error) => {
  console.error("[smoke] FAILED:", error);
  process.exitCode = 1;
});
