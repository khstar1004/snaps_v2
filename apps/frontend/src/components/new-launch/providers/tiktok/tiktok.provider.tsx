'use client';

import {
  FC,
  useMemo,
} from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { TikTokDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/tiktok.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Select } from '@gitroom/react/form/select';
import { Checkbox } from '@gitroom/react/form/checkbox';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { Input } from '@gitroom/react/form/input';
import { TiktokPreview } from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.preview';

const TikTokSettings: FC<{
  values?: any;
}> = (props) => {
  const { watch, register } = useSettings();
  const { value } = useIntegration();
  const t = useT();

  const isTitle = useMemo(() => {
    return value?.[0]?.image?.some((p) => (p?.path?.indexOf?.('mp4') ?? -1) === -1);
  }, [value]);

  const disclose = watch('disclose');
  const brand_organic_toggle = watch('brand_organic_toggle');
  const brand_content_toggle = watch('brand_content_toggle');
  const content_posting_method = watch('content_posting_method');
  const isUploadMode = content_posting_method === 'UPLOAD';

  const privacyLevel = [
    {
      value: 'PUBLIC_TO_EVERYONE',
      label: t('public_to_everyone', '모두에게 공개'),
    },
    {
      value: 'MUTUAL_FOLLOW_FRIENDS',
      label: t('mutual_follow_friends', '맞팔 친구'),
    },
    {
      value: 'FOLLOWER_OF_CREATOR',
      label: t('follower_of_creator', '크리에이터의 팔로워'),
    },
    {
      value: 'SELF_ONLY',
      label: t('self_only', '나만 보기'),
    },
  ];
  const contentPostingMethod = [
    {
      value: 'DIRECT_POST',
      label: t(
        'post_content_directly_to_tiktok',
        'TikTok에 바로 게시하기'
      ),
    },
    {
      value: 'UPLOAD',
      label: t(
        'upload_content_to_tiktok_without_posting',
        '게시하지 않고 TikTok에 업로드하기'
      ),
    },
  ];
  const yesNo = [
    {
      value: 'yes',
      label: t('yes', '예'),
    },
    {
      value: 'no',
      label: t('no', '아니오'),
    },
  ];

  return (
    <div className="flex flex-col">
      {/*<CheckTikTokValidity picture={props?.values?.[0]?.image?.[0]?.path} />*/}
      {isTitle && <Input label="제목" {...register('title')} maxLength={89} />}
      <Select
        label={t('label_who_can_see_this_video', '이 영상을 볼 수 있는 사람')}
        disabled={isUploadMode}
        {...register('privacy_level', {
          value: 'PUBLIC_TO_EVERYONE',
        })}
      >
        <option value="">{t('select', '선택')}</option>
        {privacyLevel.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>
      <div className="text-[14px] mt-[10px] mb-[18px] text-balance">
        {t(
          'choose_upload_without_posting_description',
          '게시하지 않고 업로드를 선택하면 TikTok 앱에서 콘텐츠를 검토하고 편집한 뒤 게시할 수 있습니다. TikTok의 내장 편집 도구를 사용해 게시 전 최종 수정을 할 수 있습니다.'
        )}
      </div>
      <Select
        label={t('label_content_posting_method', '콘텐츠 게시 방법')}
        {...register('content_posting_method', {
          value: 'DIRECT_POST',
        })}
      >
        <option value="">{t('select', '선택')}</option>
        {contentPostingMethod.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>
      {isUploadMode && <div className="-mt-[23px] mb-[23px] text-red-600">업로드 후 콘텐츠 스튜디오가 아니라 TikTok 앱 받은 편지함에서 게시 알림을 확인해 주세요.</div>}
      <Select
        label={t('label_auto_add_music', '자동 음악 추가')}
        {...register('autoAddMusic', {
          value: 'no',
        })}
      >
        <option value="">{t('select', '선택')}</option>
        {yesNo.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>
      <div className="text-[14px] mt-[10px] mb-[24px] text-balance">
        {t(
          'this_feature_available_only_for_photos',
          '이 기능은 사진에만 사용할 수 있으며 기본 음악이 추가됩니다. 음악은 나중에 변경할 수 있습니다.'
        )}
      </div>
      <hr className="mb-[15px] border-tableBorder" />
      <div className="text-[14px] mb-[10px]">
        {t('allow_user_to', '사용자에게 허용:')}
      </div>
      <div className="flex gap-[40px]">
        <Checkbox
          label={t('label_comments', '댓글')}
          variant="hollow"
          disabled={isUploadMode}
          {...register('comment', {
            value: true,
          })}
        />
        <Checkbox
          variant="hollow"
          label={t('label_duet', '듀엣')}
          disabled={isUploadMode}
          {...register('duet', {
            value: false,
          })}
        />
        <Checkbox
          label={t('label_stitch', '스티치')}
          variant="hollow"
          disabled={isUploadMode}
          {...register('stitch', {
            value: false,
          })}
        />
      </div>
      <hr className="my-[15px] mb-[25px] border-tableBorder" />
      <div className="flex flex-col gap-[20px]">
        <Checkbox
          label={t('video_made_with_ai', 'AI로 제작된 영상')}
          variant="hollow"
          {...register('video_made_with_ai', {
            value: false,
          })}
        />
        <Checkbox
          variant="hollow"
          label={t('label_disclose_video_content', '영상 내용 공개')}
          disabled={isUploadMode}
          {...register('disclose', {
            value: false,
          })}
        />
        {disclose && (
          <div className="bg-tableBorder p-[10px] mt-[10px] rounded-[10px] flex gap-[20px] items-center">
            <div>
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M22.201 17.6335L14.0026 3.39569C13.7977 3.04687 13.5052 2.75764 13.1541 2.55668C12.803 2.35572 12.4055 2.25 12.001 2.25C11.5965 2.25 11.199 2.35572 10.8479 2.55668C10.4968 2.75764 10.2043 3.04687 9.99944 3.39569L1.80101 17.6335C1.60388 17.9709 1.5 18.3546 1.5 18.7454C1.5 19.1361 1.60388 19.5199 1.80101 19.8572C2.00325 20.2082 2.29523 20.499 2.64697 20.6998C2.99871 20.9006 3.39755 21.0043 3.80257 21.0001H20.1994C20.6041 21.0039 21.0026 20.9001 21.354 20.6993C21.7054 20.4985 21.997 20.2079 22.1991 19.8572C22.3965 19.52 22.5007 19.1364 22.5011 18.7456C22.5014 18.3549 22.3978 17.9711 22.201 17.6335ZM11.251 9.75006C11.251 9.55115 11.33 9.36038 11.4707 9.21973C11.6113 9.07908 11.8021 9.00006 12.001 9.00006C12.1999 9.00006 12.3907 9.07908 12.5313 9.21973C12.672 9.36038 12.751 9.55115 12.751 9.75006V13.5001C12.751 13.699 12.672 13.8897 12.5313 14.0304C12.3907 14.171 12.1999 14.2501 12.001 14.2501C11.8021 14.2501 11.6113 14.171 11.4707 14.0304C11.33 13.8897 11.251 13.699 11.251 13.5001V9.75006ZM12.001 18.0001C11.7785 18.0001 11.561 17.9341 11.376 17.8105C11.191 17.6868 11.0468 17.5111 10.9616 17.3056C10.8765 17.1 10.8542 16.8738 10.8976 16.6556C10.941 16.4374 11.0482 16.2369 11.2055 16.0796C11.3628 15.9222 11.5633 15.8151 11.7815 15.7717C11.9998 15.7283 12.226 15.7505 12.4315 15.8357C12.6371 15.9208 12.8128 16.065 12.9364 16.25C13.06 16.4351 13.126 16.6526 13.126 16.8751C13.126 17.1734 13.0075 17.4596 12.7965 17.6706C12.5855 17.8815 12.2994 18.0001 12.001 18.0001Z"
                  fill="white"
                />
              </svg>
            </div>
            <div>
              {t(
                'your_video_will_be_labeled_promotional',
                '동영상에 "프로모션 콘텐츠" 라벨이 표시됩니다.'
              )}
              <br />
              {t(
                'this_cannot_be_changed_once_posted',
                '게시 후에는 변경할 수 없습니다.'
              )}
            </div>
          </div>
        )}
        <div className="text-[14px] my-[10px] text-balance">
          {t(
            'turn_on_to_disclose_video_promotes',
            '이 동영상이 대가를 받고 상품 또는 서비스를 홍보함을 공개하려면 켜세요. 이 동영상은 본인, 제3자 또는 둘 다를 홍보할 수 있습니다.'
          )}
        </div>
      </div>
      <div className={clsx(!disclose && 'invisible h-0 overflow-hidden', 'mt-[20px]')}>
        <Checkbox
          variant="hollow"
          label={t('label_your_brand', '당신의 브랜드')}
          disabled={isUploadMode}
          {...register('brand_organic_toggle', {
            value: false,
          })}
        />
        <div className="text-balance my-[10px] text-[14px]">
          {t(
            'you_are_promoting_yourself',
            '본인 또는 본인 브랜드를 홍보하고 있습니다.'
          )}
          <br />
          {t(
            'this_video_will_be_classified_brand_organic',
            '이 동영상은 브랜드 오가닉으로 분류됩니다.'
          )}
        </div>
        <Checkbox
          variant="hollow"
          label={t('label_branded_content', '브랜드 콘텐츠')}
          disabled={isUploadMode}
          {...register('brand_content_toggle', {
            value: false,
          })}
        />
        <div className="text-balance my-[10px] text-[14px]">
          {t(
            'you_are_promoting_another_brand',
            '다른 브랜드 또는 제3자를 홍보하고 있습니다.'
          )}
          <br />
          {t(
            'this_video_will_be_classified_branded_content',
            '이 동영상은 브랜드드 콘텐츠로 분류됩니다.'
          )}
        </div>
        {(brand_organic_toggle || brand_content_toggle) && (
          <div className="my-[10px] text-[14px] text-balance">
            {t(
              'by_posting_you_agree_to_tiktoks',
              '게시함으로써 TikTok의 다음 약관에 동의하게 됩니다:'
            )}
            {[
              brand_organic_toggle || brand_content_toggle ? (
                <a
                  target="_blank"
                  className="text-[#B69DEC] hover:underline"
                  href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
                >
                  {t('music_usage_confirmation', '음악 사용 확인')}
                </a>
              ) : undefined,
              brand_content_toggle ? <> {t('and', 'and')} </> : undefined,
              brand_content_toggle ? (
                <a
                  target="_blank"
                  className="text-[#B69DEC] hover:underline"
                  href="https://www.tiktok.com/legal/page/global/bc-policy/en"
                >
                  {t('branded_content_policy', '브랜드 콘텐츠 정책')}
                </a>
              ) : undefined,
            ].filter((f) => f)}
          </div>
        )}
      </div>
    </div>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: TikTokSettings,
  comments: false,
  CustomPreviewComponent: TiktokPreview,
  dto: TikTokDto,
  checkValidity: async (items) => {
    const [firstItems] = items ?? [];
    if ((firstItems?.length ?? 0) === 0) {
      return '동영상 또는 이미지를 선택해 주세요.';
    }
    if (
      (firstItems?.length ?? 0) > 1 &&
      firstItems?.some((p) => (p?.path?.indexOf?.('mp4') ?? -1) > -1)
    ) {
      return '여러 항목을 선택할 때는 이미지만 지원됩니다.';
    } else if (
      firstItems?.length !== 1 &&
      (firstItems?.[0]?.path?.indexOf?.('mp4') ?? -1) > -1
    ) {
      return '미디어를 한 개 첨부해 주세요.';
    }
    return true;
  },
  maximumCharacters: 2000,
});
