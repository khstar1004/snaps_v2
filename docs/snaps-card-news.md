# snaps 카드뉴스 제작 자동화

## 구조

카드뉴스는 외부 엔진 없이 snaps 내부에서 처리한다. Pixelle-Video나 Shorts-Maker처럼 별도 컨테이너를 띄우지 않는다.

- `libraries/nestjs-libraries/src/snaps/cardnews/card-news.service.ts`: 원문을 슬라이드 덱 대본으로 변환 (`AI_PROVIDER` 설정에 따라 Ollama 또는 DeepSeek 사용)
- `libraries/nestjs-libraries/src/snaps/cardnews/card-news-renderer.service.ts`: 덱을 1080x1350 PNG로 렌더링
- `libraries/nestjs-libraries/src/snaps/cardnews/card-news-variant.builder.ts`: 렌더된 슬라이드를 플랫폼별 발행 변형으로 변환
- `apps/frontend/src/components/snaps/snaps-card-news-workspace.tsx`: 콘텐츠 미디어 화면의 카드뉴스 작업대

## 렌더링 방식

`sharp`로 SVG를 PNG로 변환한다. `canvas`(node-canvas)는 시스템 cairo/pango 네이티브 빌드가 필요하고 Node/OS 조합마다 prebuilt 바이너리가 없어서(Node 24 Windows 개발 환경에서 빌드 실패, Docker 이미지에도 추가 apt 패키지 필요) 사용하지 않는다. `sharp`는 libvips를 정적 링크로 포함하므로 `sharp`가 도는 곳이면 어디서나 동작한다.

**폰트는 fontconfig에서 온다. SVG 임베드가 아니다.**

이전에는 Pretendard 3종을 base64 `@font-face`로 SVG에 인라인했지만, sharp 내부의 librsvg는 `@font-face`를 무시한다. 측정 결과:

| 환경 | 임베드 | 렌더된 어두운 픽셀 |
| --- | --- | --- |
| 시스템 폰트 0개 컨테이너 | 있음 | 324 (두부) |
| 시스템 폰트 0개 컨테이너 | 없음 | 324 (두부) |
| fontconfig로 Pretendard 설치 | 있음 | 6604 (정상) |
| fontconfig로 Pretendard 설치 | 없음 | 6604 (정상) |

임베드 유무와 무관하게 결과가 같고, 실제 렌더러로 같은 덱을 양쪽 방식으로 렌더했을 때 PNG가 **바이트 단위로 동일**했다. 반면 임베드는 슬라이드마다 약 6.3MB의 base64를 SVG에 더했다(6.29MB → 1.1KB). 그래서 임베드는 제거했다.

즉 한글 렌더링은 **전적으로 fontconfig에 설치된 시스템 폰트에 의존한다.** 폰트 파일은 `cardnews/assets/fonts/`에 있고 `Dockerfile.dev`가 `fontconfig` 설치 후 `/usr/share/fonts/truetype/pretendard/`로 복사하고 `fc-cache -f`를 돌린다. **이 블록을 지우면 모든 카드뉴스 슬라이드가 조용히 두부로 깨진다.**

### 낡은 이미지 주의

폰트 블록이 추가되기 전에 만든 이미지는 이 폰트가 없다. 실제로 이 머신에 남아 있던 `snaps-app:local`을 확인해보니 fontconfig 자체가 없고 폰트가 0개였다 — 그 이미지로 카드뉴스를 돌리면 전부 두부가 된다. `Dockerfile.dev`를 고쳐도 **이미지를 다시 빌드해야** 반영된다.

```bash
docker compose build snaps
```

### Pretendard만으로는 부족하다 — 한자와 이모지는 없다

번들 폰트의 cmap을 직접 읽어 확인한 결과:

| 문자 | Pretendard |
| --- | --- |
| 라틴 `A` | 있음 |
| 한글 `가` | 있음 |
| 가나 `あ` `カ` | 있음 |
| 말줄임표 `…` | 있음 |
| **한자 `一` `换`** | **없음** |
| **이모지 `😊`** | **없음** |

이미지에는 다른 폰트가 없다. 그래서 **샤오홍슈용 중국어 덱**(샤오홍슈는 snaps가 렌더링하는 열 개 채널 중 하나다)과 **이모지가 들어간 캡션**이 전부 두부로 나왔다. 한글만 확인하던 기존 프로브(`hasUsableKoreanFont`)는 이걸 잡지 못한다 — 한글은 멀쩡하기 때문이다.

