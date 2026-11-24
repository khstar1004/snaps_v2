import { BadRequestException, Injectable } from '@nestjs/common';
import {
  SnapsTargetPlatform,
  snapsPlatformRules,
  snapsTargetPlatforms,
  snapsContentLength,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { cleanSnapsMultilineText } from '@gitroom/nestjs-libraries/snaps/utils/multiline-text';

export type SnapsAdRelationship =
  | 'none'
  | 'paid'
  | 'gifted'
  | 'affiliate'
  | 'employee'
  | 'own-brand';

export type SnapsAdMediaType = 'text' | 'image' | 'video' | 'live';

export type SnapsAdFindingSeverity = 'blocker' | 'warning' | 'info';

export type SnapsAdFindingRule =
  | 'disclosure-missing'
  | 'disclosure-not-first'
  | 'disclosure-ambiguous'
  | 'disclosure-english-only'
  | 'disclosure-buried-in-hashtags'
  | 'disclosure-video-repeat'
  | 'relationship-signal'
  | 'message-ad-prefix-missing'
  | 'message-opt-out-missing'
  | 'message-sender-missing'
  | 'message-night-send'
  | 'claim-health'
  | 'claim-finance'
  | 'claim-superlative'
  | 'fix-exceeds-limit';

export type SnapsAdGuardStatus = 'pass' | 'review' | 'block';

export type SnapsAdDisclosureGuardRequest = {
  variants?: unknown;
  content?: unknown;
  title?: unknown;
  targetPlatforms?: unknown;
  relationship?: unknown;
  advertiser?: unknown;
  mediaType?: unknown;
  sendAt?: unknown;
  nightConsent?: unknown;
  senderName?: unknown;
};

export type SnapsAdFinding = {
  rule: SnapsAdFindingRule;
  severity: SnapsAdFindingSeverity;
  message: string;
  evidence?: string;
};

export type SnapsAdDisclosureCard = {
  platform: SnapsTargetPlatform;
  label: string;
  title: string;
  content: string;
  visibleWindow: number;
  disclosureFound?: string;
  disclosureIndex: number;
  findings: SnapsAdFinding[];
  status: SnapsAdGuardStatus;
  fixedTitle: string;
  fixedContent: string;
  fixApplied: boolean;
  fixExceedsLimit: boolean;
};

export type SnapsAdDisclosureGuardSummary = {
  product: 'snaps';
  source: 'snaps-ad-disclosure-guard';
  relationship: SnapsAdRelationship;
  advertiser?: string;
  mediaType: SnapsAdMediaType;
  status: SnapsAdGuardStatus;
  totalCards: number;
  blockers: number;
  warnings: number;
  cards: SnapsAdDisclosureCard[];
  checklist: string[];
  references: string[];
  notice: string;
};

type GuardVariant = {
  platform: SnapsTargetPlatform;
  title: string;
  content: string;
};

type GuardContext = {
  relationship: SnapsAdRelationship;
  advertiser?: string;
  mediaType: SnapsAdMediaType;
  sendAt?: Date;
  nightConsent: boolean;
  senderName?: string;
};

const visibleWindows: Record<SnapsTargetPlatform, number> = {
  threads: 180,
  bluesky: 300,
  instagram: 125,
  facebook: 200,
  pinterest: 220,
  youtube: 100,
  tiktok: 100,
  xiaohongshu: 180,
  'naver-blog': 260,
  'naver-cafe': 220,
  'kakao-talk': 120,
  linkedin: 140,
  x: 280,
};

const titledPlatforms = new Set<SnapsTargetPlatform>([
  'naver-blog',
  'naver-cafe',
  'youtube',
  'pinterest',
]);
const videoPlatforms = new Set<SnapsTargetPlatform>(['youtube', 'tiktok']);
const messagePlatforms = new Set<SnapsTargetPlatform>(['kakao-talk']);

// Clear Korean disclosure wording accepted by the KFTC endorsement guideline.
const clearDisclosurePattern =
  /(\[\s*(?:유료\s*)?광고\s*\]|\[\s*협찬\s*\]|#\s*(?:유료)?광고(?![가-힣])|#\s*협찬(?![가-힣])|\(\s*광고\s*\)|유료\s*광고|광고\s*포함|(?:^|[\s(])광고(?:입니다|이며|이고|글|\s*게시물)|협찬(?:을|를)?\s*받|협찬\s*(?:게시물|글|제품|광고)|대가를\s*(?:받|지급)|원고료를?\s*(?:받|지급)|무상으로\s*제공\s*받|무료로\s*제공\s*받|수수료를\s*(?:제공\s*)?받|임직원이\s*작성)/i;

// Terms the guideline treats as unclear when used instead of a clear disclosure.
const ambiguousDisclosurePattern =
  /(체험단|thanks\s*to|thx\s*to|일부\s*협찬|소정의\s*원고료|제품\s*제공|지원\s*받아|서포터즈|앰배서더|collab|@partner)/i;

const englishDisclosurePattern =
  /(#ad\b|#sponsored\b|#paid\b|#partner\b|\bsponsored\b|\bpaid partnership\b|\bad\b:)/i;

const relationshipSignalPattern =
  /(협찬|제공\s*받|원고료|체험단|파트너스|제휴\s*링크|할인\s*코드|쿠폰\s*코드|프로모션\s*코드|추천\s*코드|affiliate|sponsored|#ad\b)/i;

const promotionalSignalPattern =
  /(할인|쿠폰|이벤트|특가|세일|구매|주문|신청|무료\s*체험|혜택|프로모션|%\s*off|오픈\s*기념)/i;

const optOutPattern = /(수신\s*거부|수신\s*차단|채널\s*차단|무료\s*수신거부|080-?\d)/;

const healthClaimPattern =
  /(치료|완치|질병\s*예방|암\s*예방|특효|당뇨|혈압을?\s*낮|면역력\s*(?:강화|증진)|부작용\s*(?:없|제로)|살이\s*빠지는|체지방\s*분해|의사가\s*추천|염증\s*(?:완화|제거)|아토피\s*개선)/;

const financeClaimPattern =
  /(원금\s*보장|수익\s*보장|확정\s*수익|무조건\s*수익|손실\s*(?:없|제로)|100%\s*수익|고수익\s*보장|월\s*\d+\s*(?:만원|%)\s*보장)/;

const superlativePattern = /(국내\s*최초|업계\s*최초|국내\s*최대|업계\s*1위|국내\s*1위|유일한|no\.?\s*1\b|넘버원|최고의)/i;

const references = [
  '공정거래위원회 「추천·보증 등에 관한 표시·광고 심사지침」: https://www.law.go.kr/행정규칙/추천ㆍ보증등에관한표시ㆍ광고심사지침',
  '「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 제50조(영리목적의 광고성 정보 전송 제한): https://www.law.go.kr/법령/정보통신망이용촉진및정보보호등에관한법률/제50조',
  '「표시·광고의 공정화에 관한 법률」(실증 책임): https://www.law.go.kr/법령/표시ㆍ광고의공정화에관한법률',
  'Kakao Business 채널 메시지 운영 가이드: https://kakaobusiness.gitbook.io/main/channel/run/message',
];

@Injectable()
export class SnapsAdDisclosureGuardService {
  check(body?: SnapsAdDisclosureGuardRequest): SnapsAdDisclosureGuardSummary {
    const request = body || {};
    const context: GuardContext = {
      relationship: this.cleanRelationship(request.relationship),
      advertiser: this.cleanLine(request.advertiser, 60) || undefined,
      mediaType: this.cleanMediaType(request.mediaType),
      sendAt: this.cleanDate(request.sendAt),
      nightConsent: request.nightConsent === true || request.nightConsent === 'true',
      senderName: this.cleanLine(request.senderName, 60) || undefined,
    };
    const variants = this.cleanVariants(request.variants);
    const baseVariants = variants.length
      ? variants
      : this.defaultVariants(request);
    if (!baseVariants.length) {
      throw new BadRequestException('variants or content is required for ad disclosure guard.');
    }

    const cards = baseVariants.slice(0, 40).map((variant) => this.toCard(variant, context));
    const blockers = cards.reduce(
      (total, card) => total + card.findings.filter((item) => item.severity === 'blocker').length,
      0
    );
    const warnings = cards.reduce(
      (total, card) => total + card.findings.filter((item) => item.severity === 'warning').length,
      0
    );

    return {
      product: 'snaps',
      source: 'snaps-ad-disclosure-guard',
      relationship: context.relationship,
      advertiser: context.advertiser,
      mediaType: context.mediaType,
      status: blockers ? 'block' : warnings ? 'review' : 'pass',
      totalCards: cards.length,
      blockers,
      warnings,
      cards,
      checklist: this.checklist(context, cards),
      references,
      notice:
        '광고 표시 가드는 운영 체크리스트이며 법률 자문이 아닙니다. 캠페인 계약 조건과 최신 지침을 담당자가 최종 확인하세요.',
    };
  }

  private toCard(variant: GuardVariant, context: GuardContext): SnapsAdDisclosureCard {
    const rule = snapsPlatformRules[variant.platform];
    const visibleWindow = visibleWindows[variant.platform] || 160;
    const findings: SnapsAdFinding[] = [];
    const requiresDisclosure = this.requiresDisclosure(context.relationship);
    const isMessage = messagePlatforms.has(variant.platform);

    const titleMatch = titledPlatforms.has(variant.platform)
      ? variant.title.match(clearDisclosurePattern)
      : null;
    const contentMatch = variant.content.match(clearDisclosurePattern);
    const disclosureFound = titleMatch?.[0] || contentMatch?.[0];
    const disclosureIndex = titleMatch
      ? 0
      : contentMatch?.index !== undefined
        ? contentMatch.index
        : -1;
    const firstLineLength = this.firstLine(variant.content).length;
    const inFirstPart =
      !!titleMatch ||
      (disclosureIndex >= 0 &&
        disclosureIndex <= Math.min(visibleWindow, Math.max(firstLineLength, 40)));

    let needsDisclosureFix = false;
    // Messenger ads are covered by the stricter "(광고)" message rules below.
    if (requiresDisclosure && !isMessage) {
      if (!disclosureFound) {
        const ambiguous = variant.content.match(ambiguousDisclosurePattern);
        const english = variant.content.match(englishDisclosurePattern);
        if (ambiguous) {
          findings.push({
            rule: 'disclosure-ambiguous',
            severity: 'blocker',
            message: `"${ambiguous[0]}" 같은 표현만으로는 경제적 이해관계가 명확하지 않습니다. "광고" 또는 "협찬"을 한글로 명시하세요.`,
            evidence: ambiguous[0],
          });
        } else if (english) {
          findings.push({
            rule: 'disclosure-english-only',
            severity: 'blocker',
            message: `영문 표기("${english[0].trim()}")만 있습니다. 국내 소비자가 이해할 수 있게 한글 "광고"·"협찬" 표기를 함께 넣으세요.`,
            evidence: english[0].trim(),
          });
        } else {
          findings.push({
            rule: 'disclosure-missing',
            severity: 'blocker',
            message: '경제적 이해관계가 있는 게시물인데 광고·협찬 표시가 없습니다.',
          });
        }
        needsDisclosureFix = true;
      } else if (!inFirstPart) {
        findings.push({
          rule: 'disclosure-not-first',
          severity: 'blocker',
          message: `광고 표시가 ${disclosureIndex}자 위치에 있습니다. 제목이나 본문 첫 부분(피드 노출 ${visibleWindow}자 이내, 더보기 전)에 두세요.`,
          evidence: disclosureFound,
        });
        needsDisclosureFix = true;
      }

      if (disclosureFound && this.isBuriedInHashtags(variant.content, disclosureIndex)) {
        findings.push({
          rule: 'disclosure-buried-in-hashtags',
          severity: 'warning',
          message: '광고 표시가 여러 해시태그 사이에 섞여 있어 눈에 띄지 않을 수 있습니다. 해시태그와 분리해 문장으로 표시하세요.',
          evidence: disclosureFound,
        });
      }

      if (videoPlatforms.has(variant.platform) || context.mediaType === 'video') {
        findings.push({
          rule: 'disclosure-video-repeat',
          severity: 'warning',
          message:
            '영상은 설명란 외에 영상 시작과 끝 화면에도 광고·협찬 자막을 넣고, 플랫폼의 유료 프로모션 표시 기능을 함께 켜세요.',
        });
      }
      if (context.mediaType === 'live') {
        findings.push({
          rule: 'disclosure-video-repeat',
          severity: 'warning',
          message: '실시간 방송은 광고 표시를 화면에 고정하거나 일정 간격으로 반복 노출하세요.',
        });
      }
    } else if (context.relationship === 'none' && !isMessage) {
      const signal = `${variant.title}\n${variant.content}`.match(relationshipSignalPattern);
      if (signal) {
        findings.push({
          rule: 'relationship-signal',
          severity: 'warning',
          message: `"${signal[0]}" 표현이 있어 경제적 이해관계가 있을 수 있습니다. 협찬·제휴 여부를 확인하고 해당하면 관계 유형을 지정하세요.`,
          evidence: signal[0],
        });
      }
    }

    const messageFix = isMessage ? this.messageFindings(variant, context, findings) : undefined;
    this.claimFindings(`${variant.title}\n${variant.content}`, findings);

    const label = this.disclosureLabel(context.relationship);
    const sentence = this.disclosureSentence(context, rule.maxLength);
    let fixedTitle = variant.title;
    let fixedContent = variant.content;
    if (needsDisclosureFix && label) {
      if (titledPlatforms.has(variant.platform) && !titleMatch) {
        fixedTitle = `${label} ${variant.title}`.trim();
      }
      fixedContent = `${sentence}\n${variant.content}`;
    }
    if (messageFix) {
      fixedContent = messageFix(fixedContent);
    }
    const fixApplied = fixedContent !== variant.content || fixedTitle !== variant.title;
    const fixedLength = snapsContentLength(variant.platform, fixedContent);
    const fixExceedsLimit = fixApplied && fixedLength > rule.maxLength;
    if (fixExceedsLimit) {
      findings.push({
        rule: 'fix-exceeds-limit',
        severity: 'info',
        message: `표시 문구를 넣으면 ${fixedLength}/${rule.maxLength}자로 길이 제한을 넘습니다. 본문을 줄여 주세요.`,
      });
    }

    const status: SnapsAdGuardStatus = findings.some((item) => item.severity === 'blocker')
      ? 'block'
      : findings.some((item) => item.severity === 'warning')
        ? 'review'
        : 'pass';

    return {
      platform: variant.platform,
      label: rule.label,
      title: variant.title,
      content: variant.content,
      visibleWindow,
      disclosureFound,
      disclosureIndex,
      findings,
      status,
      fixedTitle,
      fixedContent,
      fixApplied,
      fixExceedsLimit,
    };
  }

  private messageFindings(
    variant: GuardVariant,
    context: GuardContext,
    findings: SnapsAdFinding[]
  ): ((content: string) => string) | undefined {
    const text = `${variant.title}\n${variant.content}`;
    const promotional =
      this.requiresDisclosure(context.relationship) ||
      context.relationship === 'own-brand' ||
      promotionalSignalPattern.test(text);
    if (!promotional) {
      return undefined;
    }

    const hasPrefix = /^\s*\(\s*광고\s*\)/.test(variant.content) || /^\s*\(\s*광고\s*\)/.test(variant.title);
    const hasOptOut = optOutPattern.test(variant.content);
    const hasSender =
      !context.senderName || variant.content.includes(context.senderName);

    if (!hasPrefix) {
      findings.push({
        rule: 'message-ad-prefix-missing',
        severity: 'blocker',
        message: '영리목적 광고성 메시지는 시작 부분에 "(광고)"를 표시해야 합니다.',
      });
    }
    if (!hasOptOut) {
      findings.push({
        rule: 'message-opt-out-missing',
        severity: 'blocker',
        message: '광고성 메시지에는 무료 수신거부·채널 차단 방법을 안내해야 합니다.',
      });
    }
    if (!context.senderName) {
      findings.push({
        rule: 'message-sender-missing',
        severity: 'warning',
        message: '전송자 명칭과 연락처를 메시지에 표시할 수 있도록 발신자 이름을 입력하세요.',
      });
    } else if (!hasSender) {
      findings.push({
        rule: 'message-sender-missing',
        severity: 'warning',
        message: `메시지 본문에 전송자 명칭("${context.senderName}")이 보이지 않습니다.`,
      });
    }
    if (context.sendAt && !context.nightConsent && this.isNightInSeoul(context.sendAt)) {
      findings.push({
        rule: 'message-night-send',
        severity: 'blocker',
        message:
          '오후 9시부터 다음 날 오전 8시 사이의 광고성 메시지 전송은 수신자의 별도 사전 동의가 필요합니다. 발송 시간을 옮기거나 야간 수신 동의를 확인하세요.',
        evidence: context.sendAt.toISOString(),
      });
    }

    return (content: string) => {
      let next = content;
      if (!/^\s*\(\s*광고\s*\)/.test(next)) {
        next = `(광고) ${context.senderName ? `${context.senderName} ` : ''}${next}`;
      } else if (context.senderName && !next.includes(context.senderName)) {
        next = next.replace(/^\s*\(\s*광고\s*\)\s*/, `(광고) ${context.senderName} `);
      }
      if (!optOutPattern.test(next)) {
        next = `${next}\n무료 수신거부: 채널 홈 > 채널 차단`;
      }
      return next;
    };
  }

  private claimFindings(text: string, findings: SnapsAdFinding[]) {
    const health = text.match(healthClaimPattern);
    if (health) {
      findings.push({
        rule: 'claim-health',
        severity: 'warning',
        message: `"${health[0]}"은 질병 예방·치료 효능으로 읽힐 수 있어 식품·화장품 광고에서 제한됩니다. 효능 표현을 경험·사용감 중심으로 바꾸세요.`,
        evidence: health[0],
      });
    }
    const finance = text.match(financeClaimPattern);
    if (finance) {
      findings.push({
        rule: 'claim-finance',
        severity: 'warning',
        message: `"${finance[0]}"처럼 수익·원금을 보장하는 표현은 금융 광고 규제 대상입니다. 위험 고지와 함께 표현을 완화하세요.`,
        evidence: finance[0],
      });
    }
    const superlative = text.match(superlativePattern);
    if (superlative) {
      findings.push({
        rule: 'claim-superlative',
        severity: 'info',
        message: `"${superlative[0]}" 같은 최상급 표현은 객관적 근거(조사 기관·기간)를 함께 표기하세요.`,
        evidence: superlative[0],
      });
    }
  }

  private checklist(context: GuardContext, cards: SnapsAdDisclosureCard[]) {
    const items: string[] = [];
    if (this.requiresDisclosure(context.relationship)) {
      items.push('광고·협찬 표시는 한글로, 제목 또는 본문 첫 부분(더보기 전)에 둡니다.');
      items.push('"체험단", "Thanks to", "일부 협찬" 같은 모호한 표현만 쓰지 않습니다.');
      items.push('해시태그 묶음 속에 #광고를 숨기지 말고 문장으로 분리합니다.');
    } else if (context.relationship === 'none') {
      items.push('대가·제품 제공·제휴 수수료가 있으면 관계 유형을 지정해 다시 검사합니다.');
    } else {
      items.push('브랜드 공식 계정 게시물은 추천·보증 표시 대상이 아니어도 광고성 메시지 규정은 적용됩니다.');
    }
    if (cards.some((card) => videoPlatforms.has(card.platform)) || context.mediaType !== 'text') {
      items.push('영상·라이브는 시작과 끝 화면 자막, 플랫폼 유료 프로모션 표시를 함께 사용합니다.');
    }
    if (cards.some((card) => messagePlatforms.has(card.platform))) {
      items.push('카카오톡 광고성 메시지는 "(광고)" 표시, 전송자 정보, 무료 수신거부 방법을 넣습니다.');
      items.push('오후 9시~오전 8시 광고성 메시지는 별도 야간 수신 동의가 있을 때만 보냅니다.');
    }
    items.push('효능·수익 보장·최상급 표현은 근거 자료를 확인한 뒤 게시합니다.');
    return items;
  }

  private disclosureLabel(relationship: SnapsAdRelationship) {
    if (relationship === 'gifted') {
      return '[협찬]';
    }
    if (relationship === 'paid' || relationship === 'affiliate' || relationship === 'employee') {
      return '[광고]';
    }
    return '';
  }

  private disclosureSentence(context: GuardContext, maxLength: number) {
    const label = this.disclosureLabel(context.relationship);
    const advertiser = context.advertiser;
    const short = maxLength <= 500;
    switch (context.relationship) {
      case 'paid':
        return short
          ? `${label} ${advertiser ? `${advertiser} ` : ''}유료 광고`
          : `${label} ${advertiser || '광고주'}로부터 대가를 받아 작성한 게시물입니다.`;
      case 'gifted':
        return short
          ? `${label} ${advertiser ? `${advertiser} ` : ''}제품 협찬`
          : `${label} ${advertiser || '브랜드'}로부터 제품을 무상으로 제공받아 작성한 게시물입니다.`;
      case 'affiliate':
        return short
          ? `${label} 제휴 링크, 구매 시 수수료를 받습니다`
          : `${label} 제휴 마케팅 활동의 일환으로, 구매 시 일정액의 수수료를 제공받습니다.`;
      case 'employee':
        return short
          ? `${label} ${advertiser ? `${advertiser} ` : ''}임직원이 작성`
          : `${label} ${advertiser || '회사'} 임직원이 작성한 게시물입니다.`;
      default:
        return '';
    }
  }

  private requiresDisclosure(relationship: SnapsAdRelationship) {
    return (
      relationship === 'paid' ||
      relationship === 'gifted' ||
      relationship === 'affiliate' ||
      relationship === 'employee'
    );
  }

  private isBuriedInHashtags(content: string, index: number) {
    if (index < 0) {
      return false;
    }
    const window = content.slice(Math.max(0, index - 80), index + 80);
    const hashtags = window.match(/#[^\s#]+/g) || [];
    return hashtags.length >= 4 && content[index] === '#';
  }

  private isNightInSeoul(date: Date) {
    const seoulHour = (date.getUTCHours() + 9) % 24;
    return seoulHour >= 21 || seoulHour < 8;
  }

  private firstLine(content: string) {
    return content.split(/\r?\n/).find((line) => line.trim()) || '';
  }

  private defaultVariants(request: SnapsAdDisclosureGuardRequest): GuardVariant[] {
    const content = cleanSnapsMultilineText(request.content, 8000);
    if (!content) {
      return [];
    }
    const title = this.cleanLine(request.title, 160);
    const platforms = this.cleanPlatforms(request.targetPlatforms);
    return (platforms.length ? platforms : (['instagram'] as SnapsTargetPlatform[])).map(
      (platform) => ({ platform, title, content })
    );
  }

  private cleanVariants(value: unknown): GuardVariant[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return undefined;
        }
        const record = item as Record<string, unknown>;
        const platform = this.cleanPlatform(record.platform);
        const content = cleanSnapsMultilineText(record.content ?? record.caption ?? record.text, 12000);
        if (!platform || !content) {
          return undefined;
        }
        return {
          platform,
          title: this.cleanLine(record.title, 160),
          content,
        };
      })
      .filter((item): item is GuardVariant => !!item);
  }

  private cleanPlatforms(value: unknown): SnapsTargetPlatform[] {
    const list = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,|]/)
        : [];
    return Array.from(
      new Set(
        list
          .map((item) => this.cleanPlatform(item))
          .filter((item): item is SnapsTargetPlatform => !!item)
      )
    );
  }

  private cleanPlatform(value: unknown): SnapsTargetPlatform | undefined {
    const normalized = this.cleanLine(value, 40).toLowerCase();
    return (snapsTargetPlatforms as readonly string[]).includes(normalized)
      ? (normalized as SnapsTargetPlatform)
      : undefined;
  }

  private cleanRelationship(value: unknown): SnapsAdRelationship {
    const normalized = this.cleanLine(value, 40).toLowerCase().replace(/[\s_]+/g, '-');
    const aliases: Record<string, SnapsAdRelationship> = {
      paid: 'paid',
      sponsored: 'paid',
      광고: 'paid',
      gifted: 'gifted',
      gift: 'gifted',
      협찬: 'gifted',
      affiliate: 'affiliate',
      제휴: 'affiliate',
      employee: 'employee',
      임직원: 'employee',
      'own-brand': 'own-brand',
      brand: 'own-brand',
      자사: 'own-brand',
    };
    return aliases[normalized] || 'none';
  }

  private cleanMediaType(value: unknown): SnapsAdMediaType {
    const normalized = this.cleanLine(value, 20).toLowerCase();
    return normalized === 'image' || normalized === 'video' || normalized === 'live'
      ? normalized
      : 'text';
  }

  private cleanDate(value: unknown) {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private cleanLine(value: unknown, maxLength: number) {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return '';
    }
    return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }
}
