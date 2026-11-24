import { Injectable } from '@nestjs/common';

export type SnapsVideoCaptionPlatform = 'instagram' | 'youtube' | 'tiktok';
export type SnapsVideoCaptionStyle = 'karaoke' | 'lower-third' | 'subtitle';
export type SnapsVideoVoiceStyle = 'clear' | 'energetic' | 'calm' | 'news';

export type SnapsVideoVoiceoverCaptionRequest = {
  sourceText?: unknown;
  script?: unknown;
  durationSeconds?: unknown;
  platform?: unknown;
  voice?: unknown;
  voiceStyle?: unknown;
  captionStyle?: unknown;
  wordsPerMinute?: unknown;
};

export type SnapsVideoCaptionCue = {
  id: string;
  index: number;
  startSecond: number;
  endSecond: number;
  text: string;
  words: number;
  readingLoad: number;
  status: 'ready' | 'tight' | 'too-long';
  warnings: string[];
};

export type SnapsVideoVoiceoverTrack = {
  id: string;
  kind: 'voiceover' | 'caption' | 'visual';
  label: string;
  startSecond: number;
  endSecond: number;
  status: 'ready' | 'needs-align' | 'needs-review';
  alignmentAction: string;
};

export type SnapsVideoSceneAlignment = {
  scene: number;
  startSecond: number;
  endSecond: number;
  visual: string;
  narration: string;
  captionText: string;
  pixellePrompt: string;
  alignToCaptions: string;
  warnings: string[];
};

export type SnapsVideoVoiceoverCaptionPreview = {
  source: 'snaps-video-voiceover-captions';
  template: 'AI Video with AI Voice' | 'Image Slideshow with Text Overlays';
  platform: SnapsVideoCaptionPlatform;
  durationSeconds: number;
  voiceover: {
    voice: string;
    voiceStyle: SnapsVideoVoiceStyle;
    provider: 'ElevenLabs-compatible';
    stability: number;
    similarityBoost: number;
    paceWpm: number;
    estimatedWords: number;
    estimatedVoiceSeconds: number;
  };
  captionStyle: SnapsVideoCaptionStyle;
  captions: SnapsVideoCaptionCue[];
  tracks: SnapsVideoVoiceoverTrack[];
  sceneAlignments: SnapsVideoSceneAlignment[];
  exports: {
    srt: string;
    webVtt: string;
  };
  summary: {
    captionCount: number;
    overrunCaptions: number;
    silentGaps: number;
    alignmentScore: number;
    reviewRequired: boolean;
  };
  uploadMetadata: {
    title: string;
    description: string;
    hashtags: string[];
  };
  warnings: string[];
  recommendations: string[];
};

type NormalizedScene = {
  scene: number;
  startSecond: number;
  endSecond: number;
  visual: string;
  narration: string;
  overlayText: string;
  pixellePrompt: string;
};