`Dockerfile.dev`가 이제 `fonts-noto-cjk`(한자)와 `fonts-noto-color-emoji`(이모지)를 함께 설치한다. 둘이 합쳐 약 70MB가 늘지만, 그게 글자가 읽히는 값이다. Pretendard가 커버하는 범위는 여전히 Pretendard가 우선한다.

**폭 추정 작업이 이걸 가린 이유**: 폭 상수를 맞추는 측정은 시스템 폰트가 깔린 Windows 호스트에서 돌렸다. 거기서는 한자와 이모지가 멀쩡히 그려지므로 폭만 틀렸을 뿐 두부는 보이지 않았다. 컨테이너에서는 폭이 맞는 두부 상자가 그려지고 있었던 셈이다.

### 패밀리 이름은 fontconfig 등록명과 같아야 한다

SVG의 `font-family`는 fontconfig가 OTF에서 읽어내는 패밀리명(`Pretendard`)과 정확히 같아야 한다. 예전에는 `Snaps Pretendard`라는 별칭을 썼는데, 이 이름은 아무것도 매칭하지 않아서 `fc-match`가 DejaVu Sans로 떨어졌다. 한글이 멀쩡해 보였던 건 fontconfig가 **글리프 단위로** Hangul을 가진 유일한 폰트(Pretendard)를 주워왔기 때문이고, 실제로는 두 가지가 망가져 있었다.

| 측정 (컨테이너, 잉크 픽셀) | `Snaps Pretendard` | `Pretendard` |
| --- | --- | --- |
| 한글 | 4082 | 4082 (동일 — 글리프 폴백) |
| 라틴 | 7412 (DejaVu) | 6615 (Pretendard) |
| 라틴 weight 700 | 4763 | 3870 |
| 라틴 weight 800 | 4763 (700과 동일) | 4360 (구분됨) |

즉 라틴·숫자가 DejaVu로 렌더되고, 제목에 쓰는 ExtraBold(800)가 Bold(700)와 똑같이 나왔다. 패밀리명을 `Pretendard`로 맞추면서 둘 다 해결됐다.

### 런타임 감지

조용히 깨지는 게 가장 나쁜 실패 방식이라, 렌더러가 프로세스당 한 번 한글 글리프를 실제로 그려보고 잉크 양을 잰다(`hasUsableKoreanFont`). 폰트가 없으면 로그로 경고하고 재빌드를 안내한다. fontconfig에 묻지 않고 결과물을 직접 재기 때문에, `fc-list`가 없고 OS 폰트를 쓰는 개발 머신에서도 오탐이 나지 않는다.

측정한 값은 아래와 같고 임계값 800은 그 사이에 둔다.

| 환경 | 프로브 잉크 |
| --- | --- |
| 폰트 없는 컨테이너 | 108 |
| fontconfig에 Pretendard 설치 | 3077 |

SVG에는 실제 글리프 메트릭이 없으므로 줄바꿈은 문자 폭 추정으로 계산한다. 추정 계수는 번들된 Pretendard를 실측해서 정했다. 측정은 `"<문자열>H"`와 `"H"`를 각각 렌더해 잉크 오른쪽 끝의 차이를 취하는 방식이다(마지막 글자의 우측 여백이 상쇄되어 실제 advance 폭이 나온다).

62px 기준 실측 em 비율:

| 문자 | 실측 | 적용 계수 |
| --- | --- | --- |
| 한글 | 0.865 | 0.92 |
| 한글 문장부호 | 0.818 | 0.92 |
| 공백 | 0.252 | 0.30 |
| `W` / `M` / `m` / `w` / `O` | 0.915 / 0.853 / 0.834 / 0.777 / 0.726 | 0.95 |
| 대문자 평균 | 0.594 | 0.70 |
| 숫자 | 0.582 | 0.70 |
| 소문자 평균 | 0.469 | 0.55 |
| ASCII 문장부호 | 0.347 | 0.55 |
| `i` / `l` / `I` / `t` | 0.218 / 0.218 / 0.244 / 0.340 | 0.38 |

