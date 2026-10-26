# StartupOS Firebase 이전 — startupos-6b8d4

## 배포 관리 · 2026-10-26

- Firebase 운영 프로젝트: `startupos-6b8d4`, 운영 URL: https://startupos-6b8d4.web.app/.
- 기존 Firebase 초기 배포는 운영자가 완료함. 운영자 접근 제한과 데이터 구조는 유지함.
- GitHub Workload Identity 연결은 운영자가 완료함. `startupos-github` 풀과 `startup-os` 제공자, `startupos-github-deploy` 전용 계정을 사용함.
- GitHub `main`의 UI 변경은 `.github/workflows/firebase-ui.yml`에서 테스트 후 `firebase.ui.json`과 `web-index.cjs`를 사용해 `startupWeb`·Hosting만 배포함. API는 기존 함수로 연결하고 UI 배포에 API 비밀값·작업 트리거 권한을 요구하지 않음. 성공 여부는 해당 커밋의 Actions 결과와 운영 URL로 확인함.
- 런타임 OpenAI 키는 기존 Secret Manager 구성을 유지함. 배포 소스·워크플로·로그에 비밀키를 포함하지 않음.
- 로컬/Cloud Shell의 수동 UI 갱신은 `bash firebase/deploy-ui.sh`. 초기 설치 스크립트는 신규 설치용이며 UI 갱신 시 실행할 필요가 없음.

## 구현한 구성

- Hosting에는 로그인 화면만 정적으로 공개함. 나머지 StartupOS 화면·자산은 Firebase 인증 세션 쿠키와 운영자 허용 목록 검사 후 Cloud Functions에서 제공함.
- 운영자는 `startuposAccess/{소문자 이메일}`의 `enabled: true`로 지정함. 검증된 이메일만 허용하고 사용자 문서에서 권한을 직접 만들 수 없음. 이 문서는 Admin SDK로만 관리함.
- 계정별 프로젝트·버전 이력은 기존 구조와 동일하며, Firebase 전용 보안 규칙에서 운영자 접근도 확인함. 기존 일반 Firestore 규칙 파일은 보존함.
- 긴 Build·코드 수정·Idea Note·검증·앱 배포 요청은 `/api/jobs`로 접수함. Firestore 트리거가 탭과 독립적으로 현재 요청 한 건을 처리함. **전체 AutoBuild 반복은 여전히 열린 탭의 실행기가 다음 단계를 지시함.**
- 요청 키와 요청 해시로 중복 접수를 방지함. 브라우저는 키를 먼저 보존하고, 재접속·재시도 때 같은 작업을 조회함. 워커는 트랜잭션으로 한 번만 실행권을 획득하며 작업에 ID 토큰·비밀번호를 저장하지 않음.
- 워커 실행 상한은 540초, 10분 이상 완료되지 않은 실행은 중단 상태로 표시함. 처리 여부가 불명확한 작업을 자동으로 다시 유료 실행하지 않음. 결과 조회는 24시간 이내로 제한하며 물리적 삭제 TTL 정책은 별도 설정 사항임.
- 앱 Deploy는 명시적 승인과 서버 재검증 후 `/apps/{id}/`에 비공개로 등록함. Vercel로 게시하지 않음. 앱 파일은 소유 계정만 서버에서 받을 수 있으며 서버 소스는 제공하지 않음. 검증한 서비스 워커와 홈 화면 설치 매니페스트를 유지함. 승인된 브라우저에 저장된 앱은 오프라인 사용이 가능하며, StartupOS 로그아웃 시 해당 앱 캐시·서비스 워커를 제거함. 오프라인인 기기의 이미 저장된 데이터는 원격 권한 철회만으로 즉시 제거되지 않음.
- 기존 My Apps·Build 미리보기·전체/부분 캡처·대화형 수정·AutoBuild 인터페이스를 유지함. Sites 전용 `/control` 실험실과 D1 기록은 이관하지 않음.
- Analytics는 활성화하지 않음.
- 런타임 전용 서비스 계정을 사용함. 데이터베이스 사용 권한, 사용자 조회·세션 발급에 필요한 제한된 사용자 정의 역할, 해당 OpenAI 비밀값 한 건의 읽기 권한만 배포 스크립트에서 부여함. 서비스 계정 비공개 키 파일은 생성하지 않음.