@Injectable()
export class SnapsVideoVoiceoverCaptionService {
  preview(
    body?: SnapsVideoVoiceoverCaptionRequest
  ): SnapsVideoVoiceoverCaptionPreview {
    const request = body || {};
    const script = this.record(request.script);
    const nestedScript = this.record(script.script);
    const scriptRoot = Object.keys(nestedScript).length ? nestedScript : script;
    const durationSeconds = this.duration(request.durationSeconds || scriptRoot.durationSeconds);
    const platform = this.platform(request.platform);
    const voiceStyle = this.voiceStyle(request.voiceStyle);
    const captionStyle = this.captionStyle(request.captionStyle);
    const voice = this.cleanText(request.voice, 80) || this.defaultVoice(voiceStyle);
    const paceWpm = this.wordsPerMinute(request.wordsPerMinute, voiceStyle);
    const sourceText =
      this.cleanText(request.sourceText, 6000) ||
      this.cleanText(scriptRoot.narration, 6000) ||
      this.cleanText(scriptRoot.caption, 6000) ||
      'Short-form video script for a product update.';
    const scenes = this.scenes(scriptRoot, sourceText, durationSeconds);
    const narration = this.narration(scriptRoot, scenes, sourceText);
    const captions = this.captionCues(narration, durationSeconds, paceWpm);
    const sceneAlignments = this.alignScenes(scenes, captions);
    const tracks = this.tracks(durationSeconds, captions, sceneAlignments);
    const warnings = this.warnings(durationSeconds, captions, sceneAlignments, platform);
    const estimatedWords = captions.reduce((sum, cue) => sum + cue.words, 0);
    const estimatedVoiceSeconds = Math.round((estimatedWords / paceWpm) * 60);
    const silentGaps = this.silentGaps(captions, durationSeconds);
    const overrunCaptions = captions.filter((caption) => caption.status !== 'ready').length;
    const alignmentScore = this.alignmentScore(
      captions,
      sceneAlignments,
      silentGaps,
      overrunCaptions
    );

    return {
      source: 'snaps-video-voiceover-captions',
      template:
        scenes.length > 1 ? 'AI Video with AI Voice' : 'Image Slideshow with Text Overlays',
      platform,
      durationSeconds,
      voiceover: {
        voice,
        voiceStyle,
        provider: 'ElevenLabs-compatible',
        stability: voiceStyle === 'energetic' ? 0.48 : 0.62,
        similarityBoost: voiceStyle === 'news' ? 0.78 : 0.7,
        paceWpm,
        estimatedWords,
        estimatedVoiceSeconds,
      },
      captionStyle,
      captions,
      tracks,
      sceneAlignments,
      exports: {
        srt: this.srt(captions),
        webVtt: this.webVtt(captions),
      },
      summary: {
        captionCount: captions.length,
        overrunCaptions,
        silentGaps,
        alignmentScore,
        reviewRequired: warnings.length > 0 || alignmentScore < 82,
      },
      uploadMetadata: this.uploadMetadata(scriptRoot, sourceText, platform),
      warnings,
      recommendations: this.recommendations(
        captions,
        sceneAlignments,
        platform,
        captionStyle
      ),
    };
  }

  private scenes(
    scriptRoot: Record<string, unknown>,
    sourceText: string,
    durationSeconds: number
  ): NormalizedScene[] {
    const storyboard = Array.isArray(scriptRoot.storyboard)
      ? scriptRoot.storyboard.slice(0, 8)
      : [];
    if (storyboard.length) {
      return storyboard.map((value, index) => {
        const record = this.record(value);
        const sceneCount = storyboard.length;
        const fallbackStart = Math.floor((durationSeconds / sceneCount) * index);
        const fallbackEnd =
          index === sceneCount - 1
            ? durationSeconds
            : Math.floor((durationSeconds / sceneCount) * (index + 1));
        const startSecond = this.second(record.startSecond, fallbackStart, 0, durationSeconds - 1);
        const endSecond = Math.max(
          startSecond + 1,
          this.second(record.endSecond, fallbackEnd, startSecond + 1, durationSeconds)
        );
        return {
          scene: this.integer(record.scene, index + 1),
          startSecond,
          endSecond: Math.min(durationSeconds, endSecond),
          visual:
            this.cleanText(record.visual, 220) ||
            this.cleanText(record.overlayText, 220) ||
            `Scene ${index + 1} visual`,
          narration: this.cleanText(record.narration, 500),
          overlayText: this.cleanText(record.overlayText, 120),
          pixellePrompt:
            this.cleanText(record.pixellePrompt, 500) ||
            `Vertical ${this.cleanText(record.visual, 160) || 'campaign'} shot with readable captions.`,
        };
      });
    }

    const chunks = this.phrases(sourceText, 5, 140);
    const sceneCount = Math.min(6, Math.max(3, Math.ceil(durationSeconds / 12)));
    return Array.from({ length: sceneCount }, (_, index) => {
      const startSecond = Math.floor((durationSeconds / sceneCount) * index);
      const endSecond =
        index === sceneCount - 1
          ? durationSeconds
          : Math.floor((durationSeconds / sceneCount) * (index + 1));
      const chunk = chunks[index % chunks.length] || sourceText.slice(0, 120);
      return {
        scene: index + 1,
        startSecond,
        endSecond,
        visual: `${chunk} visual moment`,
        narration: chunk,
        overlayText: chunk.slice(0, 48),
        pixellePrompt: `Vertical social video scene about: ${chunk.slice(0, 160)}.`,
      };
    });
  }

