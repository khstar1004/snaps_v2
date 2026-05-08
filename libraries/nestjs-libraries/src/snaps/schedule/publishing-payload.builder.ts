import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { SnapsScheduleVariantsRequestDto } from '@gitroom/nestjs-libraries/snaps/dto/transform-request.dto';
import { SnapsVariant } from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';

export type SnapsPublishingPayloadBuildInput = {
  variants?: SnapsVariant[];
  integrations?: SnapsScheduleVariantsRequestDto['integrations'];
  publishDate?: string;
  scheduleType?: 'draft' | 'schedule';
};

type PreparedSchedulableVariant = {
  variant: SnapsVariant;
  integrationId: string;
  settings: Record<string, unknown>;
};

export function buildSnapsPublishingPayload(input: SnapsPublishingPayloadBuildInput = {}) {
  const variants = Array.isArray(input.variants) ? input.variants : [];
  const integrations = Array.isArray(input.integrations) ? input.integrations : [];
  const integrationMap = new Map(
    integrations
      .filter((integration) => integration?.platform && integration?.integrationId)
      .map((integration) => [
        integration.platform,
        integration.integrationId,
      ])
  );
  const warnings: string[] = [];
  const schedulable = variants
    .filter(
      (variant) =>
        variant?.publishMode === 'schedule' &&
        integrationMap.has(variant.platform)
    )
    .map((variant) =>
      prepareSchedulableVariant(variant, integrationMap.get(variant.platform)!, warnings)
    )
    .filter((variant): variant is PreparedSchedulableVariant => !!variant);

  if (!schedulable.length) {
    return {
      variants,
      schedulable: [],
      payload: undefined,
      warnings: [
        ...warnings,
        warnings.length
          ? 'No valid snaps variants remained after provider settings validation.'
          : 'No matching connected snaps integrations were supplied for scheduling.',
      ],
    };
  }

  const type = input.scheduleType === 'schedule' ? 'schedule' : 'draft';
  const publishDate = cleanPublishDate(input.publishDate);
  if (type === 'schedule' && !publishDate) {
    return {
      variants,
      schedulable: schedulable.map(({ variant }) => variant),
      payload: undefined,
      warnings: [
        ...warnings,
        'publishDate is required when scheduleType is schedule.',
      ],
    };
  }

  const date =
    publishDate || new Date(Date.now() + 60 * 60 * 1000).toISOString();
  return {
    variants,
    schedulable: schedulable.map(({ variant }) => variant),
    warnings,
    payload: {
      type,
      date,
      shortLink: false,
      order: '',
      tags: [] as Array<{ value: string; label: string }>,
      posts: schedulable.map(({ variant, integrationId, settings }) => ({
        group: makeId(10),
        integration: {
          id: integrationId,
        },
        settings,
        value: [
          {
            id: makeId(10),
            content: variant.content,
            image: variant.media || [],
            delay: 0,
          },
        ],
      })),
    },
  };
}

function cleanPublishDate(value?: string) {
  if (!value || Number.isNaN(new Date(value).getTime())) {
    return '';
  }
  return value;
}

function prepareSchedulableVariant(
  variant: SnapsVariant,
  integrationId: string,
  warnings: string[]
): PreparedSchedulableVariant | undefined {
  if (variant.platform !== 'naver-cafe') {
    return {
      variant,
      integrationId,
      settings: variant.settings || {},
    };
  }

  const settings = variant.settings || {};
  const clubId = String(settings.clubId || '').trim();
  const menuId = String(settings.menuId || '').trim();
  if (!clubId || !menuId) {
    warnings.push(
      'Naver Cafe scheduling requires clubId and menuId settings. The Naver Cafe variant was skipped.'
    );
    return undefined;
  }

  const subject =
    String(settings.subject || variant.title || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) ||
    variant.content.replace(/\s+/g, ' ').trim().slice(0, 80) ||
    'snaps 게시글';

  return {
    variant,
    integrationId,
    settings: {
      ...settings,
      __type: 'naver-cafe',
      clubId,
      menuId,
      subject: subject.length >= 2 ? subject : 'snaps 게시글',
    },
  };
}
