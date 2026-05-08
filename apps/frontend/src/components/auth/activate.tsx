'use client';

import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { FormProvider, SubmitHandler, useForm } from 'react-hook-form';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type ResendInputs = {
  email: string;
};

type ResendStatus = 'idle' | 'sent' | 'already_activated';

const COOLDOWN_SECONDS = 60;
const ALREADY_ACTIVATED_RESPONSE = 'Account is already activated';

export function Activate() {
  const t = useT();
  const fetch = useFetch();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ResendStatus>('idle');
  const [cooldown, setCooldown] = useState(0);
  const form = useForm<ResendInputs>();

  useEffect(() => {
    if (cooldown <= 0) return;
    
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  const resetToForm = useCallback(() => {
    setStatus('idle');
    setCooldown(COOLDOWN_SECONDS);
  }, []);

  const onSubmit: SubmitHandler<ResendInputs> = async (data) => {
    setLoading(true);
    try {
      const response = await fetch('/auth/resend-activation', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (result.success) {
        setStatus('sent');
        setCooldown(COOLDOWN_SECONDS);
      } else if (result.message === ALREADY_ACTIVATED_RESPONSE) {
        setStatus('already_activated');
      } else {
        form.setError('email', {
          message: t(
            'failed_to_resend',
            '활성화 이메일을 다시 보내지 못했습니다. 이메일 주소를 확인해 주세요.'
          ),
        });
      }
    } catch (e) {
      form.setError('email', {
        message: t('error_occurred', '오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <div>
        <h1 className="text-3xl font-bold text-start mb-4 cursor-pointer">
          {t('activate_your_account', '계정 활성화')}
        </h1>
      </div>
      <div className="text-textColor">
        {t('thank_you_for_registering', '회원가입해 주셔서 감사합니다!')}
        <br />
        {t(
          'please_check_your_email_to_activate_your_account',
          '계정 활성화를 위해 이메일을 확인해 주세요.'
        )}
      </div>

      <div className="mt-8 border-t border-fifth pt-6">
        <h2 className="text-lg font-semibold mb-4">
          {t('didnt_receive_email', '이메일을 받지 못하셨나요?')}
        </h2>
        {status === 'sent' ? (
          <div className="flex flex-col gap-4">
            <div className="text-green-400">
              {t(
                'activation_email_sent',
                '활성화 이메일을 보냈습니다. 받은 편지함을 확인해 주세요.'
              )}
            </div>
            {cooldown > 0 ? (
              <p className="text-sm text-textColor">
                {t('resend_available_in', '다시 보내기 가능까지')} {cooldown}s
              </p>
            ) : (
              <Button
                onClick={resetToForm}
                className="rounded-[10px] !h-[52px]"
              >
                {t('send_again', '다시 보내기')}
              </Button>
            )}
          </div>
        ) : status === 'already_activated' ? (
          <div className="flex flex-col gap-4">
            <div className="text-green-400">
              {t(
                'account_already_activated',
                '이미 활성화된 계정입니다.'
              )}
            </div>
            <Link href="/auth/login">
              <Button className="rounded-[10px] !h-[52px] w-full">
                {t('go_to_login', '로그인으로 이동')}
              </Button>
            </Link>
          </div>
        ) : (
          <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <Input
                label={t('label_email', '이메일')}
                translationKey="label_email"
                {...form.register('email', { required: true })}
                type="email"
                placeholder={t('email_address', '이메일 주소')}
              />
              <Button
                type="submit"
                className="rounded-[10px] !h-[52px]"
                loading={loading}
                disabled={cooldown > 0}
              >
                {cooldown > 0
                  ? `${t('resend_available_in', '다시 보내기 가능까지')} ${cooldown}s`
                  : t('resend_activation_email', '활성화 이메일 다시 보내기')}
              </Button>
            </form>
          </FormProvider>
        )}
        {status !== 'already_activated' && (
          <p className="mt-4 text-sm text-textColor">
            {t('already_activated', '이미 활성화하셨나요?')}&nbsp;
            <Link href="/auth/login" className="underline cursor-pointer">
              {t('sign_in', '로그인')}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
