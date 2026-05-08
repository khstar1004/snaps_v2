'use client';

import { useState, useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useUser } from '../layout/user.context';
import copy from 'copy-to-clipboard';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useDecisionModal } from '@gitroom/frontend/components/layout/new-modal';
import { DeveloperComponent } from '@gitroom/frontend/components/developer/developer.component';
import clsx from 'clsx';

const mcpClients = [
  'Claude Code',
  'Cursor',
  'VS Code / Copilot',
  'Windsurf',
  'Amp',
  'Codex',
  'Gemini CLI',
  'Warp',
] as const;

type McpClient = (typeof mcpClients)[number];

const getMcpConfig = (
  client: McpClient,
  method: 'header' | 'path',
  mcpBase: string,
  apiKey: string
): { config: string; hint: string } => {
  const urlWithKey = `${mcpBase}/mcp/${apiKey}`;
  const urlBase = `${mcpBase}/mcp`;
  const bearer = `Bearer ${apiKey}`;

  const json = (obj: object) => JSON.stringify(obj, null, 2);

  if (method === 'path') {
    switch (client) {
      case 'Claude Code':
        return {
          config: `claude mcp add snaps --transport http "${urlWithKey}"`,
          hint: '터미널에서 이 명령을 실행하세요.',
        };
      case 'Cursor':
        return {
          config: json({ mcpServers: { snaps: { url: urlWithKey } } }),
          hint: '프로젝트 루트의 .cursor/mcp.json에 추가하세요.',
        };
      case 'VS Code / Copilot':
        return {
          config: json({
            servers: { snaps: { type: 'http', url: urlWithKey } },
          }),
          hint: '프로젝트 루트의 .vscode/mcp.json에 추가하세요.',
        };
      case 'Windsurf':
        return {
          config: json({
            mcpServers: { snaps: { serverUrl: urlWithKey } },
          }),
          hint: '~/.codeium/windsurf/mcp_config.json에 추가하세요.',
        };
      case 'Amp':
        return {
          config: `amp mcp add snaps ${urlWithKey}`,
          hint: '터미널에서 이 명령을 실행하세요.',
        };
      case 'Codex':
        return {
          config: `# ~/.codex/config.toml\n\n[mcp_servers.snaps]\nurl = "${urlWithKey}"`,
          hint: '~/.codex/config.toml에 추가하세요.',
        };
      case 'Gemini CLI':
        return {
          config: json({ mcpServers: { snaps: { url: urlWithKey } } }),
          hint: '~/.gemini/settings.json에 추가하세요.',
        };
      case 'Warp':
        return {
          config: json({ snaps: { url: urlWithKey } }),
          hint: 'Settings > MCP Servers > + Add에서 이 설정을 붙여 넣으세요.',
        };
    }
  }

  switch (client) {
    case 'Claude Code':
      return {
        config: `claude mcp add snaps \\\n  --transport http \\\n  --header "Authorization: ${bearer}" \\\n  "${urlBase}"`,
        hint: '터미널에서 이 명령을 실행하세요.',
      };
    case 'Cursor':
      return {
        config: json({
          mcpServers: {
            snaps: { url: urlBase, headers: { Authorization: bearer } },
          },
        }),
        hint: '프로젝트 루트의 .cursor/mcp.json에 추가하세요.',
      };
    case 'VS Code / Copilot':
      return {
        config: json({
          servers: {
            snaps: {
              type: 'http',
              url: urlBase,
              headers: { Authorization: bearer },
            },
          },
        }),
        hint: '프로젝트 루트의 .vscode/mcp.json에 추가하세요.',
      };
    case 'Windsurf':
      return {
        config: json({
          mcpServers: {
            snaps: {
              serverUrl: urlBase,
              headers: { Authorization: bearer },
            },
          },
        }),
        hint: '~/.codeium/windsurf/mcp_config.json에 추가하세요.',
      };
    case 'Amp':
      return {
        config: json({
          'amp.mcpServers': {
            snaps: { url: urlBase, headers: { Authorization: bearer } },
          },
        }),
        hint: 'Amp settings.json에 추가하세요.',
      };
    case 'Codex':
      return {
        config: `# ~/.codex/config.toml\n\n[mcp_servers.snaps]\nurl = "${urlBase}"\nhttp_headers = { "Authorization" = "${bearer}" }`,
        hint: '~/.codex/config.toml에 추가하세요.',
      };
    case 'Gemini CLI':
      return {
        config: json({
          mcpServers: {
            snaps: { url: urlBase, headers: { Authorization: bearer } },
          },
        }),
        hint: '~/.gemini/settings.json에 추가하세요.',
      };
    case 'Warp':
      return {
        config: json({
          snaps: { url: urlBase, headers: { Authorization: bearer } },
        }),
        hint: 'Settings > MCP Servers > + Add에서 이 설정을 붙여 넣으세요.',
      };
  }
};

