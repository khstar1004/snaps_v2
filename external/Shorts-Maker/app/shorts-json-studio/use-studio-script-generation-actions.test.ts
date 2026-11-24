import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./use-studio-script-generation-actions.ts", import.meta.url), "utf8");

function requestBlock(functionName: string, occurrenceIndex: number): string {
  let searchFrom = 0;
  let position = -1;
  for (let index = 0; index <= occurrenceIndex; index += 1) {
    position = source.indexOf(`${functionName}({`, searchFrom);
    if (position < 0) return "";
    searchFrom = position + functionName.length;
  }
  const end = source.indexOf("});", position);
  return end >= 0 ? source.slice(position, end) : "";
}

test("script generation requests forward the active project profile snapshot", () => {
  assert.match(source, /projectProfileSnapshot:\s*StudioProjectProfileSnapshot\s*\|\s*null/);

  assert.match(requestBlock("requestStudioTopicToScript", 0), /projectProfileSnapshot:\s*input\.projectProfileSnapshot/);
  assert.match(requestBlock("requestStudioScriptToJson", 0), /projectProfileSnapshot:\s*input\.projectProfileSnapshot/);
  assert.match(requestBlock("requestStudioScriptToJson", 1), /projectProfileSnapshot:\s*input\.projectProfileSnapshot/);
});
