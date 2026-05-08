'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { ThreadFinisher } from '@gitroom/frontend/components/new-launch/finisher/thread.finisher';

const SettingsComponent = () => {
  return <ThreadFinisher />;
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: SettingsComponent,
  CustomPreviewComponent: undefined,
  dto: undefined,
  checkValidity: async (posts) => {
    if (
      posts?.some(
        (p) => p?.some((a) => (a?.path?.indexOf?.('mp4') ?? -1) > -1) && (p?.length ?? 0) > 1
      )
    ) {
      return '게시물 하나에는 동영상을 한 개만 업로드할 수 있습니다.';
    }

    if (posts?.some((p) => (p?.length ?? 0) > 4)) {
      return '게시물 하나에는 이미지를 최대 4장까지 첨부할 수 있습니다.';
    }
    return true;
  },
  maximumCharacters: 300,
});