const CopyButton = ({
  text,
  label,
}: {
  text: string;
  label: string;
}) => {
  const toaster = useToaster();
  return (
    <button
      type="button"
      onClick={() => {
        copy(text);
        toaster.show(`${label} 복사 완료`, 'success');
      }}
      className="cursor-pointer px-[16px] h-[36px] bg-btnSimple hover:bg-boxHover transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
      {label}
    </button>
  );
};

const McpSection = ({
  user,
  mcpBase,
}: {
  user: { publicApi: string };
  mcpBase: string;
}) => {
  const t = useT();
  const [activeClient, setActiveClient] = useState<McpClient>('Claude Code');
  const [method, setMethod] = useState<'header' | 'path'>('header');
  const [revealed, setRevealed] = useState(false);

  const { config, hint } = getMcpConfig(
    activeClient,
    method,
    mcpBase,
    user.publicApi
  );

  const remoteUrl = `${mcpBase}/mcp/${user.publicApi}`;
  const cliUrl = `${mcpBase}/mcp`;

  const maskedConfig = revealed
    ? config
    : config.replace(new RegExp(user.publicApi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '*'.repeat(user.publicApi.length));

  const maskedRemoteUrl = revealed
    ? remoteUrl
    : remoteUrl.replace(user.publicApi, '*'.repeat(user.publicApi.length));

  return (
    <div className="bg-newBgColorInnerInner rounded-[12px] border border-newBorder overflow-hidden">
      <div className="bg-newBgColorInner px-[20px] py-[14px] border-b border-newBorder flex items-start justify-between gap-[12px]">
        <div>
          <div className="text-[15px] font-[600]">
            {t('mcp_client_configuration', 'MCP 클라이언트 설정')}
          </div>
          <div className="text-[13px] text-customColor18 mt-[2px]">
            {t(
              'connect_your_mcp_client_to_postiz_to_schedule_your_posts_faster',
              'snaps MCP 서버를 클라이언트에 연결해 게시물 예약을 더 빠르게 처리하세요.'
            )}
          </div>
        </div>
        <div className="flex gap-[6px] shrink-0 pt-[2px]">
          <a
            className="cursor-pointer px-[16px] h-[36px] bg-[#0ea5a8] hover:bg-[#0b8f95] text-white transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
            href="/terms"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
            {t('read_the_docs', '문서')}
          </a>
        </div>
      </div>
      <div className="p-[20px] flex flex-col gap-[16px]">
        <div className="flex flex-col gap-[6px]">
          <div className="text-[13px] font-[600] text-customColor18">
            {t('auth_method', '인증 방식')}
          </div>
          <div className="flex gap-[6px]">
            {(['header', 'path'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={clsx(
                  'cursor-pointer px-[14px] h-[36px] text-[13px] font-[500] rounded-[8px] transition-colors',
                  method === m
                    ? 'bg-[#0ea5a8] text-white'
                    : 'bg-btnSimple text-customColor18 hover:bg-boxHover hover:text-textColor'
                )}
                onClick={() => setMethod(m)}
              >
                {m === 'header'
                  ? t('cli_claude_code_codex', 'CLI(Claude Code / Codex)')
                  : t('remote_servers', '원격 서버(ChatGPT, Claude)')}
              </button>
            ))}
          </div>
        </div>
        {method === 'header' && (
          <div className="flex flex-col gap-[6px]">
            <div className="text-[13px] font-[600] text-customColor18">
              {t('mcp_client', '클라이언트')}
            </div>
            <div className="flex flex-wrap gap-[6px]">
              {mcpClients.map((client) => (
                <button
                  key={client}
                  type="button"
                  className={clsx(
                    'cursor-pointer px-[14px] h-[36px] text-[13px] font-[500] rounded-[8px] transition-colors',
                    activeClient === client
                      ? 'bg-[#0ea5a8] text-white'
                      : 'bg-btnSimple text-customColor18 hover:bg-boxHover hover:text-textColor'
                  )}
                  onClick={() => setActiveClient(client)}
                >
                  {client}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-[8px]">
          <div className="text-[12px] text-customColor18 font-[500]">
            {method === 'header'
              ? hint
              : t(
                  'remote_server_url_hint',
                  '이 URL을 원격 MCP 클라이언트(ChatGPT, Claude 등)에 붙여 넣으세요.'
                )}
          </div>
          <pre className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[16px] text-[13px] whitespace-pre-wrap break-all overflow-x-auto leading-[1.6]">
            {method === 'header' ? maskedConfig : maskedRemoteUrl}
          </pre>
          <div className="flex gap-[8px]">
            <button
              type="button"
              onClick={() => setRevealed(!revealed)}
              className="cursor-pointer px-[16px] h-[36px] bg-btnSimple hover:bg-boxHover transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {revealed ? (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
              {revealed ? t('hide', '숨기기') : t('reveal', '표시')}
            </button>
            <CopyButton
              text={method === 'header' ? config : remoteUrl}
              label={t('copy', '복사')}
            />
            {method === 'header' && (
              <CopyButton
                text={cliUrl}
                label={t('copy_url', 'URL 복사')}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const localCliSteps = [
  {
    label: 'CLI 설치',
    code: 'npm install -g snaps',
  },
  {
    label: '로그인 명령 실행',
    code: 'snaps auth:login',
  },
  {
    label: 'AI 에이전트용 snaps 스킬 설치',
    code: 'npx skills add snaps-agent',
  },
] as const;

const ciCliSteps = [
  {
    label: 'CLI 설치',
    code: 'npm install -g snaps',
  },
  {
    label: 'API 키를 환경 변수로 설정',
    code: 'export SNAPS_API_KEY="{API_KEY}"',
  },
  {
    label: 'AI 에이전트용 snaps 스킬 설치',
    code: 'npx skills add snaps-agent',
  },
] as const;

const CliSection = ({ apiKey }: { apiKey: string }) => {
  const t = useT();
  const [mode, setMode] = useState<'local' | 'ci'>('local');
  const [revealed, setRevealed] = useState(false);

  const steps =
    mode === 'local'
      ? localCliSteps.map((step) => ({ ...step }))
      : ciCliSteps.map((step) => ({
          ...step,
          code: step.code.replace('{API_KEY}', apiKey),
        }));

  const displaySteps =
    mode === 'ci' && !revealed
      ? steps.map((step) => ({
          ...step,
          code: step.code.replace(
            new RegExp(apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            '*'.repeat(apiKey.length)
          ),
        }))
      : steps;

  return (
    <div className="bg-newBgColorInnerInner rounded-[12px] border border-newBorder overflow-hidden">
      <div className="bg-newBgColorInner px-[20px] py-[14px] border-b border-newBorder flex items-start justify-between gap-[12px]">
        <div>
          <div className="text-[15px] font-[600]">
            {t('cli_and_skills', 'CLI 및 AI 스킬')}
          </div>
          <div className="text-[13px] text-customColor18 mt-[2px]">
            {t(
              'cli_description',
              'snaps CLI로 터미널에서 게시를 자동화하거나, 스킬을 설치해 AI 에이전트가 게시물을 예약하도록 연결하세요.'
            )}
          </div>
        </div>
        <div className="flex gap-[6px] shrink-0 pt-[2px]">
          <a
            className="cursor-pointer px-[16px] h-[36px] bg-[#0ea5a8] hover:bg-[#0b8f95] text-white transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
            href="/terms"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
            {t('read_the_docs', '문서')}
          </a>
        </div>
      </div>
      <div className="p-[20px] flex flex-col gap-[16px]">
        <div className="flex gap-[6px]">
          {(['local', 'ci'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={clsx(
                'cursor-pointer px-[14px] h-[36px] text-[13px] font-[500] rounded-[8px] transition-colors',
                mode === m
                  ? 'bg-[#0ea5a8] text-white'
                  : 'bg-btnSimple text-customColor18 hover:bg-boxHover hover:text-textColor'
              )}
              onClick={() => setMode(m)}
            >
              {m === 'local'
                ? t('locally', '로컬')
                : t('ci_remote_servers', 'CI / 원격 서버')}
            </button>
          ))}
        </div>
        {displaySteps.map((step, i) => (
          <div key={i} className="flex flex-col gap-[6px]">
            <div className="text-[13px] font-[600] text-customColor18">
              {i + 1}. {step.label}
            </div>
            <pre className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[16px] text-[13px] whitespace-pre-wrap break-all overflow-x-auto leading-[1.6]">
              {step.code}
            </pre>
          </div>
        ))}
        <div className="flex gap-[8px]">
          {mode === 'ci' && (
            <button
              type="button"
              onClick={() => setRevealed(!revealed)}
              className="cursor-pointer px-[16px] h-[36px] bg-btnSimple hover:bg-boxHover transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {revealed ? (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
              {revealed ? t('hide', '숨기기') : t('reveal', '표시')}
            </button>
          )}
          <CopyButton
            text={steps.map((s) => s.code).join(' && ')}
            label={t('copy_all', '전체 복사')}
          />
        </div>
      </div>
    </div>
  );
};

const PublicApiContent = () => {
  const user = useUser();
  const { backendUrl, frontEndUrl, mcpUrl } = useVariables();
  const toaster = useToaster();
  const fetch = useFetch();
  const decision = useDecisionModal();
  const { mutate } = useSWRConfig();
  const [reveal, setReveal] = useState(false);
  const t = useT();

  const rotateKey = useCallback(async () => {
    const approved = await decision.open({
      title: t('rotate_api_key', 'API 키를 재발급할까요?'),
      description: t(
        'rotate_api_key_description',
        '새 API 키가 생성되고 현재 키는 즉시 만료됩니다. 이전 키를 사용하는 연동은 다시 설정해야 합니다.'
      ),
      approveLabel: t('rotate', '재발급'),
      cancelLabel: t('cancel', '취소'),
    });
    if (!approved) return;
    await fetch('/user/api-key/rotate', { method: 'POST' });
    await mutate('/user/self');
    setReveal(false);
    toaster.show(
      t('api_key_rotated', 'API 키를 재발급했습니다.'),
      'success'
    );
  }, [decision, fetch, mutate, toaster]);

  if (!user || !user.publicApi) {
    return null;
  }

  const mcpBase = mcpUrl || backendUrl;

  return (
    <div className="flex flex-col gap-[40px]">
      <div className="text-[14px] text-textColor leading-[1.7]">
        {t(
          'api_auth_note_line1',
          'API 키를 사용해 내 계정의 게시 작업을 자동화할 수 있습니다.'
        )}
        <br />
        {t(
          'api_auth_note_line2',
          '다른 snaps 사용자를 대신해 게시물을 예약하는 제품을 만든다면,'
        )}
        <br />
        {t(
          'api_auth_note_line3',
          '"앱" 탭에서 OAuth 앱을 생성하세요. 사용자는 OAuth2로 앱 접근을 승인하고,'
        )}
        <br />
        {t(
          'api_auth_note_line4',
          'API 키처럼 API, MCP, CLI에서 사용할 수 있는 pos_ 접두사 토큰을 받게 됩니다.'
        )}
      </div>
      <div className="bg-newBgColorInnerInner rounded-[12px] border border-newBorder overflow-hidden">
        <div className="bg-newBgColorInner px-[20px] py-[14px] border-b border-newBorder flex items-start justify-between gap-[12px]">
          <div>
            <div className="text-[15px] font-[600]">
              {t('api_key', 'API 키')}
            </div>
            <div className="text-[13px] text-customColor18 mt-[2px]">
              {t(
                'use_postiz_api_to_integrate_with_your_tools',
                'snaps API를 사용해 내부 도구와 연동하세요.'
              )}
            </div>
          </div>
          <div className="flex gap-[6px] shrink-0 pt-[2px]">
            <a
              className="cursor-pointer px-[16px] h-[36px] bg-[#0ea5a8] hover:bg-[#0b8f95] text-white transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
              href="/terms"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
            {t('read_the_docs', '문서')}
            </a>
            <a
              className="cursor-pointer px-[16px] h-[36px] bg-[#0ea5a8] hover:bg-[#0b8f95] text-white transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
              href="/settings"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
              {t('n8n_node', 'N8N 노드')}
            </a>
          </div>
        </div>
        <div className="p-[20px] flex flex-col gap-[16px]">
          <div className="bg-newBgColorInner border border-newBorder rounded-[8px] px-[16px] h-[44px] flex items-center overflow-hidden">
            <code className="text-[14px] flex-1 truncate">
              {reveal ? (
                user.publicApi
              ) : (
                <span className="flex items-center">
                  <span className="blur-sm select-none">
                    {user.publicApi.slice(0, -5)}
                  </span>
                  <span>{user.publicApi.slice(-5)}</span>
                </span>
              )}
            </code>
          </div>
          <div className="flex gap-[8px]">
            <button
              type="button"
              onClick={() => setReveal(!reveal)}
              className="cursor-pointer px-[16px] h-[36px] bg-btnSimple hover:bg-boxHover transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {reveal ? (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
              {reveal ? t('hide', '숨기기') : t('reveal', '표시')}
            </button>
            <CopyButton text={user.publicApi} label={t('copy', '복사')} />
            <button
              type="button"
              onClick={rotateKey}
              className="cursor-pointer px-[16px] h-[36px] bg-btnSimple hover:bg-boxHover transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6" />
                <path d="M21.34 15.57a10 10 0 11-.57-8.38L21.5 8" />
              </svg>
              {t('rotate_key', '키 재발급')}
            </button>
            <button
              type="button"
              data-tooltip-id="tooltip"
              data-tooltip-content={t(
                'payload_wizard_description',
                '/posts 요청 본문은 복잡할 수 있습니다. UI 마법사로 게시물을 예약한 뒤 생성된 payload를 복사하세요.'
              )}
              onClick={() =>
                window.open(`${frontEndUrl}/modal/dark/all`, '_blank')
              }
              className="cursor-pointer px-[16px] h-[36px] bg-btnSimple hover:bg-boxHover transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              {t('open_wizard', '마법사 열기')}
            </button>
          </div>
        </div>
      </div>

      <CliSection apiKey={user.publicApi} />

      <McpSection user={user} mcpBase={mcpBase} />
    </div>
  );
};

export const PublicComponent = () => {
  const t = useT();
  const [subTab, setSubTab] = useState<'api' | 'developer'>('api');

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex gap-[6px]">
        {(['api', 'developer'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={clsx(
              'cursor-pointer px-[20px] h-[44px] text-[15px] font-[600] rounded-[8px] transition-colors',
              subTab === tab
                ? 'bg-[#0ea5a8] text-white'
                : 'bg-btnSimple text-customColor18 hover:bg-boxHover hover:text-textColor'
            )}
            onClick={() => setSubTab(tab)}
          >
            {tab === 'api'
              ? t('access', '접근')
              : t('apps', '앱')}
          </button>
        ))}
      </div>
      {subTab === 'api' && <PublicApiContent />}
      {subTab === 'developer' && <DeveloperComponent />}
    </div>
  );
};
