'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { TwitchDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/twitch.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Select } from '@gitroom/react/form/select';
import { useWatch } from 'react-hook-form';

const messageTypes = [
  {
    label: '채팅 메시지',
    value: 'message',
  },
  {
    label: '공지',
    value: 'announcement',
  },
];

const announcementColors = [
  {
    label: '기본',
    value: 'primary',
  },
  {
    label: '파란색',
    value: 'blue',
  },
  {
    label: '초록색',
    value: 'green',
  },
  {
    label: '주황색',
    value: 'orange',
  },
  {
    label: '보라색',
    value: 'purple',
  },
];

const TwitchSettings: FC = () => {
  const { register, control } = useSettings();
  const messageType = useWatch({
    control,
    name: 'messageType',
  });

  return (
    <div className="flex flex-col">
      <Select
        label="메시지 유형"
        {...register('messageType', {
          value: 'message',
        })}
      >
        {messageTypes.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      {messageType === 'announcement' && (
        <Select
          label="공지 색상"
          {...register('announcementColor', {
            value: 'primary',
          })}
        >
          {announcementColors.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
};

export default withProvider({
  postComment: PostComment.COMMENT,
  comments: 'no-media',
  minimumCharacters: [],
  SettingsComponent: TwitchSettings,
  CustomPreviewComponent: undefined,
  dto: TwitchDto,
  checkValidity: undefined,
  maximumCharacters: 500,
});
