import assert from "node:assert/strict";
import test from "node:test";

import { parseRevisionTimestamp, remoteIsFresher } from "../lib/workspace-sync.mjs";

test("D1 timestamps are read as UTC, not the device's local zone", () => {
  // CURRENT_TIMESTAMP has no zone marker; a bare Date.parse would shift it by
  // the device's offset, which is exactly the class of error that decides the
  // wrong winner on a device west of UTC.
  assert.equal(parseRevisionTimestamp("2026-08-29 10:30:00"), Date.parse("2026-08-29T10:30:00Z"));
  // ISO strings with a zone are honored as-is.
  assert.equal(parseRevisionTimestamp("2026-08-29T10:30:00.000Z"), Date.parse("2026-08-29T10:30:00Z"));
});

test("unreadable timestamps degrade to zero instead of throwing", () => {
  for (const value of ["", null, undefined, "not a date", 42]) {
    assert.equal(parseRevisionTimestamp(value), 0, `for ${String(value)}`);
  }
});

test("a durable revision saved after this device's stamp outranks the local copy", () => {
  const stamp = Date.parse("2026-08-20T09:00:00Z");
  assert.equal(remoteIsFresher(stamp, "2026-08-29 10:30:00"), true, "another device saved more recently");
  assert.equal(remoteIsFresher(stamp, "2026-08-10 10:30:00"), false, "this device reconciled after that revision");
});

test("a device that never stamped is never treated as fresh", () => {
  // A brand-new browser holds either nothing or an unreconciled copy; any
  // durable revision must win over it.
  for (const stamp of [0, "", null, undefined, Number.NaN]) {
    assert.equal(remoteIsFresher(stamp, "2020-01-01 00:00:00"), true, `for stamp ${String(stamp)}`);
  }
});

test("no durable revision means the local copy stands", () => {
  assert.equal(remoteIsFresher(Date.now(), ""), false);
  assert.equal(remoteIsFresher(0, undefined), false);
});
