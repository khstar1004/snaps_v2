import { internalFetch } from '@gitroom/helpers/utils/internal.fetch';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type SnapsPublicSalesLink = {
  source: 'snaps-public-sales-link';
  organizationId: string;
  campaignId: string;
  title: string;
  cta: string;
  platform?: string;
  slug: string;
  tags: string[];
  destinationHost: string;
  linkInBioUrl: string;
  clickPath: string;
};

type SnapsPublicSalesHub = {
  source: 'snaps-public-sales-hub';
  organizationId: string;
  title: string;
  description: string;
  linkInBioUrl: string;
  links: SnapsPublicSalesLink[];
  tags: string[];
  updatedAt?: string;
};

type SnapsPublicSalesEntry = SnapsPublicSalesLink | SnapsPublicSalesHub;

const backendBaseUrl = () =>
  (
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.BACKEND_INTERNAL_URL ||
    ''
  )
    .replace(/\/$/, '')
    .replace(/\/api$/, '');

const publicPathFromParts = (parts: string[]) => {
  const clean = parts.map((part) => encodeURIComponent(decodeURIComponent(part)));
  if (clean.length >= 2) {
    return `/public/snaps/link/${clean[0]}/${clean[1]}`;
  }
  return clean[0] ? `/public/snaps/link/${clean[0]}` : '';
};

const clickUrl = (link: SnapsPublicSalesLink) =>
  `${backendBaseUrl()}${link.clickPath}`;

const LinkTags = ({ tags }: { tags: string[] }) =>
  tags.length ? (
    <div className="mt-[12px] flex flex-wrap gap-[6px]">
      {tags.slice(0, 8).map((tag) => (
        <span
          key={tag}
          className="rounded-[8px] border border-newBorder bg-newBgLineColor px-[8px] py-[5px] text-[11px] text-textItemBlur"
        >
          {tag}
        </span>
      ))}
    </div>
  ) : null;

export default async function SnapsPublicSalesLinkPage(props: {
  params: Promise<{ parts?: string[] }>;
}) {
  const params = await props.params;
  const publicPath = publicPathFromParts(params.parts || []);
  let entry: SnapsPublicSalesEntry | null = null;

  if (publicPath) {
    const response = await internalFetch(publicPath);
    if (response.ok) {
      entry = (await response.json()) as SnapsPublicSalesEntry;
    }
  }

  if (!entry) {
    return (
      <main className="min-h-screen bg-primary text-textColor flex items-center justify-center px-[20px]">
        <div className="w-full max-w-[420px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[24px] text-center">
          <div className="text-[13px] font-[700] text-textItemBlur">snaps link</div>
          <h1 className="mt-[10px] text-[24px] font-[800] tracking-[0]">
            링크를 찾을 수 없습니다
          </h1>
          <p className="mt-[10px] text-[13px] leading-[1.6] text-textItemBlur">
            캠페인이 삭제되었거나 주소가 바뀌었습니다.
          </p>
          <Link
            href="/"
            className="mt-[18px] inline-flex h-[40px] items-center justify-center rounded-[8px] bg-[#12b8b8] px-[16px] text-[13px] font-[700] text-[#041313]"
          >
            snaps로 이동
          </Link>
        </div>
      </main>
    );
  }

  if (entry.source === 'snaps-public-sales-hub') {
    return (
      <main className="min-h-screen bg-primary text-textColor">
        <section className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col justify-center px-[20px] py-[36px]">
          <div className="text-[12px] font-[700] text-textItemBlur">
            snaps link-in-bio
          </div>
          <h1 className="mt-[8px] break-words text-[28px] font-[800] leading-[1.2] tracking-[0]">
            {entry.title}
          </h1>
          <p className="mt-[10px] text-[13px] leading-[1.6] text-textItemBlur">
            {entry.description}
          </p>
          <LinkTags tags={entry.tags} />

          <div className="mt-[18px] grid gap-[10px]">
            {entry.links.slice(0, 20).map((link) => (
              <a
                key={link.campaignId}
                href={clickUrl(link)}
                className="flex min-h-[58px] w-full items-center justify-between gap-[12px] rounded-[8px] border border-newBorder bg-newBgColorInner px-[14px] py-[10px] text-left transition-colors hover:border-[#12b8b8]"
              >
                <span className="min-w-0">
                  <span className="block break-words text-[14px] font-[800] leading-[1.35]">
                    {link.title}
                  </span>
                  <span className="mt-[3px] block break-words text-[11px] font-[700] text-textItemBlur">
                    {link.destinationHost || link.platform || 'destination'}
                  </span>
                </span>
                <span className="max-w-[44%] shrink-0 break-words rounded-[8px] bg-[#12b8b8] px-[10px] py-[7px] text-center text-[11px] font-[800] leading-[1.15] text-[#041313]">
                  {link.cta}
                </span>
              </a>
            ))}
          </div>

          <div className="mt-[18px] text-center text-[11px] font-[700] text-textItemBlur">
            powered by snaps
          </div>
        </section>
      </main>
    );
  }

  const link = entry;
  const host = link.destinationHost || 'destination';

  return (
    <main className="min-h-screen bg-primary text-textColor">
      <section className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col justify-center gap-[14px] px-[20px] py-[36px]">
        <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[18px]">
          <div className="flex items-center justify-between gap-[12px]">
            <div className="min-w-0">
              <div className="text-[12px] font-[700] text-textItemBlur">
                snaps link-in-bio
              </div>
              <h1 className="mt-[6px] break-words text-[26px] font-[800] leading-[1.2] tracking-[0]">
                {link.title}
              </h1>
            </div>
            {link.platform && (
              <div className="shrink-0 rounded-[8px] border border-newBorder bg-newBgLineColor px-[10px] py-[6px] text-[11px] font-[700] text-textItemBlur">
                {link.platform}
              </div>
            )}
          </div>

          <div className="mt-[14px] text-[12px] font-[700] text-textItemBlur">
            <span>이동 대상</span>
            <span className="ml-[6px] break-words text-[14px] text-textColor">
              {host}
            </span>
          </div>

          <LinkTags tags={link.tags} />

          <a
            href={clickUrl(link)}
            className="mt-[18px] flex min-h-[46px] w-full items-center justify-center rounded-[8px] bg-[#12b8b8] px-[16px] py-[10px] text-center text-[14px] font-[800] leading-[1.25] text-[#041313]"
          >
            {link.cta}
          </a>
        </div>

        <div className="text-center text-[11px] font-[700] text-textItemBlur">
          powered by snaps
        </div>
      </section>
    </main>
  );
}
