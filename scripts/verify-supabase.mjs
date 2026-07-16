import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey =
  process.env.PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SECRET_KEY || process.env.SUPABASE_SECRET_KEY;

assert.ok(url, "API_URL is required");
assert.ok(publishableKey, "PUBLISHABLE_KEY is required");
assert.ok(secretKey, "SECRET_KEY is required");

const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

const service = createClient(url, secretKey, clientOptions);
const adminClient = createClient(url, publishableKey, clientOptions);
const instructorClient = createClient(url, publishableKey, clientOptions);
const anonymousClient = createClient(url, publishableKey, clientOptions);

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = `Verify-${randomUUID()}!`;
const adminEmail = `admin-${suffix}@example.test`;
const instructorEmail = `instructor-${suffix}@example.test`;
const instructorName = `검증강사-${suffix}`;
const otherInstructorName = `다른강사-${suffix}`;
let adminUserId;
let instructorUserId;
const createdScheduleIds = [];

function ensure(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.data;
}

try {
  const adminUser = ensure(
    await service.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true,
      user_metadata: { display_name: "검증 관리자" },
    }),
    "create admin user",
  );
  adminUserId = adminUser.user.id;

  const instructorUser = ensure(
    await service.auth.admin.createUser({
      email: instructorEmail,
      password,
      email_confirm: true,
      user_metadata: { display_name: "검증 강사" },
    }),
    "create instructor user",
  );
  instructorUserId = instructorUser.user.id;

  ensure(
    await service.from("instructors").upsert([
      { name: instructorName, color: "#2563eb", sort_order: 0 },
      { name: otherInstructorName, color: "#7c3aed", sort_order: 1 },
    ]),
    "create instructors",
  );
  ensure(
    await service
      .from("profiles")
      .update({ role: "admin", instructor_name: null })
      .eq("id", adminUserId),
    "promote admin",
  );
  ensure(
    await service
      .from("profiles")
      .update({ role: "instructor", instructor_name: instructorName })
      .eq("id", instructorUserId),
    "connect instructor profile",
  );

  ensure(
    await adminClient.auth.signInWithPassword({ email: adminEmail, password }),
    "admin sign in",
  );
  ensure(
    await instructorClient.auth.signInWithPassword({
      email: instructorEmail,
      password,
    }),
    "instructor sign in",
  );

  const ownScheduleId = randomUUID();
  const otherScheduleId = randomUUID();
  createdScheduleIds.push(ownScheduleId, otherScheduleId);
  ensure(
    await adminClient.from("schedules").insert([
      {
        id: ownScheduleId,
        schedule_date: "2026-07-17",
        start_time: "10:00",
        end_time: "11:00",
        instructor: instructorName,
        kind: "lecture",
        status: "confirmed",
        source: "manual",
      },
      {
        id: otherScheduleId,
        schedule_date: "2026-07-18",
        start_time: "14:00",
        end_time: "15:00",
        instructor: otherInstructorName,
        kind: "lecture",
        status: "confirmed",
        source: "manual",
      },
    ]),
    "admin schedule insert",
  );

  const visibleSchedules = ensure(
    await instructorClient.from("schedules").select("id"),
    "instructor schedule read",
  );
  assert.equal(visibleSchedules.length, 2, "staff should read all schedules");

  const ownUpdate = ensure(
    await instructorClient
      .from("schedules")
      .update({ topic: "본인 일정 수정" })
      .eq("id", ownScheduleId)
      .select("id"),
    "own schedule update",
  );
  assert.equal(ownUpdate.length, 1, "instructor should update own schedule");

  const otherUpdate = ensure(
    await instructorClient
      .from("schedules")
      .update({ topic: "수정되면 안 됨" })
      .eq("id", otherScheduleId)
      .select("id"),
    "other schedule update",
  );
  assert.equal(
    otherUpdate.length,
    0,
    "instructor must not update another instructor's schedule",
  );

  const forbiddenInsert = await instructorClient.from("schedules").insert({
    schedule_date: "2026-07-19",
    instructor: otherInstructorName,
    kind: "office",
    status: "confirmed",
    source: "manual",
  });
  assert.ok(forbiddenInsert.error, "instructor must not insert another schedule");

  const anonymousRead = await anonymousClient.from("schedules").select("id");
  assert.ok(anonymousRead.error, "anonymous users must not read schedules");

  const settingsUpdate = ensure(
    await instructorClient
      .from("workspace_settings")
      .update({ lecture_keywords: ["권한 검증"] })
      .eq("id", "default")
      .select("id"),
    "instructor settings update",
  );
  assert.equal(settingsUpdate.length, 0, "only admins may update settings");

  const adminSettingsUpdate = ensure(
    await adminClient
      .from("workspace_settings")
      .update({ lecture_keywords: ["제미나이", "클로드"] })
      .eq("id", "default")
      .select("id"),
    "admin settings update",
  );
  assert.equal(adminSettingsUpdate.length, 1, "admin should update settings");

  console.log("Supabase schema, grants, and RLS verification passed.");
} finally {
  if (createdScheduleIds.length > 0) {
    await service.from("schedules").delete().in("id", createdScheduleIds);
  }
  if (adminUserId) await service.auth.admin.deleteUser(adminUserId);
  if (instructorUserId) await service.auth.admin.deleteUser(instructorUserId);
  await service
    .from("instructors")
    .delete()
    .in("name", [instructorName, otherInstructorName]);
}
