import { internalFetch } from '@gitroom/helpers/utils/internal.fetch';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type SnapsApprovalStatus =
  | 'pending'
  | 'approved'
  | 'changes-requested'
  | 'rejected'
  | 'scheduled';

type SnapsVariant = {
  platform: string;
  label?: string;
  title?: string;
  content: string;
  hashtags?: string[];
  notes?: string[];
};

type SnapsApprovalComment = {
  id: string;
  actor?: string;
  message: string;
  visibility: 'internal' | 'reviewer';
  variantPlatform?: string;
  variantIndex?: number;
  selection?: string;
  resolved: boolean;
  createdAt: string;
};

type SnapsPublicApprovalReview = {
  product: 'snaps';
  source: 'snaps-public-approval-review';
  organizationId: string;
  approvalId: string;
  token: string;
  title: string;
  status: SnapsApprovalStatus;
  reviewer?: string;
  note?: string;
  dueAt?: string;
  expiresAt?: string;
  allowDecision: boolean;
  canComment: boolean;
  canDecide: boolean;
  publicReviewUrl: string;
  variants: SnapsVariant[];
  comments: SnapsApprovalComment[];
  warnings: string[];
};

const statusLabels: Record<SnapsApprovalStatus, string> = {
  pending: '검토 대기',
  approved: '승인됨',
  'changes-requested': '수정 요청',
  rejected: '반려됨',
  scheduled: '예약됨',
};

const publicPath = (organizationId: string, token: string) =>
  `/public/snaps/review/${encodeURIComponent(organizationId)}/${encodeURIComponent(
    token
  )}`;

const pagePath = (organizationId: string, token: string, submitted?: string) => {
  const query = submitted ? `?submitted=${encodeURIComponent(submitted)}` : '';
  return `/snaps/review/${encodeURIComponent(organizationId)}/${encodeURIComponent(
    token
  )}${query}`;
};

const displayDate = (value?: string) =>
  value ? value.slice(0, 16).replace('T', ' ') : '';

const postComment = async (
  organizationId: string,
  token: string,
  formData: FormData
) => {
  'use server';
  const message = String(formData.get('message') || '').trim();
  const actor = String(formData.get('actor') || '').trim();
  const selection = String(formData.get('selection') || '').trim();

  await internalFetch(`${publicPath(organizationId, token)}/comment`, {
    method: 'POST',
    body: JSON.stringify({
      actor,
      message,
      selection,
    }),
  });
  redirect(pagePath(organizationId, token, 'comment'));
};

const postDecision = async (
  organizationId: string,
  token: string,
  formData: FormData
) => {
  'use server';
  const decision = String(formData.get('decision') || '').trim();
  const reviewer = String(formData.get('reviewer') || '').trim();
  const note = String(formData.get('note') || '').trim();

  await internalFetch(`${publicPath(organizationId, token)}/review`, {
    method: 'POST',
    body: JSON.stringify({
      decision,
      reviewer,
      note,
    }),
  });
  redirect(pagePath(organizationId, token, 'review'));
};

