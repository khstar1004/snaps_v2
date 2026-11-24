# Snaps SNS Platform Research Playbook

Last updated: 2026-05-12

이 문서는 `snaps`의 플랫폼별 생성 규칙을 보강하기 위한 조사 메모다. 목표는 "글자 수만 맞춘 변환"이 아니라, 각 SNS에서 자연스럽게 읽히는 감성, 구조, CTA, 금지 패턴을 생성 프롬프트에 직접 반영하는 것이다.

## 조사 기준

- 공식 문서가 있는 제약 조건은 공식 문서를 우선한다.
- 공식 문서가 작성 문법까지 충분히 설명하지 않는 플랫폼은, 운영 실무 가이드와 최근 분석 글을 보조 근거로 사용한다.
- 생성물에는 출처 URL을 넣지 않는다. 출처는 내부 플레이북의 근거로만 사용한다.
- 과장된 성과 수치, 알고리즘 단정, 미확인 API 기능은 생성하지 않는다.

## Threads

Sources:

- Meta, Threads launch: https://about.fb.com/ko/news/2023/07/instagram%EC%9D%B4-%ED%85%8D%EC%8A%A4%ED%8A%B8-%EA%B8%B0%EB%B0%98%EC%9D%98-%EC%83%88%EB%A1%9C%EC%9A%B4-%EC%86%8C%EC%85%9C-%EC%95%B1-%EC%8A%A4%EB%A0%88%EB%93%9Cthreads%EB%A5%BC/
- Meta, text attachments: https://about.fb.com/news/2025/09/attach-text-threads-posts-share-longer-perspectives/amp/

Platform grammar:

- 공개 대화, 답글, 인용 가능한 한 줄이 핵심이다.
- 기본 게시물은 500자 기준으로 끊어야 한다.
- 긴 맥락이 필요하면 본문 하나에 몰아넣지 말고 답글 체인처럼 나눈다.
- 해시태그는 커뮤니티 식별용 1개 이하로 제한한다.

Generation mapping:

- 첫 문장은 생각을 던지는 말투로 시작한다.
- 각 세그먼트는 주장 하나, 예시 하나, 질문 하나 중 하나만 담당한다.
- 말투는 한국어 반말 또는 부드러운 구어체를 기본으로 한다.
- 기업 보도자료식 종결, 해시태그 더미, 블로그 요약문을 금지한다.

## Instagram

Sources:

- Later, Instagram hashtag strategy in 2026: https://later.com/blog/ultimate-guide-to-using-instagram-hashtags/
- The Verge, Instagram hashtag spam limit: https://www.theverge.com/news/847739/instagram-hashtag-spam-limit

Platform grammar:

- 이미지를 먼저 보고, 캡션은 저장/공유/댓글 여부를 결정하는 보조 장치로 읽힌다.
- 첫 줄은 감정, 장면, 정체성, 저장 가치 중 하나를 바로 보여줘야 한다.
- 해시태그는 현재 5개 이하로 정밀하게 고른다.
- 저장률이 중요한 교육형/체크리스트형 콘텐츠는 캐러셀처럼 줄을 나눈다.

Generation mapping:

- "오늘 저장해둘", "이 장면에서 든 생각", "콘텐츠 만드는 사람이라면" 같은 첫 줄을 우선한다.
- 본문은 2-4개 포인트로 짧게 정리한다.
- CTA는 저장, 공유, 댓글 중 하나만 자연스럽게 쓴다.
- 장문의 설명문, 범용 태그 더미, 억지 감성어를 피한다.

## YouTube Shorts

Sources:

- YouTube Help, 3-minute Shorts: https://support.google.com/youtube/answer/15424877?hl=en
- YouTube Help, hashtags: https://support.google.com/youtube/answer/6390658?hl=en-EN
- YouTube Help, description tips: https://support.google.com/youtube/answer/12948449?hl=en

Platform grammar:

- 제목, 설명, 해시태그가 검색과 클릭 판단의 핵심 메타데이터다.
- Shorts는 3분 이하 세로/정방형 영상 문맥을 전제로 한다.
- 설명 첫 줄은 영상의 약속과 검색 키워드를 먼저 보여줘야 한다.
- 해시태그는 관련성 중심으로 적게 쓴다.

Generation mapping:

- 결과/질문/핵심 키워드가 제목 앞부분에 오도록 한다.
- 설명은 "무엇을 보여주는지", "누구에게 필요한지", "끝까지 보면 얻는 것"을 짧게 담는다.
- 일반 태그 남발보다 제목과 설명의 명확성을 우선한다.

## TikTok

Sources:

- TikTok For Business, Creative Center: https://ads.us.tiktok.com/help/article/creative-center?lang=en
- TikTok For Business, Creative Insights: https://ads.us.tiktok.com/help/article/creative-insights?lang=en

Platform grammar:

- 영상 훅이 우선이고 캡션은 훅을 보강한다.
- 네이티브한 제작자 말투, 빠른 템포, 댓글 유도가 중요하다.
- 트렌드, 키워드, 사운드, 패턴은 Creative Center에서 탐색하는 운용 요소다.
- 해시태그는 영상 내용, 음성, 자막 키워드와 맞아야 한다.

Generation mapping:

- "요즘", "POV", "이거 모르면" 같은 훅은 내용에 맞을 때만 쓴다.
- 교육형은 짧은 검색 설명을 붙이고, 예능형은 훅과 댓글 프롬프트만 남긴다.
- 광고 문구, 범용 바이럴 태그, 너무 긴 설명을 피한다.

## Xiaohongshu

Sources:

