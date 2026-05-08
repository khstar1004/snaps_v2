'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { ThreadFinisher } from '@gitroom/frontend/components/new-launch/finisher/thread.finisher';
import { Select } from '@gitroom/react/form/select';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { XDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/x.dto';
import { Input } from '@gitroom/react/form/input';
import { Checkbox } from '@gitroom/react/form/checkbox';

const whoCanReply = [
  {
    label: '모든 사람',
    value: 'everyone',
  },
  {
    label: '내가 팔로우하는 계정',
    value: 'following',
  },
  {
    label: '멘션된 계정',
    value: 'mentionedUsers',
  },
  {
    label: '구독자',
    value: 'subscribers',
  },
  {
    label: '인증된 계정',
    value: 'verified',
  },
];

const SettingsComponent = () => {
  const t = useT();
  const { register, watch, setValue } = useSettings();

  return (
    <>
      <Select
        label={t(
          'label_who_can_reply_to_this_post',
          '이 게시물에 누가 답글을 달 수 있나요?'
        )}
        className="mb-5"
        hideErrors={true}
        {...register('who_can_reply_post', {
          value: 'everyone',
        })}
      >
        {whoCanReply.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>

      <Input
        label={
          '커뮤니티에 게시할 URL(예: https://x.com/i/communities/1493446837214187523)'
        }
        {...register('community')}
      />

      <div className="mt-5 flex flex-col gap-[10px]">
        <Checkbox
          label={t('label_made_with_ai', 'AI로 제작됨')}
          {...register('made_with_ai')}
        />
        <Checkbox
          label={t('label_paid_partnership', '유료 파트너십')}
          {...register('paid_partnership')}
        />
      </div>

      <ThreadFinisher />
    </>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: SettingsComponent,
  CustomPreviewComponent: undefined,
  dto: XDto,
  checkValidity: async (posts, settings, additionalSettings: any) => {
    const premium =
      additionalSettings?.find((p: any) => p?.title === 'Verified')?.value ||
      false;
    // if (posts?.some((p) => (p?.length ?? 0) > 4)) {
    //   return '게시물 하나에는 이미지를 최대 4장까지 첨부할 수 있습니다.';
    // }
    for (const load of posts?.flatMap((p) => p?.flatMap((a) => a?.path)) ?? []) {
      if ((load?.indexOf?.('mp4') ?? -1) > -1) {
        const isValid = await checkVideoDuration(load, premium);
        if (!isValid) {
          return '동영상 길이는 140초 이하여야 합니다.';
        }
      }
    }
    return true;
  },
  maximumCharacters: (settings) => {
    if (settings?.[0]?.value) {
      return 4000;
    }
    return 280;
  },
});
const checkVideoDuration = async (
  url: string,
  isPremium = false
): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = url;
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      // Check if the duration is less than or equal to 140 seconds
      const duration = video.duration;
      if ((!isPremium && duration <= 140) || isPremium) {
        resolve(true); // Video duration is acceptable
      } else {
        resolve(false); // Video duration exceeds 140 seconds
      }
    };
    video.onerror = () => {
      reject(new Error('동영상 메타데이터를 불러오지 못했습니다.'));
    };
  });
};
