'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { Input } from '@gitroom/react/form/input';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { LinkedinDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/linkedin.dto';
import { LinkedinPreview } from '@gitroom/frontend/components/new-launch/providers/linkedin/linkedin.preview';

const LinkedInSettings = () => {
  const t = useT();
  const { watch, register, formState, control } = useSettings();
  const isCarousel = watch('post_as_images_carousel');

  return (
    <div className="mb-[20px]">
      <Checkbox
        variant="hollow"
        label={t('post_as_images_carousel', '이미지 캐러셀로 게시')}
        {...register('post_as_images_carousel', {
          value: false,
        })}
      />
      {isCarousel && (
        <div className="mt-[10px]">
          <Input
            label={t('carousel_name', '캐러셀 슬라이드 이름')}
            placeholder="slides"
            {...register('carousel_name')}
          />
        </div>
      )}
    </div>
  );
};
export default withProvider<LinkedinDto>({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: LinkedInSettings,
  CustomPreviewComponent: LinkedinPreview,
  dto: LinkedinDto,
  checkValidity: async (posts, vals) => {
    const [firstPost, ...restPosts] = posts ?? [];

    if (
      vals?.post_as_images_carousel &&
      ((firstPost?.length ?? 0) < 2 ||
        firstPost?.some((p) => (p?.path?.indexOf?.('mp4') ?? -1) > -1))
    ) {
      return '캐러셀은 동영상 없이 이미지 2장 이상으로만 만들 수 있습니다.';
    }

    if (
      (firstPost?.length ?? 0) > 1 &&
      firstPost?.some((p) => (p?.path?.indexOf?.('mp4') ?? -1) > -1)
    ) {
      return '동영상을 선택한 경우 미디어는 최대 1개만 첨부할 수 있습니다.';
    }
    if (restPosts?.some((p) => (p?.length ?? 0) > 0)) {
      return '댓글에는 텍스트만 입력할 수 있습니다.';
    }
    return true;
  },
  maximumCharacters: 3000,
});
