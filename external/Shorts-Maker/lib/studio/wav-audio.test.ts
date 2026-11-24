import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzePcmWavAudibleRangeFromBase64,
  concatWavBase64Segments,
  estimateDurationsFromWavBase64Segments,
  estimateWavDurationSecFromBase64,
} from "./wav-audio";

type WavFixtureOptions = {
  sampleRate?: number;
  channelCount?: 1 | 2;
  bitsPerSample?: 16 | 8;
  audioFormat?: number;
  samples: number[][];
};

function makePcmWavBase64(options: WavFixtureOptions): string {
  const sampleRate = options.sampleRate || 1000;
  const channelCount = options.channelCount || 1;
  const bitsPerSample = options.bitsPerSample || 16;
  const audioFormat = options.audioFormat ?? 1;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const frameCount = options.samples.length;
  const dataLength = frameCount * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(audioFormat, 20);
  header.writeUInt16LE(channelCount, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataLength, 40);
  const data = Buffer.alloc(dataLength);
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const offset = frame * blockAlign + channel * bytesPerSample;
      const sample = options.samples[frame]?.[channel] || 0;
      if (bitsPerSample === 16) {
        data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample))), offset);
      } else {
        data.writeUInt8(Math.max(0, Math.min(255, Math.round(sample + 128))), offset);
      }
    }
  }
  return Buffer.concat([header, data]).toString("base64");
}

function monoFrames(count: number, amplitude: number): number[][] {
  return Array.from({ length: count }, () => [amplitude]);
}

function stereoFrames(count: number, left: number, right: number): number[][] {
  return Array.from({ length: count }, () => [left, right]);
}

function assertAlmostEqual(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${actual} to be within tolerance of ${expected}`);
}

test("analyzePcmWavAudibleRangeFromBase64 returns full silence for silent PCM WAV", () => {
  const audio = makePcmWavBase64({ samples: monoFrames(1000, 0) });
  const result = analyzePcmWavAudibleRangeFromBase64(audio);

  assert.ok(result);
  assert.equal(result.durationSec, 1);
  assert.equal(result.firstAudibleSec, null);
  assert.equal(result.lastAudibleEndSec, null);
  assert.equal(result.leadingSilenceSec, 1);
  assert.equal(result.trailingSilenceSec, 1);
});

test("analyzePcmWavAudibleRangeFromBase64 detects leading and trailing silence around tone", () => {
  const audio = makePcmWavBase64({
    samples: [...monoFrames(100, 0), ...monoFrames(500, 10000), ...monoFrames(200, 0)],
  });
  const result = analyzePcmWavAudibleRangeFromBase64(audio);

  assert.ok(result);
  assert.equal(result.durationSec, 0.8);
  assert.equal(result.firstAudibleSec, 0.1);
  assert.equal(result.lastAudibleEndSec, 0.6);
  assert.equal(result.leadingSilenceSec, 0.1);
  assertAlmostEqual(result.trailingSilenceSec, 0.2);
});

test("analyzePcmWavAudibleRangeFromBase64 ignores signal below default threshold", () => {
  const audio = makePcmWavBase64({ samples: monoFrames(1000, 100) });
  const result = analyzePcmWavAudibleRangeFromBase64(audio);

  assert.ok(result);
  assert.equal(result.firstAudibleSec, null);
  assert.equal(result.lastAudibleEndSec, null);
});

test("analyzePcmWavAudibleRangeFromBase64 accepts sustained signal above default threshold", () => {
  const audio = makePcmWavBase64({ samples: monoFrames(1000, 300) });
  const result = analyzePcmWavAudibleRangeFromBase64(audio);

  assert.ok(result);
  assert.equal(result.firstAudibleSec, 0);
  assert.equal(result.lastAudibleEndSec, 1);
});

test("analyzePcmWavAudibleRangeFromBase64 avoids short click false positives", () => {
  const audio = makePcmWavBase64({
    samples: [...monoFrames(100, 0), ...monoFrames(10, 20000), ...monoFrames(890, 0)],
  });
  const result = analyzePcmWavAudibleRangeFromBase64(audio);

  assert.ok(result);
  assert.equal(result.firstAudibleSec, null);
  assert.equal(result.lastAudibleEndSec, null);
});

test("analyzePcmWavAudibleRangeFromBase64 supports stereo PCM WAV", () => {
  const audio = makePcmWavBase64({
    channelCount: 2,
    samples: [...stereoFrames(50, 0, 0), ...stereoFrames(100, 0, 5000), ...stereoFrames(50, 0, 0)],
  });
  const result = analyzePcmWavAudibleRangeFromBase64(audio);

  assert.ok(result);
  assert.equal(result.durationSec, 0.2);
  assert.equal(result.firstAudibleSec, 0.05);
  assert.notEqual(result.lastAudibleEndSec, null);
  if (result.lastAudibleEndSec === null) return;
  assertAlmostEqual(result.lastAudibleEndSec, 0.15);
});

test("analyzePcmWavAudibleRangeFromBase64 returns null for malformed and unsupported WAV", () => {
  assert.equal(analyzePcmWavAudibleRangeFromBase64(Buffer.from("not wav").toString("base64")), null);
  assert.equal(
    analyzePcmWavAudibleRangeFromBase64(
      makePcmWavBase64({
        audioFormat: 3,
        samples: monoFrames(100, 10000),
      })
    ),
    null
  );
  assert.equal(
    analyzePcmWavAudibleRangeFromBase64(
      makePcmWavBase64({
        bitsPerSample: 8,
        samples: monoFrames(100, 100),
      })
    ),
    null
  );
});

test("existing WAV helpers keep duration and concat behavior", () => {
  const first = makePcmWavBase64({ samples: monoFrames(100, 1000) });
  const second = makePcmWavBase64({ samples: monoFrames(250, 2000) });
  const joined = concatWavBase64Segments([first, second]);

  assert.equal(estimateWavDurationSecFromBase64(first), 0.1);
  assert.deepEqual(estimateDurationsFromWavBase64Segments([first, second]), [0.1, 0.25]);
  assert.equal(estimateWavDurationSecFromBase64(joined), 0.35);
});