export default async function SnapsPublicApprovalReviewPage(props: {
  params: Promise<{ organizationId: string; token: string }>;
  searchParams?: Promise<{ submitted?: string }>;
}) {
  const params = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : {};
  let review: SnapsPublicApprovalReview | null = null;

  const response = await internalFetch(
    publicPath(params.organizationId, params.token)
  );
  if (response.ok) {
    review = (await response.json()) as SnapsPublicApprovalReview;
  }

  if (!review) {
    return (
      <main className="min-h-screen bg-primary text-textColor flex items-center justify-center px-[20px]">
        <div className="w-full max-w-[420px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[24px] text-center">
          <div className="text-[13px] font-[700] text-textItemBlur">
            snaps approval
          </div>
          <h1 className="mt-[10px] text-[24px] font-[800] tracking-[0]">
            리뷰 링크를 찾을 수 없습니다
          </h1>
          <p className="mt-[10px] text-[13px] leading-[1.6] text-textItemBlur">
            링크가 만료되었거나 승인 요청이 삭제되었습니다.
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

  const commentAction = postComment.bind(
    null,
    params.organizationId,
    params.token
  );
  const decisionAction = postDecision.bind(
    null,
    params.organizationId,
    params.token
  );

  return (
    <main className="min-h-screen bg-primary text-textColor">
      <section className="mx-auto flex w-full max-w-[760px] flex-col gap-[14px] px-[20px] py-[32px]">
        <header className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[18px]">
          <div className="flex flex-wrap items-start justify-between gap-[12px]">
            <div className="min-w-0">
              <div className="text-[12px] font-[700] text-textItemBlur">
                snaps approval
              </div>
              <h1 className="mt-[6px] break-words text-[28px] font-[800] leading-[1.2] tracking-[0]">
                {review.title}
              </h1>
            </div>
            <div className="rounded-[8px] border border-newBorder bg-newBgLineColor px-[10px] py-[6px] text-[12px] font-[800]">
              {statusLabels[review.status] || review.status}
            </div>
          </div>
          <div className="mt-[14px] grid grid-cols-3 gap-[8px] maxMedia:grid-cols-1">
            {[
              ['검토자', review.reviewer || '-'],
              ['만료', displayDate(review.expiresAt) || '-'],
              ['게시물', review.variants.length],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
              >
                <div className="text-[11px] text-textItemBlur">{label}</div>
                <div className="mt-[4px] break-words text-[14px] font-[800]">
                  {value}
                </div>
              </div>
            ))}
          </div>
          {review.note && (
            <p className="mt-[12px] whitespace-pre-wrap break-words text-[13px] leading-[1.6] text-textItemBlur">
              {review.note}
            </p>
          )}
          {searchParams.submitted && (
            <div className="mt-[12px] rounded-[8px] border border-[#12b8b8] bg-newBgLineColor p-[10px] text-[12px] font-[700] text-[#12b8b8]">
              제출되었습니다.
            </div>
          )}
        </header>

        <div className="grid gap-[10px]">
          {review.variants.map((variant, index) => (
            <article
              key={`${variant.platform}-${index}`}
              className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[14px]"
            >
              <div className="flex flex-wrap items-center justify-between gap-[8px]">
                <div className="text-[12px] font-[800] text-textItemBlur">
                  {variant.label || variant.platform} #{index + 1}
                </div>
                {!!variant.hashtags?.length && (
                  <div className="text-[11px] font-[700] text-textItemBlur">
                    {variant.hashtags.slice(0, 5).join(' ')}
                  </div>
                )}
              </div>
              {variant.title && (
                <h2 className="mt-[8px] break-words text-[16px] font-[800]">
                  {variant.title}
                </h2>
              )}
              <p className="mt-[8px] whitespace-pre-wrap break-words text-[13px] leading-[1.65]">
                {variant.content}
              </p>
            </article>
          ))}
        </div>

        <section className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[14px]">
          <h2 className="text-[16px] font-[800] tracking-[0]">피드백</h2>
          <form action={commentAction} className="mt-[10px] grid gap-[8px]">
            <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-[8px] maxMedia:grid-cols-1">
              <input
                name="actor"
                defaultValue={review.reviewer || ''}
                className="h-[38px] rounded-[8px] border border-newBorder bg-newBgLineColor px-[10px] text-[12px]"
                placeholder="이름"
              />
              <input
                name="selection"
                className="h-[38px] rounded-[8px] border border-newBorder bg-newBgLineColor px-[10px] text-[12px]"
                placeholder="선택 영역"
              />
            </div>
            <textarea
              name="message"
              required
              className="min-h-[92px] resize-none rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[13px] leading-[1.5]"
              placeholder="검토 의견"
            />
            <button
              type="submit"
              className="h-[40px] rounded-[8px] bg-[#12b8b8] px-[14px] text-[13px] font-[800] text-[#041313]"
            >
              코멘트 남기기
            </button>
          </form>

          <div className="mt-[12px] grid gap-[8px]">
            {review.comments.slice(0, 20).map((comment) => (
              <div
                key={comment.id}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
              >
                <div className="text-[12px] font-[800]">
                  {comment.actor || '검토자'} ·{' '}
                  {comment.resolved ? '해결됨' : '미해결'}
                </div>
                <p className="mt-[6px] whitespace-pre-wrap break-words text-[12px] leading-[1.5]">
                  {comment.message}
                </p>
                <div className="mt-[6px] text-[11px] text-textItemBlur">
                  {[comment.selection, displayDate(comment.createdAt)]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            ))}
            {!review.comments.length && (
              <div className="rounded-[8px] border border-dashed border-newBorder bg-newBgLineColor p-[10px] text-[12px] text-textItemBlur">
                아직 외부 피드백이 없습니다.
              </div>
            )}
          </div>
        </section>

        {review.canDecide && (
          <section className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[14px]">
            <h2 className="text-[16px] font-[800] tracking-[0]">결정</h2>
            <form action={decisionAction} className="mt-[10px] grid gap-[8px]">
              <input
                name="reviewer"
                defaultValue={review.reviewer || ''}
                className="h-[38px] rounded-[8px] border border-newBorder bg-newBgLineColor px-[10px] text-[12px]"
                placeholder="검토자"
              />
              <textarea
                name="note"
                className="min-h-[72px] resize-none rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[13px] leading-[1.5]"
                placeholder="결정 메모"
              />
              <div className="grid grid-cols-3 gap-[8px] maxMedia:grid-cols-1">
                <button
                  type="submit"
                  name="decision"
                  value="approve"
                  className="h-[40px] rounded-[8px] bg-[#12b8b8] px-[12px] text-[13px] font-[800] text-[#041313]"
                >
                  승인
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="request-changes"
                  className="h-[40px] rounded-[8px] border border-newBorder bg-newBgLineColor px-[12px] text-[13px] font-[800]"
                >
                  수정 요청
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="reject"
                  className="h-[40px] rounded-[8px] border border-newBorder bg-newBgLineColor px-[12px] text-[13px] font-[800]"
                >
                  반려
                </button>
              </div>
            </form>
          </section>
        )}

        <div className="text-center text-[11px] font-[700] text-textItemBlur">
          powered by snaps
        </div>
      </section>
    </main>
  );
}
