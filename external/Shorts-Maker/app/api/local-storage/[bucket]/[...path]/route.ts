import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { parseByteRange } from "@/lib/local/byte-range";
import { createLocalStorageReadStream, getLocalStorageFilePath, hasLocalStorageConfig } from "@/lib/local/storage";

export const runtime = "nodejs";

function contentTypeForPath(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

export async function GET(request: Request, context: { params: Promise<{ bucket: string; path: string[] }> }) {
  if (!hasLocalStorageConfig()) {
    return new Response("Local storage is not configured", { status: 404 });
  }
  const params = await context.params;
  const bucket = params.bucket;
  const storagePath = params.path.join("/");
  const filePath = getLocalStorageFilePath(bucket, storagePath);
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    return new Response("Not found", { status: 404 });
  }
  const range = parseByteRange(request.headers.get("range"), fileStat.size);
  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${fileStat.size}`,
        "Accept-Ranges": "bytes",
      },
    });
  }
  if (range) {
    return new Response(createLocalStorageReadStream(bucket, storagePath, range) as unknown as BodyInit, {
      status: 206,
      headers: {
        "Content-Type": contentTypeForPath(storagePath),
        "Content-Range": `bytes ${range.start}-${range.end}/${fileStat.size}`,
        "Content-Length": String(range.end - range.start + 1),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Accept-Ranges": "bytes",
      },
    });
  }
  return new Response(createLocalStorageReadStream(bucket, storagePath) as unknown as BodyInit, {
    headers: {
      "Content-Type": contentTypeForPath(storagePath),
      "Content-Length": String(fileStat.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Accept-Ranges": "bytes",
    },
  });
}
