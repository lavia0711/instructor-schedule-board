# 회사 운영 환경 인수 및 배포

이 문서는 개인 포트폴리오 저장소의 코드를 회사가 독립된 비공개 GitHub 저장소, Supabase 프로젝트, Cloudflare 계정에서 운영하기 위한 절차입니다.

## 운영 구조

```text
개인 GitHub 저장소 (upstream, 읽기 전용)
  └─ 회사 GitHub 비공개 저장소 (origin)
       ├─ 회사 Supabase 프로젝트
       └─ 회사 Cloudflare Worker
```

회사 저장소의 코드 이력은 유지하지만 사용자, 일정 데이터, Auth 세션, API 키와 배포 권한은 개인 환경과 공유하지 않습니다.

## 1. 회사 GitHub 저장소 만들기

회사 조직에 README나 라이선스를 자동 생성하지 않은 빈 비공개 저장소를 만듭니다. 그다음 개인 저장소를 복제하고 원격을 분리합니다.

```bash
git clone https://github.com/lavia0711/instructor-schedule-board.git
cd instructor-schedule-board
git remote rename origin upstream
git remote add origin https://github.com/COMPANY/COMPANY_REPOSITORY.git
git push -u origin main
git remote -v
```

`origin`은 회사 저장소, `upstream`은 개인 포트폴리오 저장소여야 합니다. 기존 실험 브랜치는 옮기지 않고 `main`만 회사 저장소에 게시합니다.

회사 저장소의 `main`에는 다음 보호 규칙을 권장합니다.

- Pull Request를 통한 병합 필수
- `CI / validate` 통과 필수
- 강제 푸시와 브랜치 삭제 금지
- 회사 관리자 외 저장소 설정 변경 제한

개인 저장소의 변경이 필요할 때는 회사 동기화 브랜치에서 검토한 커밋만 `cherry-pick`하거나 병합합니다. 개인 저장소를 회사 운영 환경에 자동 동기화하지 않습니다.

## 2. 로컬 준비

Node.js 22.13 이상이 필요합니다.

```powershell
npm ci
Copy-Item .env.example .env.local
```

`.env.local`에 회사 Supabase의 공개 연결값을 입력합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://COMPANY_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_COMPANY_KEY
```

Secret Key, `service_role`, DB 비밀번호는 `.env.local`의 `NEXT_PUBLIC_*` 항목이나 Git 저장소에 넣지 않습니다.

```bash
npm run handoff:check
npm run lint
npm test
```

## 3. 회사 Supabase 프로젝트 만들기

1. 회사 소유 Supabase 조직에서 새 프로젝트를 만듭니다.
2. 회사와 가까운 리전을 선택하고 DB 비밀번호를 회사 비밀 관리 도구에 보관합니다.
3. Dashboard의 Project URL, Publishable Key, Project Reference를 확인합니다.
4. Supabase CLI로 회사 프로젝트를 연결합니다.

```bash
npx supabase login
npx supabase link --project-ref COMPANY_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

드라이런 결과에 저장소의 `supabase/migrations`만 표시되는지 확인한 뒤 실제 적용합니다. `supabase/.temp`의 프로젝트 연결 정보는 Git에 커밋하지 않습니다.

### Auth 설정

Supabase Dashboard에서 다음을 설정합니다.

- Email 로그인 활성화
- 공개 회원가입 비활성화
- Site URL: 최종 회사 서비스 URL
- Redirect URL: `http://localhost:3000`, `http://127.0.0.1:3000`, 최종 회사 서비스 URL

첫 사용자는 Dashboard의 Authentication 메뉴에서 회사 관리자가 직접 생성합니다. 생성 후 SQL Editor에서 전체 관리자로 지정합니다.

```sql
update public.profiles
set role = 'admin', instructor_name = null
where email = 'admin@company.com';
```

### RLS 검증

`scripts/verify-supabase.mjs`는 임시 관리자와 강사 사용자를 만들고 권한을 확인한 뒤 정리합니다. Secret Key는 이 검증 프로세스에만 전달합니다.

