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
