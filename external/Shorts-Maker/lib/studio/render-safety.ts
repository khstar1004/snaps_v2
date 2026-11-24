import type { PreparedSlide, SlideMediaKind } from "@/types/studio-json";

export type RenderSafetyIssueSeverity = "warning" | "info";

export type RenderSafetyIssue = {
  code: string;
  severity: RenderSafetyIssueSeverity;
  field: "imageUrl" | "mediaUrl";
  title: string;
  description: string;
  url: string;
};

export type RenderSafetyGuideItem = {
  title: string;
  description: string;
};

const SHARE_LINK_HOSTS = [
  "drive.google.com",
  "docs.google.com",
  "dropbox.com",
  "www.dropbox.com",
  "onedrive.live.com",
];

function trimUrl(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isLikelyLocalPath(url: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(url) || /^\\\\/.test(url) || url.startsWith("file://");
}

function isAnimatedMediaKind(mediaKind?: SlideMediaKind): boolean {
  return mediaKind === "animated_image";
}

function isVideoMediaKind(mediaKind?: SlideMediaKind): boolean {
  return mediaKind === "video";
}

function isDirectVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}

function isDirectGifUrl(url: string): boolean {
  return /\.(gif)(\?|#|$)/i.test(url);
}

function isWebpUrl(url: string): boolean {
  return /\.(webp)(\?|#|$)/i.test(url);
}

function buildIssue(input: Omit<RenderSafetyIssue, "severity"> & { severity?: RenderSafetyIssueSeverity }): RenderSafetyIssue {
  return {
    severity: input.severity || "warning",
    ...input,
  };
}

export function getRenderSafetyGuideItems(): RenderSafetyGuideItem[] {
  return [
    {
      title: "움짤은 direct `gif` 또는 `mp4` 링크",
      description: "Giphy 페이지 주소나 `webp` 대신 실제 `giphy.gif` 또는 `mp4/webm` 파일 링크를 사용합니다.",
    },
    {
      title: "브라우저 임시 `blob:` 주소는 저장용 금지",
      description: "현재 탭에서는 보여도 서버 렌더러가 다시 읽지 못할 수 있으니 라이브러리에 저장하거나 직접 웹 링크를 사용합니다.",
    },
    {
      title: "로컬 경로 대신 업로드 또는 라이브러리",
      description: "`C:\\...`, `file://...` 같은 경로는 서버 렌더러가 접근할 수 없으므로 업로드 후 자산함에서 쓰는 방식으로 맞춥니다.",
    },
    {
      title: "공유 페이지 링크보다 실제 파일 링크",
      description: "Google Drive, Dropbox, Giphy 페이지처럼 HTML 문서를 반환하는 링크는 피하고, 실제 이미지/영상 파일 URL을 사용합니다.",
    },
  ];
}

export function getRenderSafetyGuideNotes(): string[] {
  return [
    "웹 `gif` 링크, 라이브러리 에셋, 업로드된 이미지/영상은 현재 렌더 스모크 테스트 기준으로 검증했습니다.",
    "반복 사용 자산은 data URL보다 라이브러리에 저장해 두는 편이 렌더 시간과 복원 안정성이 좋습니다.",
    "배경 영상/움짤 교체 후에는 확인본 렌더를 한 번 돌려 실제 서버 렌더 경로를 확인하는 편이 안전합니다.",
  ];
}

export function getRenderSafetyIssuesForSlide(slide: PreparedSlide): RenderSafetyIssue[] {
  const issues: RenderSafetyIssue[] = [];
  const imageUrl = trimUrl(slide.imageUrl);
  const mediaUrl = trimUrl(slide.mediaUrl);
  const mediaKind = slide.mediaKind;
  const entries = [
    { field: "imageUrl", url: imageUrl },
    { field: "mediaUrl", url: mediaUrl },
  ] satisfies Array<{ field: "imageUrl" | "mediaUrl"; url: string }>;

  for (const entry of entries.filter((item) => item.url.length > 0)) {
    const url = entry.url;
    if (url.startsWith("blob:")) {
      issues.push(
        buildIssue({
          code: "blob-url",
          field: entry.field,
          title: "임시 blob URL",
          description: "현재 브라우저 탭에서만 유효한 주소라 서버 렌더에서 다시 읽지 못할 수 있습니다. 라이브러리에 저장하거나 직접 웹 링크를 사용하세요.",
          url,
        }),
      );
      continue;
    }

    if (isLikelyLocalPath(url)) {
      issues.push(
        buildIssue({
          code: "local-path",
          field: entry.field,
          title: "로컬 경로 직접 입력",
          description: "서버 렌더러가 로컬 PC 경로에 직접 접근할 수 없습니다. 업로드 후 자산함에서 다시 선택하세요.",
          url,
        }),
      );
      continue;
    }

    if (url.startsWith("data:")) {
      issues.push(
        buildIssue({
          code: "data-url",
          severity: "info",
          field: entry.field,
          title: "임시 data URL 사용 중",
          description: "현재 렌더는 가능하지만 길이가 큰 자산은 느려질 수 있습니다. 반복 사용할 자산은 라이브러리에 저장해 두는 편이 안전합니다.",
          url,
        }),
      );
      continue;
    }

    if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) {
      issues.push(
        buildIssue({
          code: "unknown-path",
          field: entry.field,
          title: "직접 파일이 아닌 경로",
          description: "웹 URL 또는 `/public` 기준 경로만 안정적으로 렌더됩니다.",
          url,
        }),
      );
      continue;
    }

    let parsed: URL | null = null;
    try {
      parsed = new URL(url, "http://localhost");
    } catch {
      parsed = null;
    }

    const host = parsed?.hostname.toLowerCase() || "";
    const pathname = parsed?.pathname.toLowerCase() || url.toLowerCase();

    if (/giphy\.com$/i.test(host) && !/^media\./i.test(host) && pathname.includes("/gifs/")) {
      issues.push(
        buildIssue({
          code: "giphy-page-url",
          field: entry.field,
          title: "Giphy 페이지 링크",
          description: "페이지 주소는 HTML이라 직접 렌더 소스로 쓰기 어렵습니다. `media.giphy.com/.../giphy.gif` 같은 직접 파일 링크를 사용하세요.",
          url,
        }),
      );
    }

    if (isWebpUrl(url)) {
      issues.push(
        buildIssue({
          code: "webp-url",
          field: entry.field,
          title: "webp 링크",
          description: "일부 animated webp는 서버 렌더에서 디코드 실패가 날 수 있습니다. 가능하면 `gif` 또는 `mp4/webm` 직접 링크로 바꾸세요.",
          url,
        }),
      );
    }

    if (SHARE_LINK_HOSTS.includes(host)) {
      issues.push(
        buildIssue({
          code: "share-link",
          field: entry.field,
          title: "공유 링크 가능성",
          description: "공유 페이지는 실제 파일 대신 HTML을 반환할 수 있습니다. 직접 파일 다운로드 링크인지 확인하세요.",
          url,
        }),
      );
    }

    if (isAnimatedMediaKind(mediaKind) && !isDirectGifUrl(url) && !isDirectVideoUrl(url) && !url.startsWith("data:")) {
      issues.push(
        buildIssue({
          code: "animated-not-direct",
          field: entry.field,
          title: "움짤 소스 형식 확인 필요",
          description: "움짤은 `gif` 또는 `mp4/webm` 직접 링크일 때 가장 안정적입니다.",
          url,
        }),
      );
    }

    if (isVideoMediaKind(mediaKind) && !isDirectVideoUrl(url) && !url.startsWith("data:")) {
      issues.push(
        buildIssue({
          code: "video-not-direct",
          field: entry.field,
          title: "배경 영상 링크 형식 확인 필요",
          description: "배경 영상은 `mp4/webm/mov` 직접 파일 링크일 때 가장 안정적으로 렌더됩니다.",
          url,
        }),
      );
    }
  }

  return issues;
}
