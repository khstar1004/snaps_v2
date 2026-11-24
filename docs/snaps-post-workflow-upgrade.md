# 게시 워크플로우 업스트림 업그레이드 (v1.0.2 → v1.0.4)

## 현재 상태

`apps/orchestrator/src/workflows/post-workflows/`에 v1.0.1 ~ v1.0.4가 있고, **운영에서 실행되는 것은 여전히 v1.0.2**다.

버전 이름을 문자열로 지정하는 곳이 **두 군데** 있다. 둘 다 바꿔야 한다.

```
apps/orchestrator/src/activities/post.activity.ts:79
  searchForMissingThreeHoursPosts() -> signalWithStart('postWorkflowV102', ...)   // 누락 게시물 복구 스윕

libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts:709
  -> workflow.start('postWorkflowV102', ...)                                      // 일반 예약/발행 경로
```

한 곳만 바꾸면 일반 발행은 v1.0.2, 복구 스윕만 새 버전으로 도는 어중간한 상태가 된다.

v1.0.3/v1.0.4는 `workflows/index.ts`에 등록만 되어 있다. Temporal은 실행 중인 워크플로우를 시작 당시 버전에 고정하므로, 워크플로우 타입을 추가로 등록하는 것 자체는 동작을 바꾸지 않는다. 위 두 문자열을 바꾸는 것이 유일하게 동작을 바꾸는 단계이고, **라이브 Temporal 환경에서 검증한 뒤에 해야 한다.**

## 계보 확인

로컬 v1.0.2는 업스트림 `gitroomhq/postiz-app`의 v1.0.2와 **바이트 단위로 동일**하다(개행 정규화 후 diff 0줄). snaps는 이 워크플로우를 수정한 적이 없다. 따라서 상위 버전은 병합이 아니라 그대로 복사하면 된다. v1.0.3/v1.0.4도 업스트림 파일을 그대로 가져왔다.

## 각 버전이 고치는 것

### v1.0.3 — 조용한 조기 종료 3건에 ERROR 기록

v1.0.2는 아래 상황에서 상태를 남기지 않고 그냥 `return` 했다. 게시물은 이전 상태 그대로 남고 `Errors` 테이블에도 아무 기록이 없어서, 운영자 입장에서는 "발행도 안 되고 실패도 안 한" 게시물이 된다.

- `Already posted`
- `Refresh channel needed`
- `Channel disabled`

v1.0.3은 세 경우 모두 `changeState(..., 'ERROR', ...)`를 호출한다. `changeState`는 `posts.repository.ts`에서 `Errors` 행까지 같이 쓰므로, 관리자 오류 목록에 바로 나타난다.

### v1.0.4 — `No Post` 케이스 분리

v1.0.3까지는 `if (!post || (!postNow && post.state !== 'QUEUE'))`로 두 조건이 묶여 있어서, 게시물 자체가 없는 경우도 `Already posted`로 기록됐다. v1.0.4는 이를 분리해 `No Post`를 별도 오류로 남긴다.

두 버전 모두 신규 액티비티 없이 기존 `changeState`만 쓴다. 그래서 여기까지가 추가 작업 없이 포팅 가능한 경계다.

## 여기서 멈춘 이유

### v1.0.5 — 반복 게시물 발행 시각을 바꾸는 변경이 딸려 온다

v1.0.5는 신규 `getPost` 액티비티를 쓴다(조기 종료 판단을 위해 전체 목록 대신 게시물 1건만 조회). 액티비티 추가 자체는 어렵지 않다. 업스트림 `getPost`가 참조하는 구독 가드(`STRIPE_SECRET_KEY` → `getSubscription`)는 **로컬 `getPostsList`에 이미 동일하게 존재**하므로 새로 끌어들이는 결합이 아니다.

문제는 업스트림 `getPost`가 마지막에 `reanchorInterval(post)`을 거친다는 점이다. 이 헬퍼는 `intervalInDays`가 설정된 반복 게시물이 유예 시간(`REANCHOR_GRACE_MS`)보다 늦어졌을 때 `publishDate`를 다음 주기 경계로 옮긴다. 즉 **반복 게시물이 실제로 언제 발행되는지가 달라진다.**

로컬 스키마에 `intervalInDays`가 있고 `posts.repository.ts`가 이미 이 필드로 반복 일정을 계산하고 있으므로, 이 변경은 무동작이 아니라 실제 고객 예약 게시물에 영향을 준다. 라이브 Temporal과 실제 예약 데이터 없이는 검증할 수 없어 포팅하지 않았다.

### v1.0.6 이상

**v1.0.6**은 340줄이 바뀐다. 업스트림이 읽기 전용 상태 조회와 되돌릴 수 없는 발행 변경을 서로 다른 큐/타임아웃으로 분리한 변경으로 보이며, 별도 검토가 필요하다. 업스트림은 현재 **v1.1.2**까지 있다.

## 활성화 절차 (라이브 환경 필요)

1. Temporal과 워커가 뜬 환경에서 위 **두 곳**(`post.activity.ts`, `posts.service.ts`)의 `'postWorkflowV102'`를 `'postWorkflowV104'`로 함께 바꾼다.
2. 예약 게시물이 정상 발행되는지, 그리고 위 4가지 조기 종료 상황에서 `Errors` 행이 생기는지 확인한다.
3. 진행 중이던 기존 워크플로우는 계속 v1.0.2로 완료된다. 롤백은 문자열을 되돌리면 된다.

## 검증

`npm run build:orchestrator`로 컴파일을 확인했다. 실제 실행 검증은 라이브 Temporal이 필요하므로 이 문서 기준으로는 수행하지 않았다.

라이브 없이 확인 가능한 항목 하나는 해소했다. 등록만 되고 디스패치되지 않는 버전은 "워커가 등록하지 않은 액티비티를 호출한다"는 실패가 **전환하는 사람이 운영 환경에서 돌릴 때까지** 드러나지 않는다. 네 버전(v1.0.1~v1.0.4)이 프록시하는 이름을 `post.activity.ts`의 `@ActivityMethod()` 16개와 대조한 결과 누락은 없다. 이 대조는 정적 검증기 가드로 고정해 두었으므로, upstream에서 새 버전을 포팅하면서 새 액티비티를 딸려 오면 포팅 시점에 실패한다.
