'use client';

import { FC, useCallback, useState } from 'react';
import clsx from 'clsx';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
const useFaqList = () => {
  const user = useUser();
  const t = useT();
  return [
    ...(user?.allowTrial
      ? [
          {
            title: t(
              'faq_am_i_going_to_be_charged_by_postiz',
              'snaps에서 바로 결제되나요?'
            ),
            description: t(
              'faq_to_confirm_credit_card_information_postiz_will_hold',
              '카드 확인을 위해 $2가 임시 승인된 뒤 즉시 해제됩니다. 구독은 설정에서 언제든 직접 취소할 수 있습니다.'
            ),
          },
        ]
      : []),
    {
      title: t(
        'faq_can_i_trust_postiz_gitroom',
        'snaps를 신뢰해도 되나요?'
      ),
      description: t(
        'faq_postiz_gitroom_is_proudly_open_source',
        'snaps는 자체 호스팅 가능한 예약 발행 기반 위에 한국어 우선 AI 콘텐츠 워크플로를 더한 제품입니다. 연결 채널, 데이터, 모델 엔드포인트를 직접 통제할 수 있습니다.'
      ),
    },
    {
      title: t('faq_what_are_channels', '채널이란 무엇인가요?'),
      description: t(
        'faq_postiz_gitroom_allows_you_to_schedule_posts',
        `snaps에서는 여러 채널에 맞춰 게시물을 변환하고 예약할 수 있습니다.
채널은 게시물을 발행하거나 예약하는 플랫폼입니다.
예를 들어 X, Facebook, Instagram, TikTok, YouTube, Linkedin, Threads, 네이버 카페에 예약 발행할 수 있고 네이버 블로그는 보조 워크플로로 관리할 수 있습니다.`
      ),
    },
    {
      title: t('faq_what_are_team_members', '팀 멤버란 무엇인가요?'),
      description: t(
        'faq_if_you_have_a_team_with_multiple_members',
        '여러 명이 함께 운영한다면 워크스페이스에 팀원을 초대해 게시물을 함께 편집하고 각자의 채널을 연결할 수 있습니다.'
      ),
    },
  ];
};
export const FAQSection: FC<{
  title: string;
  description: string;
}> = (props) => {
  const { title, description } = props;
  const [show, setShow] = useState(false);
  const changeShow = useCallback(() => {
    setShow(!show);
  }, [show]);
  return (
    <div
      className="bg-sixth p-[24px] border border-tableBorder rounded-[8px] flex flex-col"
      onClick={changeShow}
    >
      <div className={`text-[20px] cursor-pointer flex justify-center`}>
        <div className="flex-1">{title}</div>
        <div className="flex items-center justify-center w-[32px]">
          {!show ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M18 12.75H6C5.59 12.75 5.25 12.41 5.25 12C5.25 11.59 5.59 11.25 6 11.25H18C18.41 11.25 18.75 11.59 18.75 12C18.75 12.41 18.41 12.75 18 12.75Z"
                fill="white"
              />
              <path
                d="M12 18.75C11.59 18.75 11.25 18.41 11.25 18V6C11.25 5.59 11.59 5.25 12 5.25C12.41 5.25 12.75 5.59 12.75 6V18C12.75 18.41 12.41 18.75 12 18.75Z"
                fill="white"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
            >
              <path
                d="M24 17H8C7.45333 17 7 16.5467 7 16C7 15.4533 7.45333 15 8 15H24C24.5467 15 25 15.4533 25 16C25 16.5467 24.5467 17 24 17Z"
                fill="#ECECEC"
              />
            </svg>
          )}
        </div>
      </div>
      <div
        className={clsx(
          'transition-all duration-500 overflow-hidden',
          !show ? 'max-h-[0]' : 'max-h-[500px]'
        )}
      >
        <div
          onClick={(e) => {
            e.stopPropagation();
          }}
          className={`mt-[16px] w-full text-wrap font-[400] text-[16px] text-customColor17 select-text max-w-[450px]`}
          dangerouslySetInnerHTML={{
            __html: description,
          }}
        />
      </div>
    </div>
  );
};
export const FAQComponent: FC = () => {
  const t = useT();
  const list = useFaqList();
  return (
    <div>
      {/*<h3 className="text-[24px] mt-[48px] mb-[40px] tablet:mt-[80px]">*/}
      {/*  {t('frequently_asked_questions', 'Frequently Asked Questions')}*/}
      {/*</h3>*/}
      <div className="gap-[24px] flex-col flex select-none  mt-[48px] mb-[40px] tablet:mt-[80px]">
        {list.map((item, index) => (
          <FAQSection key={index} {...item} />
        ))}
      </div>
    </div>
  );
};
