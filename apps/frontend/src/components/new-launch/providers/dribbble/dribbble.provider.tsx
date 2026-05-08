'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { DribbbleTeams } from '@gitroom/frontend/components/new-launch/providers/dribbble/dribbble.teams';
import { DribbbleDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/dribbble.dto';
const DribbbleSettings: FC = () => {
  const { register, control } = useSettings();
  return (
    <div className="flex flex-col">
      <Input label={'제목'} {...register('title')} />
      <DribbbleTeams {...register('team')} />
    </div>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: DribbbleSettings,
  CustomPreviewComponent: undefined,
  dto: DribbbleDto,
  checkValidity: async ([firstItem, ...otherItems] = []) => {
    const isMp4 = firstItem?.find((item) => (item?.path?.indexOf?.('mp4') ?? -1) > -1);
    if (firstItem?.length !== 1) {
      return '미디어를 정확히 한 개 첨부해 주세요.';
    }
    if (isMp4) {
      return 'MP4 파일은 지원하지 않습니다.';
    }
    const details = await new Promise<{
      width: number;
      height: number;
    }>((resolve, reject) => {
      const url = new Image();
      url.onload = function () {
        // @ts-ignore
        resolve({ width: this.width, height: this.height });
      };
      url.src = firstItem?.[0]?.path;
    });
    if (
      (details?.width === 400 && details?.height === 300) ||
      (details?.width === 800 && details?.height === 600)
    ) {
      return true;
    }
    return '이미지 크기가 올바르지 않습니다. 400x300 또는 800x600px 이미지를 사용해 주세요.';
  },
  maximumCharacters: 40000,
});