문자 간 폭 편차가 4배(`W` 0.915 vs `i` 0.218)라 단일 상수로는 안전과 효율을 동시에 만족할 수 없다. 예전에는 전각 1.0 / 그 외 0.55 두 값만 썼는데, 한글과 공백은 과대평가해 필요보다 일찍 줄을 바꾸고 대문자·숫자·특히 `M`/`W`는 과소평가해서 **캡스가 많은 제목이 오른쪽 여백을 실제로 넘어갔다.** 각 계수는 해당 그룹의 실측 최댓값 바로 위에 둔다.

줄 수는 1350px 캔버스 기준으로 제한한다. 상한은 제목 6줄, 본문 6줄, 해시태그 2줄이지만 **실제 줄 수는 템플릿의 글자 크기에서 계산한다**(`lineBudget()`). 6/6은 editorial의 제목 62px·본문 40px 기준으로 나온 값이라, bold의 78px 제목에 그대로 쓰면 본문이 슬라이드 밖으로 밀려난다. 본문 슬라이드는 y=320에서 시작해 y=1150(해시태그·푸터 밴드 위)까지만 쓰고, 제목이 그 구간의 55%를 넘지 않도록 한 뒤 남은 높이로 본문 줄 수를 정한다.

## 템플릿

작업대가 제공하는 3개 템플릿은 `CARD_NEWS_TEMPLATE_STYLES`가 실제로 다르게 렌더한다. 덱은 처음부터 `templateId`를 실어 날랐지만 렌더러가 그 값을 읽지 않던 시기가 있었고, 그때는 세 템플릿이 **바이트 단위로 같은 PNG**를 냈다.

| 템플릿 | 배경 (`gradient`) | 강조 (`accent`) | 제목 크기(표지/본문) |
| --- | --- | --- | --- |
| `editorial` | `cover-and-closing` — 표지·마무리만 브랜드 그라디언트 | `top-rule` — 상단 룰 14px | 76 / 62 |
| `bold` | `all` — 모든 슬라이드 그라디언트 | `none` | 96 / 78 |
| `minimal` | `none` — 그라디언트 없이 `#FAFAF9` | `left-bar` — 좌측 바 10px | 64 / 52 |

알 수 없는 `templateId`는 `editorial`로 떨어진다. 해시태그 색은 배경 명암을 따른다 — 흰색으로 고정하면 배경을 계속 밝게 유지하는 `minimal`의 마지막 슬라이드에서 보이지 않는다.

## 슬라이드 규칙

모델 응답과 caller가 보낸 덱 모두에 적용되는 규칙이다.

**말머리가 숫자면 슬라이드 위치를 따른다.** 푸터는 위치를 찍고(`3 / 6`) 말머리도 위치를 기본값으로 쓰므로 둘은 일치하도록 되어 있다. 그런데 모델은 표지를 번호에서 빼는 식으로 자기 번호를 매기고, 그 값이 그대로 인쇄돼 **한 장에 `02`와 `3 / 6`이 함께 찍히는** 덱이 나왔다. 숫자로만 된 말머리는 슬라이드 번호로 보고 위치에 맞추고, `환절기 건강`·`마무리` 같은 텍스트 라벨은 모델이 쓴 대로 둔다.

**앞 슬라이드에 나온 문장은 지운다.** 라이브 DeepSeek 실행에서 6장 중 3장이 `감기 예방에 가장 효과적인 방법 중 하나입니다.`로 끝났다(둘은 완전히 동일, 하나는 한 단어만 다름). 프롬프트에 반복 금지 규칙을 넣었지만 프롬프트는 요청일 뿐이므로, **완전히 일치하는 문장**만 결정적으로 제거한다. 근사 중복은 판단의 영역이라 건드리지 않고, 본문 전체가 중복이면 슬라이드를 비우지 않고 그대로 둔다 — 반복보다 빈 슬라이드가 나쁘다.

## 덱을 직접 보내는 경우

`POST /snaps/card-news/generate`는 `deck`을 그대로 렌더하므로 `SnapsCardNewsService`의 정규화를 **통째로 건너뛴다**. 그래서 검증이 이 라우트에 따로 있다.