  private narration(
    scriptRoot: Record<string, unknown>,
    scenes: NormalizedScene[],
    sourceText: string
  ) {
    const explicit = this.cleanText(scriptRoot.narration, 7000);
    if (explicit) {
      return explicit;
    }
    const fromScenes = scenes
      .map((scene) => scene.narration || scene.overlayText)
      .filter(Boolean)
      .join(' ');
    return this.cleanText(fromScenes, 7000) || sourceText;
  }

  private captionCues(
    narration: string,
    durationSeconds: number,
    paceWpm: number
  ): SnapsVideoCaptionCue[] {
    const minCueCount = Math.min(6, Math.max(3, Math.ceil(durationSeconds / 15)));
    let chunks = this.phrases(narration, 11, 86);
    if (chunks.length < minCueCount) {
      chunks = this.characterPhrases(narration, minCueCount, 86);
    }
    const weightedWords = chunks.map((chunk) => this.wordCount(chunk));
    const totalWords = Math.max(1, weightedWords.reduce((sum, count) => sum + count, 0));
    let cursor = 0.35;
    return chunks.map((chunk, index) => {
      const words = weightedWords[index] || 1;
      const proportional = Math.max(1.2, (durationSeconds - 0.7) * (words / totalWords));
      const voiceEstimate = Math.max(1.2, (words / paceWpm) * 60);
      const length = Math.min(5.2, Math.max(proportional, voiceEstimate * 0.82));
      const startSecond = Number(Math.min(durationSeconds - 0.4, cursor).toFixed(2));
      const endSecond = Number(
        Math.min(durationSeconds, index === chunks.length - 1 ? durationSeconds : cursor + length).toFixed(2)
      );
      cursor = endSecond + 0.12;
      const actualLength = Math.max(0.1, endSecond - startSecond);
      const readingLoad = Number((words / actualLength).toFixed(2));
      const warnings: string[] = [];
      if (words > 14) {
        warnings.push('caption has more than 14 words');
      }
      if (readingLoad > 3.4) {
        warnings.push('caption reading speed is too tight');
      }
      if (endSecond >= durationSeconds && index < chunks.length - 1) {
        warnings.push('caption timeline reaches the end before narration finishes');
      }
      return {
        id: `caption-${index + 1}`,
        index: index + 1,
        startSecond,
        endSecond,
        text: chunk,
        words,
        readingLoad,
        status:
          words > 16 || readingLoad > 3.8
            ? 'too-long'
            : warnings.length
            ? 'tight'
            : 'ready',
        warnings,
      };
    });
  }

  private alignScenes(
    scenes: NormalizedScene[],
    captions: SnapsVideoCaptionCue[]
  ): SnapsVideoSceneAlignment[] {
    return scenes.map((scene) => {
      const sceneCaptions = captions.filter((caption) => {
        const midpoint = (caption.startSecond + caption.endSecond) / 2;
        return midpoint >= scene.startSecond && midpoint <= scene.endSecond;
      });
      const captionText =
        sceneCaptions.map((caption) => caption.text).join(' ') ||
        captions[Math.min(scene.scene - 1, captions.length - 1)]?.text ||
        scene.overlayText;
      const warnings: string[] = [];
      if (!sceneCaptions.length) {
        warnings.push('no caption cue falls inside this visual scene');
      }
      if (captionText.length > 120) {
        warnings.push('scene caption text should be split or shortened');
      }
      return {
        scene: scene.scene,
        startSecond: scene.startSecond,
        endSecond: scene.endSecond,
        visual: scene.visual,
        narration: scene.narration || captionText,
        captionText,
        pixellePrompt: `${scene.pixellePrompt} Align image or video track to captions ${scene.startSecond}-${scene.endSecond}s.`,
        alignToCaptions: `Align visual track ${scene.scene} to caption cues between ${scene.startSecond}s and ${scene.endSecond}s.`,
        warnings,
      };
    });
  }