## 직접 배포하는 방법

1. [Cloud Shell](https://shell.cloud.google.com/?project=startupos-6b8d4)에 로그인하고 ZIP을 업로드·압축 해제함.
2. 압축 해제한 폴더에서 실행함. 이메일에는 실제로 로그인할 운영자의 이메일을 넣음.

    bash firebase/deploy-cloudshell.sh '운영자이메일@example.com'

이 명령은 Google/Firebase 배포 인증을 확인하고, 의존성·테스트를 실행하고, 운영자 이메일을 등록한 다음 Functions·Hosting·보안 규칙을 배포함. 기존 환경의 OPENAI_API_KEY가 Firebase Secret Manager에 없으면 기존 키를 Firebase CLI 보안 입력창에서 직접 입력함. **키를 대화·명령줄 인수·파일·스크린샷에 넣지 않음.** Vercel 접근 승인이 완료되면 자동 이전 여부를 다시 확인할 수 있음.

기존 Firestore 데이터베이스는 삭제·재생성하지 않음. Firebase 배포 주소는 https://startupos-6b8d4.web.app/ 이며 **실제 배포 성공 전에는 작동한다고 간주하지 않음.** Vercel 트래픽 전환·기존 데이터 삭제는 이 스크립트가 수행하지 않음.

운영자 등록은 기본적으로 Cloud Shell 로그인 계정을 사용하지만, 잘못된 계정이 허용되지 않도록 위처럼 이메일을 명시하는 것을 권장함. 추가 운영자를 등록하는 것은 접근 범위 변경이므로 별도 결정 후 수행함.

## 검증과 남은 확인

    npm test
    npm run test:firebase

코드 테스트에는 인증 실패, 권한 철회, 다른 계정 접근, 경로 탈출, 작업 중복, 키 충돌, 요청 토큰 미저장, 중단 작업의 자동 재실행 금지, 실제 여행 앱 조립·검증·비공개 배포가 포함됨. 실제 Google 로그인이나 유료 모델 요청을 성공했다고 주장하는 테스트가 아님.

Firestore 규칙의 실제 에뮬레이터 테스트:

    TEST_PRIVATE_FIREBASE=true npx -y firebase-tools@latest emulators:exec --project demo-startupos --config firebase/test.emulators.json --only firestore 'node tests/firestore-rules.mjs'

현재 실행 환경에서는 에뮬레이터 준비 중 네트워크 승인 요청이 취소되어 규칙 실행 검증을 완료하지 못함. 배포 환경에서는 STARTUPOS_TEST_RULES=1로 배포 스크립트 실행 시 이 검사를 추가할 수 있음. Java는 해당 Firebase 에뮬레이터의 요구 버전을 설치해야 함.

배포 후 실제 Google·이메일 로그인, 등록되지 않은 계정 거부, 프로젝트 JSON 가져오기·저장·다른 기기 복원, 촬영·캡처·대화형 수정, 서버 작업 재조회, 홈 화면 설치를 확인해야 함. 피부·OCR·코드 수정의 실제 모델 호출은 기존 키의 Firebase 설정 후 검증함. 물리 휴대폰 검증과 사이트 전체 경로의 실제 브라우저 검증은 아직 완료되지 않음.

기존 브라우저 프로젝트는 도메인이 바뀌어 자동 복사되지 않음. 기존 브라우저에서 JSON 전체 백업을 받은 후 새 Firebase 사이트에서 같은 계정으로 로그인해 가져와야 함.
