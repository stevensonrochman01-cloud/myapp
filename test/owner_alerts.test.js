import test from "node:test";
import assert from "node:assert/strict";

import { buildDiscoveryAlertMessage } from "../api/_ownerAlerts.js";

test("buildDiscoveryAlertMessage includes the important discovery fields", () => {
  const message = buildDiscoveryAlertMessage({
    action: "find_sugarbabies_near_me",
    permission: "granted",
    ip: "198.51.100.55",
    country: "AE",
    city: "Dubai",
    pathname: "/find-nearby",
    method: "POST",
    latitude: 25.2048,
    longitude: 55.2708,
    accuracy: 11,
    userAgent: "Mozilla/5.0",
    referer: "https://example.com/",
    timestamp: "2026-07-12T20:10:00.000Z"
  });

  assert.match(message, /New Nearby Discovery Activity/);
  assert.match(message, /Action: find_sugarbabies_near_me/);
  assert.match(message, /Permission: granted/);
  assert.match(message, /IP: 198.51.100.55/);
  assert.match(message, /Country: AE/);
  assert.match(message, /City: Dubai/);
  assert.match(message, /Latitude: 25.2048/);
  assert.match(message, /Longitude: 55.2708/);
});
