import { execFileSync } from "node:child_process";

const requiredVariables = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

const errors = [];
const warnings = [];

for (const name of requiredVariables) {
  const value = process.env[name]?.trim();
  if (!value) {
    errors.push(`${name} is missing.`);
    continue;
  }
  if (/your-|example|replace|company_(project|key)/i.test(value)) {
    errors.push(`${name} still contains a placeholder value.`);
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
if (supabaseUrl) {
  try {
    const parsedUrl = new URL(supabaseUrl);
    if (parsedUrl.protocol !== "https:") {
      errors.push("NEXT_PUBLIC_SUPABASE_URL must use HTTPS.");
    }
  } catch {
    errors.push("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }
}

const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
if (publishableKey?.startsWith("sb_secret_")) {
  errors.push("A Supabase secret key must never be exposed as NEXT_PUBLIC_*.");
} else if (publishableKey && !publishableKey.startsWith("sb_publishable_")) {
  warnings.push(
    "The Supabase key is not in the current sb_publishable_ format. Confirm that it is a public client key.",
  );
}

try {
  const origin = execFileSync("git", ["remote", "get-url", "origin"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (/github\.com[/:]lavia0711\/instructor-schedule-board(?:\.git)?$/i.test(origin)) {
    warnings.push(
      "origin still points to the personal portfolio repository. Set origin to the company repository before production work.",
    );
  }
} catch {
  warnings.push("Could not inspect the Git origin remote.");
}

console.log("Company deployment readiness check");
for (const warning of warnings) console.warn(`[warning] ${warning}`);
for (const error of errors) console.error(`[error] ${error}`);

if (errors.length > 0) {
  process.exitCode = 1;
} else {
  console.log("[ok] Public Supabase deployment variables are configured.");
}