- `deck.slides`는 배열이어야 하고 각 원소는 객체여야 한다. 문자열 `'nope'`은 `.length`가 4라 예전 검사(`slides?.length`)를 통과해 렌더러에서 500이 났고, 원소가 문자열이면 **빈 슬라이드를 렌더해 미디어 라이브러리에 업로드**했다.
- 슬라이드 수는 `SNAPS_CARD_NEWS_MAX_SLIDES`(10)까지다. 한 장이 PNG 렌더 + 업로드 한 번이라 상한이 없으면 본문 크기 제한만이 유일한 방어선이 된다.
- `templateId`는 **자기 속성 검사**로 해석한다. 평범한 객체 조회는 `'__proto__'`에 `Object.prototype`을, `'constructor'`에 함수를 돌려주는데 둘 다 truthy라 `|| editorial` 폴백이 걸리지 않았다. 그때도 렌더는 성공하고 200을 반환했지만 SVG가 1097바이트에서 773바이트로 줄고 `font-size="undefined"`가 들어갔다. 해석 결과는 응답 덱과 활동 기록에도 반영되므로, **실제로 그려진 템플릿**이 기록된다.

## 플랫폼별 제한

카드뉴스는 캡션 하나를 8개 플랫폼에 동시에 보내는데 플랫폼별 제한이 크게 다르다. `card-news-variant.builder.ts`는 `snapsPlatformRules`를 기준으로 플랫폼마다 캡션 길이·해시태그 수·**첨부 개수**를 잘라낸다.

| 플랫폼 | maxLength | hashtagLimit | mediaLimit |
| --- | --- | --- | --- |
| instagram | 2200 | 5 | 10 |
| threads | 1500 | 1 | (미지정) |
| x | 280 | 1 | 4 |
| linkedin | 3000 | 3 | (미지정) |
| naver-blog | 20000 | 10 | (미지정) |
| naver-cafe | 10000 | 5 | (미지정) |
| xiaohongshu | 1000 | 8 | (미지정) |
| kakao-talk | 1000 | (미지정, 기본 20) | (미지정) |

`x`가 가장 빡빡하다(280자·해시태그 1개·첨부 4장). 클램프 없이 공용 캡션을 그대로 보내면 프로바이더가 거부하는 게시물이 만들어진다.

**세 클램프는 모두 경고로 보고한다.** 클램프는 게시물을 유효하게 만들지만 운영자가 쓴 것을 조용히 고쳐 쓰기도 한다 — 431자 캡션은 X에서 280자로 **문장 중간에서** 잘리고 태그 20개 중 19개가 사라지는데, 오랫동안 첨부 트림만 보고됐다. 캡션과 해시태그는 플랫폼마다 한 줄씩 경고를 내면 8개 채널 × 2필드로 패널이 묻히므로 필드별로 한 줄에 집계한다(`The 431-character caption ... was cut for: X 280 characters.`). 전부 들어맞으면 경고는 나오지 않는다 — 매번 뜨는 경고는 무시하게 된다.

**첨부 개수는 캡션·해시태그와 달리 오래 누락돼 있었다.** 10장짜리 덱을 X에 예약하면 프로바이더가 게시 시점에 거부했다. `mediaLimit`은 한도가 명확한 플랫폼에만 지정하고, 확인되지 않은 플랫폼은 **비워 두어 자르지 않는다** — 추측으로 잘라내는 것보다 기존 동작을 유지하는 편이 안전하다. 잘라낸 경우에는 경고를 만들어 예약 응답에 실어 보내므로, 작업대가 "X는 첨부 4장까지라 10장에서 4장으로 줄였다"고 표시한다. 카드뉴스 빌더는 자기 흐름만 덮으므로, 모든 예약 경로가 지나는 `buildPostValues`에도 같은 `mediaLimit`을 읽는 백스톱을 두었다. `/snaps/schedule-variants`로 변형을 직접 보내는 호출자도 한도를 넘기지 못한다.

## 대본 폴백

LLM 호출이 실패하면 `fallbackDeck()`이 결정론적으로 덱을 만든다. 이때 문장은 **읽기 순서를 유지한 채 연속 분할**한다. 라운드로빈으로 나누면 8문장·4슬라이드에서 `1,5 / 2,6 / 3,7 / 4,8`이 되어 서사가 깨진다.

`slideCount`는 목표치가 아니라 상한이다. 원문 문장이 부족하면 같은 문장을 여러 슬라이드에 복제하지 않고 더 짧은 덱을 반환한다.

