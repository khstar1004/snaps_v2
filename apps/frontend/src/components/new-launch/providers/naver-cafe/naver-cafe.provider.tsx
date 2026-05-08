'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { Input } from '@gitroom/react/form/input';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { NaverCafeDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/naver-cafe.dto';

const NaverCafeSettings: FC = () => {
  const form = useSettings();
  return (
    <>
      <Input label="Cafe ID" {...form.register('clubId')} />
      <Input label="Menu ID" {...form.register('menuId')} />
      <Input label="Title" {...form.register('subject')} />
      <Input label="Category (optional)" {...form.register('category')} />
    </>
  );
};

export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: NaverCafeSettings,
  CustomPreviewComponent: undefined,
  dto: NaverCafeDto,
  checkValidity: undefined,
  maximumCharacters: 10000,
});
