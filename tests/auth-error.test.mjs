import assert from "node:assert/strict";
import test from "node:test";

import { formatAuthError } from "../lib/auth-error.ts";

test("network errors explain how to unblock Supabase", () => {
  assert.match(formatAuthError(new TypeError("Failed to fetch")), /supabase\.co/);
  assert.match(formatAuthError(new TypeError("Failed to fetch")), /확장 프로그램/);
});

test("common credential errors are translated", () => {
  assert.equal(
    formatAuthError(new Error("Invalid login credentials")),
    "이메일 또는 비밀번호가 올바르지 않습니다.",
  );
  assert.equal(
    formatAuthError(new Error("Email not confirmed")),
    "이메일 인증이 완료되지 않은 계정입니다.",
  );
});

test("unknown errors retain their original message", () => {
  assert.equal(formatAuthError(new Error("Rate limit exceeded")), "Rate limit exceeded");
  assert.equal(formatAuthError(null, "로그인 실패"), "로그인 실패");
});