덱은 **어느 경로가 만들었는지** `provider`로 밝힌다(`ollama` | `rule-fallback`) — 변환 결과가 이미 쓰던 규약이다. 서비스는 두 경우 모두 200을 반환하므로, 이 신호가 없을 때는 작업대가 둘 다 "생성했습니다"로 알렸고 라이브 스모크는 제목이 `포인트 N`인지 정규식으로 추측해야 했다. 모델 슬라이드가 전부 비어 있어 조기 반환을 타는 경우도 슬라이드가 템플릿 출력이므로 `rule-fallback`이다. 작업대는 폴백일 때 경고 토스트로 알리고, 라이브 스모크는 라벨을 직접 단언하되 제목 검사를 교차 확인으로 남겨 둔다 — 라벨이 실제 출력과 어긋나면 실패한다.

## snaps API

- `POST /snaps/card-news/script`: 원문 → 덱 대본
- `POST /snaps/card-news/generate`: 덱 → PNG 렌더링 + 미디어 라이브러리 업로드
- `POST /snaps/card-news/attach-to-draft`: 렌더된 슬라이드를 초안/예약 게시물에 첨부

`/generate`는 `deck`을 넘기면 그 덱을 그대로 렌더링하고, 없으면 `request`로 대본부터 만든다. 사용자가 대본을 고친 뒤 다시 렌더링할 때 이 경로를 쓴다.

응답의 `media[i]`는 `deck.slides[i]`에 대응한다. 캐러셀은 순서가 중요하므로 프론트엔드는 미리보기와 첨부 payload 모두 이 배열 순서를 그대로 쓴다(파일명 정렬 같은 별도 정렬을 넣지 않는다).

## 에이전트 연동

snaps 에이전트에 "카드뉴스로 만들어줘"라고 하면 `SnapsCommandPlannerService`가 `includeCardNews`를 켜고 덱 **대본까지만** 준비한다. 이미지 렌더링은 실제 미디어를 조직 라이브러리에 업로드하므로 오퍼레이터 확인이 필요한 별도 단계로 남긴다. 쇼츠가 `generateVideo` 플래그 없이는 대본만 만드는 것과 같은 원칙이다.

에이전트 결과의 `카드뉴스 작업` 버튼은 덱을 `localStorage`의 `snaps.cardnews.handoff.v1` 키에 넣고 콘텐츠 미디어 화면으로 이동한다. 카드뉴스 작업대가 이 값을 읽어 덱·톤·원문·템플릿·브랜드 컬러·예약 설정을 복원하고 키를 즉시 지운다.

## 검증

```bash
SNAPS_DEEPSEEK_CONFIRM=live npm run verify:snaps:cardnews-deepseek
```

`AI_PROVIDER=deepseek`와 `DEEPSEEK_API_KEY` 외에 **`SNAPS_DEEPSEEK_CONFIRM=live`가 필요하다.** 이 스모크는 매 실행마다 DeepSeek API 크레딧을 쓰므로, 저장소의 다른 라이브 스모크(`SNAPS_RUNTIME_CONFIRM`, `SNAPS_NAVER_CAFE_CONFIRM`)와 같은 명시적 확인 게이트를 둔다 — `.env`에 키가 있다는 것만으로 과금이 시작되면 안 된다. `verify:snaps:final-guards`가 이 게이트가 살아 있는지 검증한다. 3개 템플릿(editorial/bold/minimal) 각각에 대해 대본 생성 → PNG 렌더링 → 발행 변형 빌드까지 확인하고 결과 이미지를 `tmp/cardnews-deepseek-smoke/`에 남긴다. 변형 빌드 단계에서는 플랫폼별 클램프도 함께 검증한다 — 캡션 길이, 해시태그 수, 첨부 개수. 6장짜리 실제 덱이므로 X는 4장으로 잘려야 하고, 그 값이 `snapsPlatformRules.x.mediaLimit`와 정확히 일치하는지 확인한다. 이 단언들이 빠지면 스모크가 "API가 응답했다" 수준으로 얕아지므로 정적 검증이 그 존재를 확인한다.

단위 테스트는 `libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts`의 다음 블록에 있다.

- `SnapsCardNewsService fallback deck`: 문장 순서 보존, 원문이 짧을 때 중복 없는 짧은 덱
- `SnapsCardNewsRendererService`: 캔버스 밖으로 넘치지 않는 줄 수 제한, SVG 메타문자 입력 시 정상 PNG
- `buildSnapsCardNewsVariants`: 플랫폼별 캡션·해시태그 클램프
- `SnapsCommandPlannerService card news routing`: 에이전트 명령에서 덱 생성 여부