PowerShell 예시:

```powershell
$env:API_URL = "https://COMPANY_PROJECT_REF.supabase.co"
$env:PUBLISHABLE_KEY = "sb_publishable_COMPANY_KEY"
$env:SECRET_KEY = "sb_secret_COMPANY_KEY"
npm run supabase:verify
Remove-Item Env:API_URL, Env:PUBLISHABLE_KEY, Env:SECRET_KEY
```

검증이 끝나면 Supabase Dashboard의 Security Advisor도 확인합니다.

## 4. 기존 데이터 처리

권장 기본안은 빈 회사 Supabase에서 시작하고 관리자가 표준 엑셀 일정표를 다시 가져오는 것입니다.

기존 운영 데이터를 반드시 이전해야 한다면 다음 테이블만 별도 검토 후 이동합니다.

- `instructors`
- `schedules`
- `workspace_settings`

`auth.users`, 비밀번호, 세션과 개인 프로젝트의 API 키는 복사하지 않습니다. 회사 사용자는 회사 Supabase에서 새로 생성하고 `profiles` 역할을 다시 연결합니다.

## 5. Cloudflare 최초 검증

회사 Cloudflare 계정으로 인증한 PC에서 먼저 배포 드라이런을 수행합니다.

```bash
npx wrangler login
npx wrangler whoami
npm run build
npx wrangler deploy --dry-run
```

드라이런이 성공한 뒤 회사 계정에 Worker를 생성하거나 최초 배포합니다. Worker 이름을 변경해야 한다면 `wrangler.jsonc`와 `package.json`의 배포 스크립트를 함께 수정합니다.

## 6. Workers Builds 연결

Cloudflare Dashboard의 Workers & Pages에서 회사 GitHub 저장소를 연결합니다.

권장 설정:

| 항목 | 값 |
| --- | --- |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

Cloudflare가 연결 과정에서 생성한 제한된 배포 토큰을 사용하고 개인 Cloudflare 토큰을 회사 저장소에 넣지 않습니다.

### Build Variables

Cloudflare의 **Settings → Build → Build Variables and Secrets**에 다음 값을 등록합니다.

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

두 값은 클라이언트 번들 생성에 필요합니다. 같은 값은 Worker의 **Settings → Variables & Secrets**에도 일반 텍스트 변수로 등록합니다. Publishable Key는 공개 클라이언트 키이며 Secret Key를 대신 사용할 수 없습니다.

`wrangler.jsonc`의 `keep_vars` 설정은 Dashboard에서 관리하는 회사별 런타임 변수가 후속 배포에서 제거되지 않게 합니다.

## 7. 최종 운영 검증

배포 URL이 생성되면 Supabase Auth의 Site URL과 Redirect URL을 최종 주소로 갱신하고 다음을 확인합니다.

1. 익명 사용자는 로그인 화면만 볼 수 있습니다.
2. 전체 관리자는 강사와 모든 일정을 관리할 수 있습니다.
3. 강사 계정은 전체 일정을 조회하지만 자신의 일정만 수정할 수 있습니다.
4. 엑셀 가져오기와 본강의·보조강의 연결이 동작합니다.
5. 서로 다른 브라우저에서 일정 변경이 실시간 반영됩니다.
6. 회사 도메인의 HTTPS와 로그인 리디렉션이 정상입니다.

## 회사가 보관해야 하는 값

| 값 | 저장 위치 | Git 커밋 |
| --- | --- | --- |
| Supabase Project URL | Cloudflare Build/Runtime Variables | 금지 |
| Supabase Publishable Key | Cloudflare Build/Runtime Variables | 금지 |
| Supabase Secret Key | 회사 비밀 관리 도구 | 금지 |
| Supabase DB 비밀번호 | 회사 비밀 관리 도구 | 금지 |
| Cloudflare 배포 토큰 | Cloudflare 관리 영역 | 금지 |
| Cloudflare Account ID | 회사 CI 또는 로컬 환경 | 금지 |