- Newrank, Xiaohongshu note exposure guide: https://a.newrank.cn/trade/news/7420
- 人人都是产品经理, Xiaohongshu operation guide: https://www.woshipm.com/operate/5859562.html

Platform grammar:

- 샤오홍슈는 제목, 커버, 태그가 클릭과 추천 매칭의 첫 관문이다.
- "저장할 만한 노트", "실사용 팁", "피해야 할 점", "구체적 장면"이 자연스럽다.
- 제목은 20자 안팎의 짧은 결과/문제/대상 중심으로 잡는다.
- 태그는 대상, 장면, 카테고리, 롱테일 검색어를 섞는다.

Generation mapping:

- `제목 -> 왜 저장해야 하는지 -> 번호형 팁 -> 태그` 구조를 기본으로 한다.
- 추상적 장점은 생활 장면으로 번역한다.
- "종초/피해야 할 점" 감성은 쓰되, 검증 불가한 효과 과장은 금지한다.
- 한국어 인스타 캡션을 그대로 번역한 느낌을 피한다.

## Naver Blog

Sources:

- Naver Search Help, blog exposure: https://help.naver.com/service/5626/contents/22924?lang=ko&osType=COMMONOS

Platform grammar:

- 검색 의도를 가진 독자가 들어온다.
- 제목, 도입, 목차, 소제목, 요약, 태그가 정보형 글의 기본 골격이다.
- 게시글 등록/수정 후 검색 반영에는 시간이 걸릴 수 있다.
- 과도한 키워드 반복, 정책 위반, 품질 낮은 콘텐츠는 노출에 불리하다.

Generation mapping:

- 제목은 검색 의도를 자연스럽게 포함한다.
- 도입부에서 "무엇을 해결하는 글인지" 먼저 말한다.
- 본문은 섹션별로 구조화하고, 마지막에 요약/체크리스트를 둔다.
- 즉시 상위 노출 같은 미확인 약속은 금지한다.

## Naver Cafe

Sources:

- Naver Cafe App Store listing: https://apps.apple.com/kr/app/%EB%84%A4%EC%9D%B4%EB%B2%84-%EC%B9%B4%ED%8E%98-naver-cafe/id420615104

Platform grammar:

- 카페는 관심사 게시판 기반의 커뮤니티다.
- 최신글, 게시판, 인기글, 좋아요, 이웃 이야기가 핵심 경험이다.
- 독자는 광고보다 회원의 맥락, 질문, 경험 공유에 반응한다.
- 게시판 분위기와 주제 적합성을 먼저 맞춰야 한다.

Generation mapping:

- 제목은 게시판에서 눌러볼 만한 질문형/정보형으로 쓴다.
- 본문은 "왜 이 게시판에 올리는지" 맥락을 먼저 준다.
- 마지막에는 회원 경험이나 의견을 묻는다.
- 판매글처럼 보이는 문구, 과한 감탄, 외부 유도 중심 문구를 줄인다.

## KakaoTalk Channel

Sources:

- KakaoTalk Channel guide: https://business.kakao.com/guide.html?ver=f7cd0aa
- Kakao Business message guide: https://kakaobusiness.gitbook.io/main/channel/run/message

Platform grammar:

- 카카오톡은 피드가 아니라 메신저다.
- 짧은 제목, 본문, 버튼/링크카드가 중요하다.
- 광고성 메시지는 광고 표시와 수신거부 등 규정 준수가 필요하다.
- 기본 텍스트형은 짧은 카피 제약이 있으므로 장문 SNS 캡션처럼 쓰면 안 된다.

Generation mapping:

- "오늘 확인하면 좋은 안내입니다"처럼 수신자 기준의 이익을 먼저 말한다.
- 본문은 한 가지 가치와 한 가지 근거만 담는다.
- CTA는 버튼 문구처럼 짧게 쓴다.
- 해시태그, 장문 감성글, 광고성 은폐를 금지한다.

## LinkedIn

Sources:

- LinkedIn Help, post updates: https://www.linkedin.com/help/linkedin/answer/a528176
- LinkedIn Pages best practices: https://business.linkedin.com/advertise/linkedin-pages/best-practices

Platform grammar:

- 표준 게시물은 3000자 제한 안에서 전문적 판단과 경험을 전달한다.
- 독자는 "내 일에 적용할 수 있는가"를 기준으로 읽는다.
- 페이지 운영에서는 꾸준한 게시, 이미지/영상/문서, 멘션, 해시태그, 타겟팅이 활용된다.
- 2-3개 정도의 관련 전문 해시태그가 자연스럽다.

Generation mapping:

- 첫 줄은 업무 관찰, 실패에서 배운 점, 의사결정 기준으로 시작한다.
- 본문은 맥락, 교훈, 실무 적용으로 이어진다.
- 근거 없는 성과 수치, 동기부여 문구, 과한 이모지는 피한다.

## X

Sources:

- X developer docs, character counting: https://docs.x.com/fundamentals/counting-characters
- X Business, organic best practices: https://business.x.com/en/basics/organic-best-practices

Platform grammar:

- 기본 게시물은 280자 안에서 한 가지 주장을 전달한다.
- X는 간결하고 대화적인 문장을 권장하며, 해시태그 사용은 최소화하는 편이 자연스럽다.
- URL, 이모지, CJK 문자는 단순 글자 수와 다르게 계산될 수 있다.

Generation mapping:

- 배경 설명을 버리고 주장부터 시작한다.
- "문제는 A가 아니라 B다"처럼 대비형 문장이 잘 맞는다.
- CTA는 대부분 생략하고, 토론 목적일 때만 짧은 질문을 붙인다.
- 기업 홍보문, 해시태그 더미, 장문 요약을 피한다.

