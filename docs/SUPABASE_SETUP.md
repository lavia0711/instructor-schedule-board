# Supabase 설정 안내

이 저장소는 앱 코드와 DB 구조를 공유하고, 실제 연결 정보와 데이터는 Supabase 프로젝트마다 분리하도록 구성되어 있습니다.

## 1. 프로젝트 만들기

Supabase에서 새 프로젝트를 만든 뒤 Dashboard의 **Project Settings → API**에서 다음 값을 확인합니다.

- Project URL
- Publishable key (`sb_publishable_...`)
- Project reference

프로젝트 루트에 `.env.local`을 만들고 URL과 Publishable key를 입력합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

`.env.local`은 `.gitignore`에 포함되어 있습니다.

## 2. DB 구조 적용

```bash
npm install
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

다음 항목이 `supabase/migrations`에서 생성됩니다.

- `instructors`: 강사명, 색상, 표시 순서
- `schedules`: 전체 일정과 본강의 연결
- `workspace_settings`: 일정 종류 색상과 엑셀 본강의 판별 항목
- `profiles`: Auth 사용자 역할과 담당 강사 연결
- RLS 정책과 명시적 Data API 권한
- Realtime 대상 테이블 설정

## 3. Auth 설정

Supabase Dashboard의 **Authentication → Sign In / Providers**에서 Email 로그인을 활성화하고, 공개 회원가입은 비활성화하는 것을 권장합니다. 회사 사용자는 관리자가 Dashboard에서 직접 생성합니다.

Site URL과 Redirect URL에는 실제 배포 주소와 로컬 개발 주소를 등록합니다.

```text
http://localhost:3000
https://your-company-app.example.com
```

## 4. 최초 전체 관리자 지정

Dashboard의 **Authentication → Users**에서 첫 사용자를 만든 뒤 SQL Editor에서 해당 사용자를 전체 관리자로 지정합니다.

```sql
update public.profiles
set role = 'admin', instructor_name = null
where email = 'admin@company.com';
```

앱에 로그인한 전체 관리자는 엑셀 가져오기, 전체 일정 수정, 강사 색상·순서와 공용 설정 변경을 할 수 있습니다.

## 5. 강사 계정 연결

먼저 관리자가 엑셀 일정을 가져오면 엑셀의 강사명이 `instructors`에 등록됩니다. 그다음 Dashboard에서 강사 사용자를 만든 뒤 SQL Editor에서 계정과 강사명을 연결합니다.

```sql
update public.profiles
set role = 'instructor', instructor_name = '문건우'
where email = 'instructor@company.com';
```

강사 계정은 전체 일정을 조회할 수 있지만 자신의 일정만 등록·수정할 수 있습니다. 강사가 앱에서 자신의 일정을 삭제하면 실제 삭제 대신 취소 상태로 바뀝니다.

## 6. 기존 로컬 데이터

Supabase 연결 이후 서버 데이터가 원본이 됩니다. 기존 브라우저 `localStorage` 데이터는 자동 업로드하지 않습니다. 중복 반영을 막기 위한 동작이며, 기존 일정을 서버로 옮길 때는 표준 엑셀 파일을 관리자로 다시 가져오면 됩니다.

## 7. 회사에서 포크해 사용하기

1. 이 저장소를 회사 GitHub 계정이나 조직으로 포크합니다.
2. 회사 계정으로 별도의 Supabase 프로젝트를 만듭니다.
3. 회사 프로젝트에 `supabase db push`를 실행합니다.
4. 회사 환경의 `.env.local`과 배포 환경변수에 회사 URL과 Publishable key를 넣습니다.
5. 회사 관리자와 강사 계정을 생성하고 역할을 연결합니다.

포크한 회사 프로젝트는 코드와 DB 구조만 공유합니다. 사용자, 일정, Auth 세션, 키와 비밀번호는 원본 프로젝트와 공유되지 않습니다.

## 보안 원칙

- 브라우저에는 Publishable key만 사용합니다.
- Secret Key, 기존 `service_role` 키, DB 비밀번호를 Git이나 `NEXT_PUBLIC_` 변수에 넣지 않습니다.
- `public` 스키마의 모든 업무 테이블에는 RLS가 활성화되어 있습니다.
- 역할은 사용자가 변경할 수 있는 `user_metadata`가 아니라 `profiles` 테이블에서 관리합니다.
- 익명 사용자는 업무 테이블에 접근할 수 없습니다.