  private tracks(
    durationSeconds: number,
    captions: SnapsVideoCaptionCue[],
    scenes: SnapsVideoSceneAlignment[]
  ): SnapsVideoVoiceoverTrack[] {
    const captionEnd = captions[captions.length - 1]?.endSecond || durationSeconds;
    return [
      {
        id: 'voiceover-track',
        kind: 'voiceover',
        label: 'AI voiceover',
        startSecond: 0,
        endSecond: Math.min(durationSeconds, captionEnd),
        status: captionEnd > durationSeconds ? 'needs-review' : 'ready',
        alignmentAction: 'Generate voiceover from narration, then keep captions locked to the audio waveform.',
      },
      {
        id: 'caption-track',
        kind: 'caption',
        label: 'Burned captions',
        startSecond: captions[0]?.startSecond || 0,
        endSecond: captionEnd,
        status: captions.some((caption) => caption.status !== 'ready')
          ? 'needs-review'
          : 'ready',
        alignmentAction: 'Use these SRT/WebVTT cues as the blue caption track before video generation.',
      },
      {
        id: 'visual-track',
        kind: 'visual',
        label: 'Image/video scenes',
        startSecond: scenes[0]?.startSecond || 0,
        endSecond: scenes[scenes.length - 1]?.endSecond || durationSeconds,
        status: scenes.some((scene) => scene.warnings.length)
          ? 'needs-align'
          : 'ready',
        alignmentAction: 'Align image/video tracks to captions after voiceover generation.',
      },
    ];
  }

  private warnings(
    durationSeconds: number,
    captions: SnapsVideoCaptionCue[],
    scenes: SnapsVideoSceneAlignment[],
    platform: SnapsVideoCaptionPlatform
  ) {
    const warnings: string[] = [];
    if (captions.some((caption) => caption.status === 'too-long')) {
      warnings.push('Some caption cues are too long for short-form mobile reading.');
    }
    if (captions[captions.length - 1]?.endSecond >= durationSeconds && captions.length > 7) {
      warnings.push('Voiceover may feel rushed for the selected duration.');
    }
    if (scenes.some((scene) => scene.warnings.length)) {
      warnings.push('One or more visual tracks need caption alignment before generation.');
    }
    if (platform === 'tiktok' && durationSeconds > 60) {
      warnings.push('TikTok test clips should stay under 60 seconds unless the hook is already proven.');
    }
    if (platform === 'youtube' && captions.length < 3) {
      warnings.push('YouTube Shorts usually needs more caption beats to retain silent viewers.');
    }
    return warnings;
  }

  private recommendations(
    captions: SnapsVideoCaptionCue[],
    scenes: SnapsVideoSceneAlignment[],
    platform: SnapsVideoCaptionPlatform,
    captionStyle: SnapsVideoCaptionStyle
  ) {
    const recommendations = [
      'Generate voiceover first, then use Align to Captions before publishing.',
      'Keep the first caption visible within the first second.',
      'Review the final video with sound off to confirm the story is still clear.',
    ];
    if (captions.some((caption) => caption.status !== 'ready')) {
      recommendations.push('Split tight caption cues into shorter lines before rendering.');
    }
    if (scenes.some((scene) => scene.warnings.length)) {
      recommendations.push('Extend or trim visual scenes so each one owns at least one caption cue.');
    }
    if (captionStyle === 'karaoke') {
      recommendations.push('Use high-contrast karaoke captions only for hooks and proof points.');
    }
    if (platform === 'instagram') {
      recommendations.push('Leave bottom safe area clear for Reels controls and captions.');
    }
    return recommendations;
  }

