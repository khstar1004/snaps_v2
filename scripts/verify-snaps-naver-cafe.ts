import { Integration } from '@prisma/client';
import { NaverCafeDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/naver-cafe.dto';
import { PostDetails } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { NaverCafeProvider } from '@gitroom/nestjs-libraries/integrations/social/naver-cafe.provider';

const dryRun = process.argv.includes('--dry-run');
const smokeId =
  process.env.SNAPS_NAVER_CAFE_SMOKE_ID ||
  `snaps-naver-cafe-${new Date().toISOString().replace(/[:.]/g, '-')}`;

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for live Naver Cafe verification.`);
  }
  return value;
}

async function main() {
  const provider = new NaverCafeProvider();
  const settings: NaverCafeDto = {
    clubId: dryRun
      ? process.env.NAVER_CAFE_CLUB_ID || 'dry-run-club'
      : requireEnv('NAVER_CAFE_CLUB_ID'),
    menuId: dryRun
      ? process.env.NAVER_CAFE_MENU_ID || 'dry-run-menu'
      : requireEnv('NAVER_CAFE_MENU_ID'),
    subject:
      process.env.NAVER_CAFE_SUBJECT ||
      `snaps Naver Cafe provider smoke ${smokeId}`,
    category: process.env.NAVER_CAFE_CATEGORY || undefined,
  };
  const post: PostDetails<NaverCafeDto> = {
    id: smokeId,
    message: `<p><b>snaps Naver Cafe provider smoke</b></p><p>${smokeId}</p>`,
    settings,
    media: [],
  };

  if (dryRun) {
    console.log(
      `verify-snaps-naver-cafe-dry-run-ok smokeId=${smokeId} clubId=${settings.clubId} menuId=${settings.menuId}`
    );
    return;
  }

  if (process.env.SNAPS_NAVER_CAFE_CONFIRM !== 'post') {
    throw new Error(
      'Refusing to post to Naver Cafe. Set SNAPS_NAVER_CAFE_CONFIRM=post to run the live smoke.'
    );
  }

  const accessToken = requireEnv('NAVER_CAFE_ACCESS_TOKEN');
  const [result] = await provider.post(
    smokeId,
    accessToken,
    [post],
    { id: 'snaps-naver-cafe-live-smoke' } as Integration
  );

  if (!result?.postId && !result?.releaseURL) {
    throw new Error('Naver Cafe live smoke did not return a post id or URL.');
  }

  console.log(
    `verify-snaps-naver-cafe-ok smokeId=${smokeId} postId=${result.postId || '-'} url=${result.releaseURL || '-'}`
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
