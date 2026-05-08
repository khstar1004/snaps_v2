'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { PinterestBoard } from '@gitroom/frontend/components/new-launch/providers/pinterest/pinterest.board';
import { PinterestSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/pinterest.dto';
import { Input } from '@gitroom/react/form/input';
import { ColorPicker } from '@gitroom/react/form/color.picker';
import { PinterestPreview } from '@gitroom/frontend/components/new-launch/providers/pinterest/pinterest.preview';
const PinterestSettings: FC = () => {
  const { register, control } = useSettings();
  return (
    <div className="flex flex-col">
      <Input label={'제목'} {...register('title')} />
      <Input label={'링크'} {...register('link')} />
      <PinterestBoard {...register('board')} />
      <ColorPicker
        label="핀 색상 선택"
        name="dominant_color"
        enabled={false}
        canBeCancelled={true}
      />
    </div>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  comments: false,
  SettingsComponent: PinterestSettings,
  CustomPreviewComponent: PinterestPreview,
  dto: PinterestSettingsDto,
  checkValidity: async ([firstItem, ...otherItems] = []) => {
    const isMp4 = firstItem?.find((item) => (item?.path?.indexOf?.('mp4') ?? -1) > -1);
    const isPicture = firstItem?.find(
      (item) => (item?.path?.indexOf?.('mp4') ?? -1) === -1
    );
    if ((firstItem?.length ?? 0) === 0) {
      return '미디어를 최소 한 개 첨부해 주세요.';
    }
    if (isMp4 && firstItem?.length !== 2 && !isPicture) {
      return '동영상을 게시하려면 두 번째 미디어로 커버 이미지를 함께 첨부해 주세요.';
    }
    if (isMp4 && (firstItem?.length ?? 0) > 2) {
      return '동영상 게시물은 동영상과 커버 이미지를 합쳐 최대 2개까지만 첨부할 수 있습니다.';
    }

    if (
      (firstItem?.length ?? 0) > 1 &&
      firstItem?.every((p) => (p?.path?.indexOf?.('mp4') ?? -1) == -1)
    ) {
      const loadAll: Array<{
        width: number;
        height: number;
      }> = (await Promise.all(
        firstItem?.map((p) => {
          return new Promise((resolve, reject) => {
            const url = new Image();
            url.onload = function () {
              // @ts-ignore
              resolve({ width: this.width, height: this.height });
            };
            url.src = p?.path;
          });
        }) ?? []
      )) as any;
      const checkAllTheSameWidthHeight = loadAll?.every((p, i, arr) => {
        return p?.width === arr?.[0]?.width && p?.height === arr?.[0]?.height;
      });
      if (!checkAllTheSameWidthHeight) {
        return '모든 이미지는 너비와 높이가 같아야 합니다.';
      }
    }
    return true;
  },
  maximumCharacters: 500,
});
