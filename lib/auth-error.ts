const NETWORK_ERROR_PATTERNS = [
  "failed to fetch",
  "networkerror",
  "network request failed",
  "load failed",
];

export function formatAuthError(
  error: unknown,
  fallback = "로그인 중 오류가 발생했습니다.",
) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const normalized = message.toLowerCase();

  if (NETWORK_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "Supabase 서버에 연결할 수 없습니다. 브라우저의 광고 차단·보안 확장 프로그램에서 *.supabase.co를 허용한 뒤 새로고침하세요.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }

  if (normalized.includes("email not confirmed")) {
    return "이메일 인증이 완료되지 않은 계정입니다.";
  }

  return message || fallback;
}
