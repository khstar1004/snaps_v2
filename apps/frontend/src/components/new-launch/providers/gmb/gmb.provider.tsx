'use client';

import { FC, useCallback, useEffect } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { GmbSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/gmb.settings.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { Select } from '@gitroom/react/form/select';
import { useWatch } from 'react-hook-form';

const topicTypes = [
  {
    label: '일반 업데이트',
    value: 'STANDARD',
  },
  {
    label: '이벤트',
    value: 'EVENT',
  },
  {
    label: '혜택',
    value: 'OFFER',
  },
];

const callToActionTypes = [
  {
    label: '없음',
    value: 'NONE',
  },
  {
    label: '예약',
    value: 'BOOK',
  },
  {
    label: '온라인 주문',
    value: 'ORDER',
  },
  {
    label: '쇼핑',
    value: 'SHOP',
  },
  {
    label: '자세히 보기',
    value: 'LEARN_MORE',
  },
  {
    label: '가입하기',
    value: 'SIGN_UP',
  },
  {
    label: '혜택 받기',
    value: 'GET_OFFER',
  },
  {
    label: '전화',
    value: 'CALL',
  },
];

const GmbSettings: FC = () => {
  const { register, control } = useSettings();
  const topicType = useWatch({ control, name: 'topicType' });
  const callToActionType = useWatch({ control, name: 'callToActionType' });

  return (
    <div className="flex flex-col gap-[10px]">
      <Select
        label="게시물 유형"
        {...register('topicType', {
          value: 'STANDARD',
        })}
      >
        {topicTypes.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>

      <Select
        label="행동 유도 버튼"
        {...register('callToActionType', {
          value: 'NONE',
        })}
      >
        {callToActionTypes.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>

      {callToActionType &&
        callToActionType !== 'NONE' &&
        callToActionType !== 'CALL' && (
          <Input
            label="행동 유도 URL"
            placeholder="https://example.com"
            {...register('callToActionUrl')}
          />
        )}

      {topicType === 'EVENT' && (
        <div className="flex flex-col gap-[10px] mt-[10px] p-[15px] border border-input rounded-[8px]">
          <div className="text-[14px] font-medium mb-[5px]">이벤트 상세</div>
          <Input
            label="이벤트 제목"
            placeholder="이벤트 이름"
            {...register('eventTitle')}
          />
          <div className="grid grid-cols-2 gap-[10px]">
            <Input
              label="시작일"
              type="date"
              {...register('eventStartDate')}
            />
            <Input label="종료일" type="date" {...register('eventEndDate')} />
          </div>
          <div className="grid grid-cols-2 gap-[10px]">
            <Input
              label="시작 시간(선택)"
              type="time"
              {...register('eventStartTime')}
            />
            <Input
              label="종료 시간(선택)"
              type="time"
              {...register('eventEndTime')}
            />
          </div>
        </div>
      )}

      {topicType === 'OFFER' && (
        <div className="flex flex-col gap-[10px] mt-[10px] p-[15px] border border-input rounded-[8px]">
          <div className="text-[14px] font-medium mb-[5px]">혜택 상세</div>
          <Input
            label="쿠폰 코드(선택)"
            placeholder="SAVE20"
            {...register('offerCouponCode')}
          />
          <Input
            label="온라인 사용 URL(선택)"
            placeholder="https://example.com/redeem"
            {...register('offerRedeemUrl')}
          />
          <Input
            label="조건 및 유의사항(선택)"
            placeholder="유효 기간, 사용 조건 등을 입력하세요"
            {...register('offerTerms')}
          />
        </div>
      )}
    </div>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: GmbSettings,
  CustomPreviewComponent: undefined,
  dto: GmbSettingsDto,
  checkValidity: async (items, settings: any) => {
    // GMB posts can have text only, or text with one image
    if ((items?.length ?? 0) > 0 && (items?.[0]?.length ?? 0) > 1) {
      return 'Google 비즈니스 프로필 게시물에는 이미지를 한 장만 첨부할 수 있습니다.';
    }

    // Check for video - GMB doesn't support video in local posts
    if ((items?.length ?? 0) > 0 && (items?.[0]?.length ?? 0) > 0) {
      const media = items?.[0]?.[0];
      if ((media?.path?.indexOf?.('mp4') ?? -1) > -1) {
        return 'Google 비즈니스 프로필 게시물은 동영상 첨부를 지원하지 않습니다.';
      }
    }

    // Event posts require a title
    if (settings?.topicType === 'EVENT' && !settings?.eventTitle) {
      return '이벤트 게시물에는 이벤트 제목이 필요합니다.';
    }

    return true;
  },
  maximumCharacters: 1500,
});
