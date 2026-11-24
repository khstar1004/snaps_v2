'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { Input } from '@gitroom/react/form/input';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { NaverCafeDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/naver-cafe.dto';

// Every other provider settings component goes through the translation layer;
// this one shipped plain English labels, which is the odd choice for the one
// provider this fork added for a Korean service in a Korean-first product.
const NaverCafeSettings: FC = () => {
  const form = useSettings();
  const t = useT();
  return (
    <>
      <Input label={t('naver_cafe_club_id', 'Cafe ID')} {...form.register('clubId')} />
      <Input label={t('naver_cafe_menu_id', 'Menu ID')} {...form.register('menuId')} />
      <Input label={t('naver_cafe_subject', 'Title')} {...form.register('subject')} />
      <Input
        label={t('naver_cafe_category', 'Category (optional)')}
        {...form.register('category')}
      />
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