  private uploadMetadata(
    scriptRoot: Record<string, unknown>,
    sourceText: string,
    platform: SnapsVideoCaptionPlatform
  ) {
    const upload = this.record(scriptRoot.uploadMetadata);
    const title =
      this.cleanText(upload.title, 90) ||
      this.cleanText(scriptRoot.title, 90) ||
      this.cleanText(sourceText, 60) ||
      'snaps short-form video';
    const description =
      this.cleanText(upload.description, 280) ||
      this.cleanText(scriptRoot.caption, 280) ||
      `${title} - voiceover caption ready for ${platform}.`;
    const hashtags = this.hashtags(upload.hashtags || scriptRoot.hashtags);
    return {
      title,
      description,
      hashtags: hashtags.length ? hashtags : ['#snaps', '#contentops', '#shorts'],
    };
  }

  private srt(captions: SnapsVideoCaptionCue[]) {
    return captions
      .map(
        (caption) =>
          `${caption.index}\n${this.timestamp(caption.startSecond, ',')} --> ${this.timestamp(
            caption.endSecond,
            ','
          )}\n${caption.text}`
      )
      .join('\n\n');
  }

  private webVtt(captions: SnapsVideoCaptionCue[]) {
    return `WEBVTT\n\n${captions
      .map(
        (caption) =>
          `${this.timestamp(caption.startSecond, '.')} --> ${this.timestamp(
            caption.endSecond,
            '.'
          )}\n${caption.text}`
      )
      .join('\n\n')}`;
  }

  private timestamp(seconds: number, separator: ',' | '.') {
    const whole = Math.max(0, Math.floor(seconds));
    const millis = Math.round((seconds - whole) * 1000);
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor((whole % 3600) / 60);
    const secs = whole % 60;
    return `${this.pad(hours)}:${this.pad(minutes)}:${this.pad(secs)}${separator}${String(
      millis
    ).padStart(3, '0')}`;
  }

  private silentGaps(captions: SnapsVideoCaptionCue[], durationSeconds: number) {
    let gaps = captions[0]?.startSecond && captions[0].startSecond > 1 ? 1 : 0;
    for (let index = 1; index < captions.length; index += 1) {
      if (captions[index].startSecond - captions[index - 1].endSecond > 1.1) {
        gaps += 1;
      }
    }
    if (durationSeconds - (captions[captions.length - 1]?.endSecond || 0) > 1.5) {
      gaps += 1;
    }
    return gaps;
  }

  private alignmentScore(
    captions: SnapsVideoCaptionCue[],
    scenes: SnapsVideoSceneAlignment[],
    silentGaps: number,
    overrunCaptions: number
  ) {
    const sceneWarnings = scenes.reduce((sum, scene) => sum + scene.warnings.length, 0);
    const captionWarnings = captions.reduce(
      (sum, caption) => sum + caption.warnings.length,
      0
    );
    return Math.max(
      0,
      Math.min(100, 100 - sceneWarnings * 8 - captionWarnings * 5 - silentGaps * 6 - overrunCaptions * 7)
    );
  }

