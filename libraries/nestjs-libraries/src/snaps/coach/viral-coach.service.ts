import { BadRequestException, Injectable } from '@nestjs/common';
import {
  SnapsTargetPlatform,
  snapsPlatformRules,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';

export type SnapsViralCoachGrade =
  | 'excellent'
  | 'ready'
  | 'needs-work'
  | 'rewrite';

export type SnapsViralCoachCategoryId =
  | 'opening-hook'
  | 'pain-benefit'
  | 'silent-clarity'
  | 'information-density'
  | 'emotional-shareability'
  | 'hashtag-strategy';

export type SnapsViralCoachRequest = {
  platform?: unknown;
  title?: unknown;
  content?: unknown;
  sourceText?: unknown;
  script?: unknown;
  visualDescription?: unknown;
  hashtags?: unknown;
  targetAudience?: unknown;
  durationSeconds?: unknown;
};

export type SnapsViralCoachCategory = {
  id: SnapsViralCoachCategoryId;
  label: string;
  score: number;
  maxScore: number;
  status: 'strong' | 'ok' | 'weak';
  feedback: string;
  checks: string[];
};

export type SnapsViralCoachScorecard = {
  product: 'snaps';
  source: 'snaps-viral-ai-coach';
  platform: SnapsTargetPlatform;
  platformLabel: string;
  score: number;
  grade: SnapsViralCoachGrade;
  summary: string;
  categories: SnapsViralCoachCategory[];
  recommendations: string[];
  suggestedHooks: string[];
  hashtagPlan: {
    broad: string[];
    niche: string[];
    final: string[];
    limit: number;
  };
  rewrite: {
    openingLine: string;
    caption: string;
  };
  warnings: string[];
};

@Injectable()
export class SnapsViralCoachService {
  score(body: SnapsViralCoachRequest = {}): SnapsViralCoachScorecard {
    const platform = this.normalizePlatform(body.platform);
    const rule = snapsPlatformRules[platform];
    const title = this.cleanText(body.title, 120);
    const content = this.cleanText(
      body.content || body.script || body.sourceText,
      5000
    );
    const sourceText = this.cleanText(body.sourceText, 5000);
    const visualDescription = this.cleanText(body.visualDescription, 1200);
    const targetAudience = this.cleanText(body.targetAudience, 120);
    const durationSeconds = this.normalizeNumber(body.durationSeconds, 0);

    if (content.length < 10) {
      throw new BadRequestException(
        'content, script, or sourceText is required for viral coach scoring.'
      );
    }

    const hashtags = this.normalizeHashtags(body.hashtags);
    const topic = this.extractTopic(title || sourceText || content);
    const openingLine = this.firstMeaningfulLine(content);
    const categoryInputs = {
      platform,
      title,
      content,
      sourceText,
      visualDescription,
      hashtags,
      topic,
      openingLine,
      targetAudience,
      durationSeconds,
    };
    const categories = [
      this.scoreOpeningHook(categoryInputs),
      this.scorePainBenefit(categoryInputs),
      this.scoreSilentClarity(categoryInputs),
      this.scoreInformationDensity(categoryInputs),
      this.scoreEmotionalShareability(categoryInputs),
      this.scoreHashtagStrategy(categoryInputs),
    ];
    const score = Math.round(
      categories.reduce((total, item) => total + item.score, 0) /
        categories.length
    );
    const grade = this.grade(score);
    const hashtagPlan = this.buildHashtagPlan(platform, topic, hashtags);
    const suggestedHooks = this.buildHooks(topic, platform, targetAudience);
    const recommendations = this.buildRecommendations(categories, platform);
    const rewriteOpening = suggestedHooks[0] || openingLine || `${topic}, 이렇게 보면 달라집니다.`;
    const rewrite = {
      openingLine: rewriteOpening,
      caption: this.compactCaption(rewriteOpening, content, hashtagPlan.final),
    };

    return {
      product: 'snaps',
      source: 'snaps-viral-ai-coach',
      platform,
      platformLabel: rule.label,
      score,
      grade,
      summary: this.summary(score, platform, categories),
      categories,
      recommendations,
      suggestedHooks,
      hashtagPlan,
      rewrite,
      warnings: this.buildWarnings(platform, hashtags, durationSeconds),
    };
  }

  private scoreOpeningHook(input: CoachInput): SnapsViralCoachCategory {
    const line = input.openingLine;
    const checks: string[] = [];
    let score = 35;

    if (line.length >= 8 && line.length <= 90) {
      score += 18;
      checks.push('첫 줄이 모바일에서 바로 읽히는 길이입니다.');
    } else {
      checks.push('첫 줄은 8-90자 안에서 더 또렷하게 줄이세요.');
    }
    if (/[0-9]|[?？]|왜|진짜|실수|전에는|이렇게|몰랐|줄였|늘렸/.test(line)) {
      score += 18;
      checks.push('숫자, 질문, 대비, 결과 중 하나가 보입니다.');
    } else {
      checks.push('숫자, 질문, 대비, 결과를 첫 줄에 넣으면 정지가 더 쉽습니다.');
    }
    if (!/안녕하세요|오늘은|이번에는|소개합니다|알아보겠습니다/.test(line)) {
      score += 14;
      checks.push('일반적인 인사말로 시작하지 않습니다.');
    }
    if (/\b(save|share|mistake|secret|simple)\b/i.test(line)) {
      score += 8;
      checks.push('영문 숏폼 훅 신호가 포함되어 있습니다.');
    }

    return this.category(
      'opening-hook',
      '오프닝 훅',
      score,
      checks,
      score >= 72
        ? '초반 스크롤 정지 신호가 충분합니다.'
        : '첫 1-2초에 문제, 숫자, 반전을 더 강하게 보여주세요.'
    );
  }

  private scorePainBenefit(input: CoachInput): SnapsViralCoachCategory {
    const text = input.content;
    const checks: string[] = [];
    let score = 35;
    const hasPain = /문제|고민|막힘|실수|손해|시간|비용|귀찮|어렵|느림|놓치|스크롤/.test(text);
    const hasBenefit = /해결|줄이|늘리|빠르|저장|공유|매출|전환|성장|자동화|효율|이득/.test(text);

    if (hasPain) {
      score += 22;
      checks.push('시청자가 겪는 문제나 비용이 보입니다.');
    } else {
      checks.push('시청자 고통이나 손실을 더 직접적으로 쓰세요.');
    }
    if (hasBenefit) {
      score += 24;
      checks.push('끝까지 봐야 할 보상이 보입니다.');
    } else {
      checks.push('끝까지 봤을 때 얻는 결과를 명확히 적으세요.');
    }
    if (input.targetAudience) {
      score += 8;
      checks.push(`대상 독자/시청자: ${input.targetAudience}`);
    }

    return this.category(
      'pain-benefit',
      '문제/효익',
      score,
      checks,
      hasPain && hasBenefit
        ? '왜 계속 봐야 하는지 설명됩니다.'
        : '문제와 효익 중 하나가 약해서 retention 명분이 흐립니다.'
    );
  }

  private scoreSilentClarity(input: CoachInput): SnapsViralCoachCategory {
    const checks: string[] = [];
    let score = 40;
    const hasVisual = input.visualDescription.length >= 12;
    const hasStructure = /\n|1\.|2\.|3\.|첫째|둘째|셋째|체크리스트|단계|장면|컷/.test(
      input.content
    );
    const videoLike = ['instagram', 'youtube', 'tiktok'].includes(input.platform);

    if (hasVisual) {
      score += 28;
      checks.push('무음 상태에서도 보일 장면 설명이 있습니다.');
    } else if (!videoLike) {
      score += 12;
      checks.push('텍스트 중심 채널이라 무음 장면 리스크는 낮습니다.');
    } else {
      checks.push('릴스/쇼츠/틱톡은 화면 자막 또는 장면 설명이 필요합니다.');
    }
    if (hasStructure) {
      score += 20;
      checks.push('단계, 리스트, 컷 같은 시각 구조가 보입니다.');
    }

    return this.category(
      'silent-clarity',
      '무음 이해도',
      score,
      checks,
      score >= 70
        ? '소리 없이 봐도 핵심을 따라갈 가능성이 높습니다.'
        : '첫 화면 자막과 장면 전환을 더 구체화하세요.'
    );
  }

  private scoreInformationDensity(input: CoachInput): SnapsViralCoachCategory {
    const checks: string[] = [];
    let score = 45;
    const words = input.content.split(/\s+/).filter(Boolean).length;
    const lines = input.content.split(/\n+/).filter((line) => line.trim()).length;
    const duration = input.durationSeconds || 30;
    const wordsPerSecond = duration ? words / duration : 0;

    if (lines >= 3 || /1\.|2\.|3\.|핵심|요약|체크/.test(input.content)) {
      score += 18;
      checks.push('정보가 한 덩어리가 아니라 스캔 가능한 단위로 나뉩니다.');
    }
    if (words >= 25 && words <= 180) {
      score += 18;
      checks.push('초안 정보량이 너무 빈약하거나 과밀하지 않습니다.');
    } else {
      checks.push('정보량이 너무 적거나 많습니다. 하나의 메시지로 압축하세요.');
    }
    if (!duration || wordsPerSecond <= 3.8) {
      score += 10;
      checks.push('예상 낭독 밀도가 과하지 않습니다.');
    } else {
      checks.push('숏폼 낭독 밀도가 높습니다. 덜 중요한 문장을 자르세요.');
    }

    return this.category(
      'information-density',
      '정보 밀도',
      score,
      checks,
      score >= 70
        ? '훅 이후 정보 흐름이 유지될 가능성이 높습니다.'
        : '훅 다음 5-10초에 핵심 정보만 남기세요.'
    );
  }

  private scoreEmotionalShareability(input: CoachInput): SnapsViralCoachCategory {
    const checks: string[] = [];
    let score = 40;
    const text = input.content;
    if (/놀라|충격|답답|아깝|쉽게|현실|진짜|반전|웃기|공감|저장|공유/.test(text)) {
      score += 24;
      checks.push('감정 또는 공유 이유가 보입니다.');
    } else {
      checks.push('공감, 놀라움, 저장 이유 중 하나를 더 뚜렷하게 만드세요.');
    }
    if (/댓글|저장|공유|DM|상담|링크|답글|어떻게 생각/.test(text)) {
      score += 18;
      checks.push('행동 유도 문장이 포함되어 있습니다.');
    }
    if (input.title || input.topic) {
      score += 8;
      checks.push('제목/주제가 공유 맥락을 보강합니다.');
    }

    return this.category(
      'emotional-shareability',
      '감정/공유성',
      score,
      checks,
      score >= 70
        ? '저장, 공유, 댓글을 유도할 정서적 이유가 있습니다.'
        : '시청자가 누구에게 공유할지 떠오르는 문장을 추가하세요.'
    );
  }

  private scoreHashtagStrategy(input: CoachInput): SnapsViralCoachCategory {
    const rule = snapsPlatformRules[input.platform];
    const limit = rule.hashtagLimit || 5;
    const checks: string[] = [];
    let score = 45;

    if (!input.hashtags.length && ['threads', 'x', 'linkedin'].includes(input.platform)) {
      score += 18;
      checks.push('해시태그가 약한 채널에서 태그 과잉을 피했습니다.');
    } else if (input.hashtags.length > 0 && input.hashtags.length <= limit) {
      score += 24;
      checks.push(`태그 수가 채널 제한(${limit}개) 안에 있습니다.`);
    } else if (input.hashtags.length > limit) {
      checks.push(`태그가 ${limit}개를 넘습니다. 발견용 핵심 태그만 남기세요.`);
    } else {
      checks.push('발견용 태그가 없습니다. broad 3개, niche 2개 기준으로 보강하세요.');
    }
    if (input.hashtags.some((tag) => tag.length >= 4 && tag.length <= 18)) {
      score += 14;
      checks.push('너무 일반적이지 않은 태그가 포함되어 있습니다.');
    }

    return this.category(
      'hashtag-strategy',
      '해시태그 전략',
      score,
      checks,
      score >= 70
        ? '발견용 태그 구성이 과하지 않습니다.'
        : '넓은 태그와 좁은 태그를 섞어 5개 이하로 정리하세요.'
    );
  }

  private buildRecommendations(
    categories: SnapsViralCoachCategory[],
    platform: SnapsTargetPlatform
  ) {
    const weakest = [...categories].sort((a, b) => a.score - b.score).slice(0, 3);
    const platformTip =
      platform === 'tiktok' || platform === 'youtube'
        ? '첫 3초 안에 결과 장면, 큰 자막, 문제 문장을 동시에 보여주세요.'
        : platform === 'instagram'
          ? '첫 줄은 저장 이유, 마지막 줄은 저장/댓글 CTA로 분리하세요.'
          : '첫 문장은 주장 하나만 남기고 댓글을 부르는 질문으로 마무리하세요.';
    return [
      ...weakest.map((item) => `${item.label}: ${item.feedback}`),
      platformTip,
    ];
  }

  private buildHooks(topic: string, platform: SnapsTargetPlatform, audience?: string) {
    const who = audience || '콘텐츠 만드는 사람';
    const channel =
      platform === 'youtube'
        ? '쇼츠'
        : platform === 'tiktok'
          ? '틱톡'
          : snapsPlatformRules[platform].label;
    return [
      `${topic}, 대부분 여기서 망합니다.`,
      `${who}이 ${topic}에서 제일 먼저 고쳐야 할 것`,
      `이 10초만 바꾸면 ${channel} 반응이 달라집니다.`,
      `${topic}을 아직 이렇게 하고 있다면 손해입니다.`,
      `저장해두세요. ${topic} 체크리스트입니다.`,
      `${topic}을 빠르게 키운 팀은 이 순서로 했습니다.`,
      `조회수보다 먼저 봐야 할 ${topic} 신호`,
      `${topic} 초안에서 바로 잘라야 할 문장 3개`,
      `이 장면 하나가 ${topic} 성과를 바꿉니다.`,
      `${topic}, 어렵게 말하지 말고 이렇게 시작하세요.`,
    ];
  }

  private buildHashtagPlan(
    platform: SnapsTargetPlatform,
    topic: string,
    provided: string[]
  ) {
    const rule = snapsPlatformRules[platform];
    const limit = rule.hashtagLimit || 5;
    const topicTag = this.toHashTag(topic);
    const broad = [
      ...rule.defaultHashtags,
      '#콘텐츠',
      '#마케팅',
      '#AI',
    ].filter(Boolean);
    const niche = [topicTag, '#콘텐츠자동화', '#SNS운영'].filter(Boolean);
    const final = this.uniqueHashtags([
      ...provided,
      ...broad.slice(0, 3),
      ...niche.slice(0, 2),
    ]).slice(0, limit);
    return {
      broad: this.uniqueHashtags(broad).slice(0, 3),
      niche: this.uniqueHashtags(niche).slice(0, 2),
      final,
      limit,
    };
  }

  private buildWarnings(
    platform: SnapsTargetPlatform,
    hashtags: string[],
    durationSeconds: number
  ) {
    const warnings: string[] = [];
    const limit = snapsPlatformRules[platform].hashtagLimit || 5;
    if (hashtags.length > limit) {
      warnings.push(`${snapsPlatformRules[platform].label} 해시태그는 ${limit}개 이하로 줄이세요.`);
    }
    if (durationSeconds > 0 && durationSeconds < 15) {
      warnings.push('15초 미만 영상은 훅과 한 가지 메시지만 남기는 편이 안전합니다.');
    }
    return warnings;
  }

  private compactCaption(openingLine: string, content: string, hashtags: string[]) {
    const body = content
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line, index) => index > 0 || line !== openingLine)
      .slice(0, 4)
      .join('\n\n');
    return [openingLine, body, hashtags.join(' ')]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 1800);
  }

  private summary(
    score: number,
    platform: SnapsTargetPlatform,
    categories: SnapsViralCoachCategory[]
  ) {
    const weakest = [...categories].sort((a, b) => a.score - b.score)[0];
    if (score >= 85) {
      return `${snapsPlatformRules[platform].label}에 바로 테스트할 만한 강한 초안입니다.`;
    }
    if (score >= 70) {
      return `${weakest.label}만 보강하면 게시 전 품질 기준을 통과할 가능성이 높습니다.`;
    }
    if (score >= 55) {
      return `${weakest.label}이 약합니다. 훅과 문제/효익을 먼저 다시 쓰세요.`;
    }
    return '초반 훅, 시청 보상, 장면 이해도를 다시 설계하는 편이 안전합니다.';
  }

  private category(
    id: SnapsViralCoachCategoryId,
    label: string,
    rawScore: number,
    checks: string[],
    feedback: string
  ): SnapsViralCoachCategory {
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));
    return {
      id,
      label,
      score,
      maxScore: 100,
      status: score >= 75 ? 'strong' : score >= 60 ? 'ok' : 'weak',
      feedback,
      checks,
    };
  }

  private grade(score: number): SnapsViralCoachGrade {
    if (score >= 85) {
      return 'excellent';
    }
    if (score >= 70) {
      return 'ready';
    }
    if (score >= 55) {
      return 'needs-work';
    }
    return 'rewrite';
  }

  private normalizePlatform(value: unknown): SnapsTargetPlatform {
    return snapsTargetPlatforms.includes(value as SnapsTargetPlatform)
      ? (value as SnapsTargetPlatform)
      : 'instagram';
  }

  private normalizeNumber(value: unknown, fallback: number) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  private normalizeHashtags(value: unknown) {
    if (Array.isArray(value)) {
      return this.uniqueHashtags(
        value.map((item) => this.toHashTag(String(item || ''))).filter(Boolean)
      );
    }
    if (typeof value === 'string') {
      return this.uniqueHashtags(
        value
          .split(/[\s,|]+/)
          .map((item) => this.toHashTag(item))
          .filter(Boolean)
      );
    }
    return [];
  }

  private uniqueHashtags(values: string[]) {
    return [...new Set(values.map((item) => this.toHashTag(item)).filter(Boolean))];
  }

  private toHashTag(value: string) {
    const clean = value
      .replace(/^#+/, '')
      .replace(/[^\p{L}\p{N}_가-힣-]/gu, '')
      .replace(/-+/g, '')
      .slice(0, 24);
    return clean ? `#${clean}` : '';
  }

  private firstMeaningfulLine(content: string) {
    return (
      content
        .split(/\n+/)
        .map((line) => line.trim())
        .find(Boolean) || ''
    ).slice(0, 160);
  }

  private extractTopic(text: string) {
    const clean = text
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[^\p{L}\p{N}\s가-힣-]/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 2)
      .slice(0, 4)
      .join(' ');
    return clean || '이번 콘텐츠';
  }

  private cleanText(value: unknown, maxLength: number) {
    return typeof value === 'string'
      ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
      : '';
  }
}

type CoachInput = {
  platform: SnapsTargetPlatform;
  title: string;
  content: string;
  sourceText: string;
  visualDescription: string;
  hashtags: string[];
  topic: string;
  openingLine: string;
  targetAudience: string;
  durationSeconds: number;
};
