import { NextResponse } from "next/server";
import { scanAllDueRadars } from "@/lib/radar-store";
import { getRuntimeDatabase } from "@/lib/runtime-bindings";

export const dynamic = "force-dynamic";

// Any hosting scheduler (Cloudflare cron trigger, GitHub Actions, external
// pinger) can call this route twice daily to run due monitors for every user.
// Auth is the RADAR_CRON_SECRET server env var, never a signed-in identity, so
// the route works while the app is closed. Secrets travel in headers only —
// query strings end up in access logs.
let cronRunning = false;

export async function POST(request: Request) {
  return runScheduledScan(request);
}

export async function GET(request: Request) {
  return runScheduledScan(request);
}

async function runScheduledScan(request: Request) {
  const expected = process.env.RADAR_CRON_SECRET?.trim();
  if (!expected) {
    return error(503, "scheduler_not_configured", "Set the RADAR_CRON_SECRET server environment variable, then point the hosting scheduler at this route to enable twice-daily background scans.");
  }
  const provided = bearerSecret(request);
  if (!provided || !(await secretsMatch(provided, expected))) {
    return error(401, "scheduler_unauthorized", "The scheduler secret is missing or wrong. Send it as an Authorization: Bearer header or x-radar-cron-secret header.");
  }
  if (cronRunning) {
    return error(429, "scheduler_already_running", "A background radar scan is already in progress. This trigger was skipped, not queued.");
  }
  cronRunning = true;
  try {
    const db = getRuntimeDatabase();
    const scans = await scanAllDueRadars(db);
    const totals = scans.reduce((sum, scan) => ({
      users: sum.users + 1,
      checked: sum.checked + scan.checked,
      found: sum.found + scan.found,
      added: sum.added + scan.added,
      failures: sum.failures + scan.failures.length,
    }), { users: 0, checked: 0, found: 0, added: 0, failures: 0 });
    return NextResponse.json({ ok: true, trigger: "background", totals, scans });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "The background radar scan could not run.";
    const safe = message.replace(/https?:\/\/\S+/gi, "[url]").replace(/\s+/g, " ").trim().slice(0, 500);
    if (/no such table|D1_ERROR/i.test(message)) return error(503, "radar_database_unavailable", "The private radar database is still being prepared.");
    return error(500, "scheduler_scan_failed", safe || "The background radar scan could not run.");
  } finally {
    cronRunning = false;
  }
}

function bearerSecret(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || request.headers.get("x-radar-cron-secret")?.trim() || "";
}

// Compare SHA-256 digests so the check runs in constant time for any input.
async function secretsMatch(provided: string, expected: string) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

function error(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}
