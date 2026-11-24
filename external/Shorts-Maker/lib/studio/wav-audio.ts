function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index] || 0);
  }
  return value;
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const buffer = Buffer.from(base64, "base64");
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

type ParsedWav = {
  audioFormat: number;
  channelCount: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
};

export type WavAudibleRange = {
  durationSec: number;
  firstAudibleSec: number | null;
  lastAudibleEndSec: number | null;
  leadingSilenceSec: number;
  trailingSilenceSec: number;
};

function parseWav(bytes: Uint8Array): ParsedWav | null {
  if (bytes.length < 44) return null;
  if (readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WAVE") return null;
  let offset = 12;
  let audioFormat = 1;
  let channelCount = 1;
  let sampleRate = 24000;
  let byteRate = 48000;
  let blockAlign = 2;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataLength = 0;

  while (offset + 8 <= bytes.length) {
    const chunkId = readAscii(bytes, offset, 4);
    const chunkSize = readUint32LE(bytes, offset + 4);
    const chunkStart = offset + 8;
    if (chunkId === "fmt " && chunkStart + 16 <= bytes.length) {
      audioFormat = readUint16LE(bytes, chunkStart);
      channelCount = readUint16LE(bytes, chunkStart + 2);
      sampleRate = readUint32LE(bytes, chunkStart + 4);
      byteRate = readUint32LE(bytes, chunkStart + 8);
      blockAlign = readUint16LE(bytes, chunkStart + 12);
      bitsPerSample = readUint16LE(bytes, chunkStart + 14);
    }
    if (chunkId === "data") {
      dataOffset = chunkStart;
      dataLength = Math.min(chunkSize, Math.max(0, bytes.length - chunkStart));
      break;
    }
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0 || !byteRate) return null;
  return {
    audioFormat,
    channelCount,
    sampleRate,
    byteRate,
    blockAlign,
    bitsPerSample,
    dataOffset,
    dataLength,
  };
}

export function estimateWavDurationSecFromBase64(audioBase64: string): number {
  const parsed = parseWav(base64ToUint8Array(audioBase64));
  if (!parsed || parsed.byteRate <= 0 || parsed.dataLength <= 0) return 0;
  return Math.max(0, parsed.dataLength / parsed.byteRate);
}

function isSupportedPcm16Wav(meta: ParsedWav): boolean {
  return (
    meta.audioFormat === 1 &&
    (meta.channelCount === 1 || meta.channelCount === 2) &&
    meta.bitsPerSample === 16 &&
    meta.sampleRate > 0 &&
    meta.blockAlign === meta.channelCount * 2 &&
    meta.byteRate === meta.sampleRate * meta.blockAlign &&
    meta.dataLength >= meta.blockAlign
  );
}

function readInt16LE(bytes: Uint8Array, offset: number): number {
  const value = bytes[offset] | (bytes[offset + 1] << 8);
  return value >= 0x8000 ? value - 0x10000 : value;
}

function windowHasAudibleSample(params: {
  bytes: Uint8Array;
  meta: ParsedWav;
  startFrame: number;
  endFrameExclusive: number;
  thresholdAmplitude: number;
}): boolean {
  const { bytes, meta, startFrame, endFrameExclusive, thresholdAmplitude } = params;
  for (let frame = startFrame; frame < endFrameExclusive; frame += 1) {
    const frameOffset = meta.dataOffset + frame * meta.blockAlign;
    for (let channel = 0; channel < meta.channelCount; channel += 1) {
      const sampleOffset = frameOffset + channel * 2;
      if (sampleOffset + 1 >= bytes.length) return false;
      if (Math.abs(readInt16LE(bytes, sampleOffset)) >= thresholdAmplitude) return true;
    }
  }
  return false;
}

function hasConsecutiveAudibleWindows(params: {
  audibleByWindow: boolean[];
  startIndex: number;
  direction: 1 | -1;
  requiredWindows: number;
}): boolean {
  const { audibleByWindow, startIndex, direction, requiredWindows } = params;
  for (let offset = 0; offset < requiredWindows; offset += 1) {
    const index = startIndex + offset * direction;
    if (index < 0 || index >= audibleByWindow.length || !audibleByWindow[index]) return false;
  }
  return true;
}

export function analyzePcmWavAudibleRangeFromBase64(
  audioBase64: string,
  options: { thresholdDbfs?: number; scanWindowMs?: number; minAudibleMs?: number } = {}
): WavAudibleRange | null {
  const bytes = base64ToUint8Array(audioBase64);
  const meta = parseWav(bytes);
  if (!meta || !isSupportedPcm16Wav(meta)) return null;

  const totalFrames = Math.floor(meta.dataLength / meta.blockAlign);
  if (totalFrames <= 0) return null;
  const durationSec = totalFrames / meta.sampleRate;
  const thresholdDbfs = Number.isFinite(options.thresholdDbfs) ? Number(options.thresholdDbfs) : -45;
  const scanWindowMs = Number.isFinite(options.scanWindowMs) ? Math.max(1, Number(options.scanWindowMs)) : 10;
  const minAudibleMs = Number.isFinite(options.minAudibleMs) ? Math.max(scanWindowMs, Number(options.minAudibleMs)) : 30;
  const framesPerWindow = Math.max(1, Math.round((meta.sampleRate * scanWindowMs) / 1000));
  const requiredAudibleWindows = Math.max(1, Math.ceil(minAudibleMs / scanWindowMs));
  const thresholdAmplitude = Math.max(1, Math.round(32767 * 10 ** (thresholdDbfs / 20)));
  const windowCount = Math.ceil(totalFrames / framesPerWindow);
  const audibleByWindow = Array.from({ length: windowCount }, (_, index) => {
    const startFrame = index * framesPerWindow;
    const endFrameExclusive = Math.min(totalFrames, startFrame + framesPerWindow);
    return windowHasAudibleSample({
      bytes,
      meta,
      startFrame,
      endFrameExclusive,
      thresholdAmplitude,
    });
  });

  let firstAudibleWindow = -1;
  for (let index = 0; index < audibleByWindow.length; index += 1) {
    if (
      audibleByWindow[index] &&
      hasConsecutiveAudibleWindows({
        audibleByWindow,
        startIndex: index,
        direction: 1,
        requiredWindows: requiredAudibleWindows,
      })
    ) {
      firstAudibleWindow = index;
      break;
    }
  }

  if (firstAudibleWindow < 0) {
    return {
      durationSec,
      firstAudibleSec: null,
      lastAudibleEndSec: null,
      leadingSilenceSec: durationSec,
      trailingSilenceSec: durationSec,
    };
  }

  let lastAudibleWindow = firstAudibleWindow;
  for (let index = audibleByWindow.length - 1; index >= firstAudibleWindow; index -= 1) {
    if (
      audibleByWindow[index] &&
      hasConsecutiveAudibleWindows({
        audibleByWindow,
        startIndex: index,
        direction: -1,
        requiredWindows: requiredAudibleWindows,
      })
    ) {
      lastAudibleWindow = index;
      break;
    }
  }

  const firstAudibleSec = Math.min(durationSec, (firstAudibleWindow * framesPerWindow) / meta.sampleRate);
  const lastAudibleEndSec = Math.min(durationSec, ((lastAudibleWindow + 1) * framesPerWindow) / meta.sampleRate);
  return {
    durationSec,
    firstAudibleSec,
    lastAudibleEndSec,
    leadingSilenceSec: firstAudibleSec,
    trailingSilenceSec: Math.max(0, durationSec - lastAudibleEndSec),
  };
}

function buildWavHeader(meta: ParsedWav, totalDataLength: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + totalDataLength, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(meta.audioFormat, 20);
  header.writeUInt16LE(meta.channelCount, 22);
  header.writeUInt32LE(meta.sampleRate, 24);
  header.writeUInt32LE(meta.byteRate, 28);
  header.writeUInt16LE(meta.blockAlign, 32);
  header.writeUInt16LE(meta.bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(totalDataLength, 40);
  return header;
}

export function concatWavBase64Segments(segments: string[]): string {
  const parsed = segments
    .map((segment) => {
      const bytes = base64ToUint8Array(segment);
      const meta = parseWav(bytes);
      if (!meta) return null;
      return {
        meta,
        data: Buffer.from(bytes.buffer, bytes.byteOffset + meta.dataOffset, meta.dataLength),
      };
    })
    .filter((item): item is { meta: ParsedWav; data: Buffer } => Boolean(item));

  if (parsed.length <= 0) return "";
  const reference = parsed[0].meta;
  const compatible = parsed.filter(
    (item) =>
      item.meta.audioFormat === reference.audioFormat &&
      item.meta.channelCount === reference.channelCount &&
      item.meta.sampleRate === reference.sampleRate &&
      item.meta.bitsPerSample === reference.bitsPerSample
  );
  if (compatible.length <= 0) return "";
  const totalDataLength = compatible.reduce((acc, item) => acc + item.data.length, 0);
  return Buffer.concat([buildWavHeader(reference, totalDataLength), ...compatible.map((item) => item.data)]).toString("base64");
}

export function estimateDurationsFromWavBase64Segments(segments: string[]): number[] {
  return segments.map((segment) => {
    const duration = estimateWavDurationSecFromBase64(segment);
    return Number.isFinite(duration) && duration > 0 ? duration : 0.001;
  });
}
