'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { FC } from 'react';
import { Select } from '@gitroom/react/form/select';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { InstagramDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/instagram.dto';
import { InstagramCollaboratorsTags } from '@gitroom/frontend/components/new-launch/providers/instagram/instagram.tags';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { InstagramPreview } from '@gitroom/frontend/components/new-launch/providers/instagram/instagram.preview';
const postType = [
  {
    value: 'post',
    label: '게시물 / 릴스',
  },
  {
    value: 'story',
    label: '스토리',
  },
];

const graduationStrategies = [
  {
    value: 'MANUAL',
    label: '수동',
  },
  {
    value: 'SS_PERFORMANCE',
    label: '자동(성과 기준)',
  },
];
const InstagramCollaborators: FC<{
  values?: any;
}> = (props) => {
  const t = useT();
  const { watch, register, formState, control } = useSettings();
  const postCurrentType = watch('post_type');
  const isTrialReel = watch('is_trial_reel');
  return (
    <>
      <Select
        label="게시물 유형"
        {...register('post_type', {
          value: 'post',
        })}
      >
        <option value="">{t('select_post_type', '게시물 유형 선택...')}</option>
        {postType.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>

      {postCurrentType !== 'story' && (
        <InstagramCollaboratorsTags
          label="협업자(최대 3명) - 비공개 계정은 제외"
          {...register('collaborators', {
            value: [],
          })}
        />
      )}

      {postCurrentType === 'post' && (
        <div className="mt-[18px] flex flex-col gap-[18px]">
          <Checkbox
            {...register('is_trial_reel', {
              value: false,
            })}
            label={t('trial_reel', '트라이얼 릴스(팔로워가 아닌 사용자에게 먼저 노출)')}
          />

          {isTrialReel && (
            <Select
              label="전환 방식"
              {...register('graduation_strategy', {
                value: 'MANUAL',
              })}
            >
              {graduationStrategies.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}
    </>
  );
};
export default withProvider<InstagramDto>({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: InstagramCollaborators,
  CustomPreviewComponent: InstagramPreview,
  dto: InstagramDto,
  checkValidity: async ([firstPost, ...otherPosts] = [], settings) => {
    if (!firstPost?.length) {
      return '미디어를 최소 한 개 첨부해 주세요.';
    }
    if (settings?.is_trial_reel) {
      if ((firstPost?.length ?? 0) > 1) {
        return '트라이얼 릴스에는 동영상을 한 개만 첨부할 수 있습니다.';
      }
      const hasVideo = firstPost?.some(
        (f) => (f?.path?.indexOf?.('mp4') ?? -1) > -1
      );
      if (!hasVideo) {
        return '트라이얼 릴스는 동영상이어야 합니다.';
      }
    }
    const checkVideosLength = await Promise.all(
      firstPost
        ?.filter((f) => (f?.path?.indexOf?.('mp4') ?? -1) > -1)
        ?.flatMap((p) => p?.path)
        ?.map((p) => {
          return new Promise<number>((res) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = p;
            video.addEventListener('loadedmetadata', () => {
              res(video.duration);
            });
          });
        }) ?? []
    );
    for (const video of checkVideosLength) {
      if (video > 60 && settings?.post_type === 'story') {
        return '스토리는 최대 60초까지만 게시할 수 있습니다.';
      }
      if (video > 180 && settings?.post_type === 'post') {
        return '릴스는 최대 180초까지만 게시할 수 있습니다.';
      }
    }
    return true;
  },
  maximumCharacters: 2200,
  comments: 'no-media'
});
