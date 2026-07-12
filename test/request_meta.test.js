import test from "node:test";
import assert from "node:assert/strict";

import { buildVisitorLogEntry, extractClientIp } from "../api/_requestMeta.js";

test("extractClientIp prefers the first forwarded address", () => {
  const ip = extractClientIp({
    "x-forwarded-for": "198.51.100.10, 10.0.0.2"
  });

  assert.equal(ip, "198.51.100.10");
});

test("extractClientIp falls back to x-real-ip when forwarded-for is absent", () => {
  const ip = extractClientIp({
    "x-real-ip": "203.0.113.9"
  });

  assert.equal(ip, "203.0.113.9");
});

test("buildVisitorLogEntry keeps useful visit metadata together", () => {
  const logEntry = buildVisitorLogEntry({
    headers: {
      "x-forwarded-for": "198.51.100.44",
      "user-agent": "Mozilla/5.0",
      referer: "https://example.com/from"
    },
    method: "GET",
    pathname: "/verification",
    source: "site_visit"
  });

  assert.equal(logEntry.ip, "198.51.100.44");
  assert.equal(logEntry.method, "GET");
  assert.equal(logEntry.pathname, "/verification");
  assert.equal(logEntry.source, "site_visit");
  assert.equal(logEntry.userAgent, "Mozilla/5.0");
  assert.equal(logEntry.referer, "https://example.com/from");
  assert.match(logEntry.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});
