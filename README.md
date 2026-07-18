# 강사 일정 보드

회사 내부에서 강사별 강의, 보조강의, 사무실 출근, 휴무와 기타 일정을 한 화면에서 관리하는 웹앱입니다.

## 주요 기능

- 월간·주간·일간 달력 전환
- 강사별 색상과 표시 순서 설정
- 일정 종류·상태·강사별 필터
- 여러 날짜 일정 일괄 등록
- 보조강의와 같은 날짜의 본강의 연결
- 본강의 취소 시 연결된 모든 보조강의 자동 취소
- 본강의별 보조강사 미배정·배정 완료·불필요 상태 확인 및 일괄 변경
- 표준 엑셀 일정표 가져오기 및 신규·수정·동일 항목 비교
- 엑셀 비고에 따른 본강의·기타·취소 자동 분류
- Supabase Auth 로그인, Realtime 동기화, 역할별 수정 권한
- Supabase가 없을 때 브라우저 `localStorage`를 사용하는 로컬 프로토타입 모드

## 사용 기술

- React 19, Vinext, TypeScript
- FullCalendar
- Supabase Database, Auth, Realtime, RLS
- ExcelJS
- dnd-kit

## 빠른 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm install
copy .env.example .env.local
npm run dev
```

`.env.local`에 실제 Supabase 프로젝트 값을 입력합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

연결값이 없으면 기존처럼 로컬 프로토타입 모드로 실행됩니다. Secret Key, `service_role` 키, DB 비밀번호는 브라우저 환경변수나 Git 저장소에 넣지 않습니다.

## Supabase 연결

처음 연결하거나 회사 계정으로 포크해 연결하는 절차는 [Supabase 설정 안내](docs/SUPABASE_SETUP.md)를 따르세요.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

## Cloudflare Workers 직접 배포

이 저장소는 Codex 호스팅 서비스가 아니라 Cloudflare 공식 Vinext·Wrangler 배포 방식을 사용합니다. 최초 한 번 Cloudflare 계정 인증을 마친 뒤 바로 배포할 수 있습니다.

```bash
npx wrangler login
npx wrangler whoami
npm run deploy
```

배포된 앱과 로그, 사용자 지정 도메인은 Cloudflare 대시보드의 **Workers & Pages**에서 직접 관리합니다. `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`는 배포 전에 `.env.local`에 설정해야 합니다. 브라우저에 공개되는 Publishable Key만 사용하며 Secret Key나 `service_role` 키는 넣지 않습니다.

Cloudflare 계정 ID는 공개 저장소에 고정하지 않습니다. 계정이 여러 개인 경우 배포하는 PC나 CI에 `CLOUDFLARE_ACCOUNT_ID` 환경변수를 설정하세요. 회사가 저장소를 포크하면 회사 Cloudflare 계정으로 다시 로그인하고 회사 Supabase 값으로 `.env.local`을 바꾼 뒤 같은 명령으로 독립 배포할 수 있습니다.

설정만 확인하고 실제 배포하지 않으려면 다음 명령을 사용합니다.

```bash
npm run deploy:dry-run
```

## 검사

```bash
npm run lint
npm test
```

Docker Desktop이 실행 중이면 DB 마이그레이션과 실제 RLS 권한도 검증할 수 있습니다.

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:lint

# `supabase status -o env`의 로컬 값을 환경변수에 등록한 뒤 실행
npm run supabase:verify
```

## 저장 범위

Supabase에는 일정과 본강의별 보조강사 필요 여부, 강사 색상·정렬, 일정 종류 색상, 엑셀 판별 항목, 사용자 권한이 저장됩니다. 검색어, 현재 필터, 보고 있는 달력 화면 같은 개인 UI 상태는 서버에 저장하지 않습니다.

## 라이선스

[MIT](LICENSE)