  private phrases(text: string, targetWords: number, maxChars: number) {
    const source = this.cleanText(text, 8000);
    const sentences = source
      .split(/(?<=[.!?。！？])\s+|\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const words = (sentences.length ? sentences.join(' ') : source).split(/\s+/).filter(Boolean);
    const phrases: string[] = [];
    let current: string[] = [];
    for (const word of words) {
      const next = [...current, word].join(' ');
      if (current.length && (current.length >= targetWords || next.length > maxChars)) {
        phrases.push(current.join(' '));
        current = [word];
      } else {
        current.push(word);
      }
    }
    if (current.length) {
      phrases.push(current.join(' '));
    }
    return phrases.length ? phrases : [source || 'Ready to publish.'];
  }

  private characterPhrases(text: string, minCount: number, maxChars: number) {
    const source = this.cleanText(text, 8000);
    if (!source) {
      return ['Ready to publish.'];
    }
    const targetCount = Math.max(1, minCount);
    const sentenceParts = source
      .split(/(?<=[.!?。！？])\s+|[,;:]\s+|\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const seed = sentenceParts.length >= targetCount ? sentenceParts : [source];
    const joined = seed.join(' ');
    const targetLength = Math.max(18, Math.ceil(joined.length / targetCount));
    const chunks: string[] = [];
    let cursor = 0;
    while (cursor < joined.length) {
      const hardEnd = Math.min(joined.length, cursor + Math.min(maxChars, targetLength));
      let end = hardEnd;
      const beforeBreak = joined.slice(cursor, hardEnd).lastIndexOf(' ');
      if (beforeBreak > targetLength * 0.55) {
        end = cursor + beforeBreak;
      } else {
        const afterBreak = joined.slice(hardEnd, Math.min(joined.length, hardEnd + 14)).search(/\s/);
        if (afterBreak >= 0) {
          end = hardEnd + afterBreak;
        }
      }
      const chunk = joined.slice(cursor, end).trim();
      if (chunk) {
        chunks.push(chunk);
      }
      cursor = end;
      while (joined[cursor] === ' ') {
        cursor += 1;
      }
    }
    return chunks.length >= targetCount || joined.length < 40
      ? chunks
      : this.splitEvenly(joined, targetCount);
  }

  private splitEvenly(text: string, count: number) {
    const clean = this.cleanText(text, 8000);
    const size = Math.ceil(clean.length / count);
    return Array.from({ length: count }, (_, index) =>
      clean.slice(index * size, (index + 1) * size).trim()
    ).filter(Boolean);
  }

  private hashtags(value: unknown) {
    const items = Array.isArray(value)
      ? value
      : typeof value === 'string'
      ? value.split(/[\s,]+/)
      : [];
    return [
      ...new Set(
        items
          .map((item) => this.cleanText(item, 40))
          .filter(Boolean)
          .map((item) => (item.startsWith('#') ? item : `#${item}`))
      ),
    ].slice(0, 8);
  }

  private duration(value: unknown) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return 45;
    }
    return Math.min(90, Math.max(15, Math.round(number)));
  }

  private platform(value: unknown): SnapsVideoCaptionPlatform {
    return value === 'instagram' || value === 'tiktok' || value === 'youtube'
      ? value
      : 'youtube';
  }

  private captionStyle(value: unknown): SnapsVideoCaptionStyle {
    return value === 'karaoke' || value === 'lower-third' || value === 'subtitle'
      ? value
      : 'karaoke';
  }

  private voiceStyle(value: unknown): SnapsVideoVoiceStyle {
    return value === 'energetic' || value === 'calm' || value === 'news'
      ? value
      : 'clear';
  }

  private defaultVoice(style: SnapsVideoVoiceStyle) {
    return {
      clear: 'Korean clear narrator',
      energetic: 'Korean energetic creator',
      calm: 'Korean calm educator',
      news: 'Korean news explainer',
    }[style];
  }

  private wordsPerMinute(value: unknown, style: SnapsVideoVoiceStyle) {
    const explicit = Number(value);
    if (Number.isFinite(explicit)) {
      return Math.min(190, Math.max(110, Math.round(explicit)));
    }
    return {
      clear: 145,
      energetic: 168,
      calm: 128,
      news: 154,
    }[style];
  }

  private second(value: unknown, fallback: number, min: number, max: number) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  private integer(value: unknown, fallback: number) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : fallback;
  }

  private wordCount(text: string) {
    return text.split(/\s+/).filter(Boolean).length;
  }

  private pad(value: number) {
    return String(value).padStart(2, '0');
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private cleanText(value: unknown, max = 1000) {
    return typeof value === 'string'
      ? value.replace(/\s+/g, ' ').trim().slice(0, max)
      : '';
  }
}
