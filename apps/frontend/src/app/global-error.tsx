'use client';
import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';
import { useVariables } from '@gitroom/react/helpers/variable.context';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const { sentryDsn } = useVariables();

  useEffect(() => {
    if (!sentryDsn) {
      return;
    }
    const eventId = Sentry.captureException(error);
    Sentry.showReportDialog({
      eventId,
      title: '문제가 발생했습니다.',
      subtitle: '원인 확인을 위해 상황을 간단히 알려주세요.',
      labelComments: '어떤 문제가 있었나요?',
      labelName: '이름',
      labelEmail: '이메일',
      labelSubmit: '보고서 보내기',
      lang: 'ko',
    });

  }, [error]);
  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
