'use client';

import { FC, useCallback } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { useFieldArray } from 'react-hook-form';
import { Button } from '@gitroom/react/form/button';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { Subreddit } from './subreddit';
import { LemmySettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/lemmy.dto';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
const LemmySettings: FC = () => {
  const { register, control } = useSettings();
  const { fields, append, remove } = useFieldArray({
    control,
    // control props comes from useForm (optional: if you are using FormContext)
    name: 'subreddit', // unique name for your Field Array
  });
  const t = useT();

  const addField = useCallback(() => {
    append({});
  }, [fields, append]);
  const deleteField = useCallback(
    (index: number) => async () => {
      if (
        !(await deleteDialog(
          t(
            'are_you_sure_you_want_to_delete_this_subreddit',
            '이 커뮤니티를 삭제하시겠습니까?'
          )
        ))
      )
        return;
      remove(index);
    },
    [fields, remove]
  );
  return (
    <>
      <div className="flex flex-col gap-[20px] mb-[20px]">
        {fields.map((field, index) => (
          <div key={field.id} className="flex flex-col relative">
            <div
              onClick={deleteField(index)}
              className="absolute -start-[10px] justify-center items-center flex -top-[10px] w-[20px] h-[20px] bg-red-600 rounded-full text-textColor"
            >
              x
            </div>
            <Subreddit {...register(`subreddit.${index}.value`)} />
          </div>
        ))}
      </div>
      <Button onClick={addField}>{t('add_community', '커뮤니티 추가')}</Button>
      {fields.length === 0 && (
        <div className="text-red-500 text-[12px] mt-[10px]">
          {t(
            'please_add_at_least_one_subreddit',
            '커뮤니티를 최소 한 개 추가해 주세요.'
          )}
        </div>
      )}
    </>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: LemmySettings,
  CustomPreviewComponent: undefined,
  dto: LemmySettingsDto,
  checkValidity: async (items) => {
    const [firstItems] = items ?? [];
    if (
      firstItems?.length &&
      (firstItems?.[0]?.path?.indexOf?.('png') ?? -1) === -1 &&
      (firstItems?.[0]?.path?.indexOf?.('jpg') ?? -1) === -1 &&
      (firstItems?.[0]?.path?.indexOf?.('jpef') ?? -1) === -1 &&
      (firstItems?.[0]?.path?.indexOf?.('gif') ?? -1) === -1
    ) {
      return '커버에는 이미지를 한 장만 설정할 수 있습니다.';
    }
    return true;
  },
  maximumCharacters: 10000,
});
