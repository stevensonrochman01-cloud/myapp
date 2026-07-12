function firstHeaderValue(value) {
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  return value || "";
}

function normalizedHeaderString(value) {
  return firstHeaderValue(value).toString().trim();
}

export function extractClientIp(headers = {}) {
  const forwardedFor = firstHeaderValue(headers["x-forwarded-for"]);
  if (forwardedFor) {
    const firstForwardedIp = forwardedFor
      .toString()
      .split(",")
      .map((part) => part.trim())
      .find(Boolean);

    if (firstForwardedIp) {
      return firstForwardedIp;
    }
  }

  const fallbackHeaders = [
    "x-real-ip",
    "cf-connecting-ip",
    "x-client-ip",
    "fastly-client-ip"
  ];

  for (const headerName of fallbackHeaders) {
    const candidate = firstHeaderValue(headers[headerName]);
    if (candidate) {
      return candidate.toString().trim();
    }
  }

  return "";
}

export function buildVisitorLogEntry({
  headers = {},
  method = "",
  pathname = "",
  source = "request",
  geo = null
} = {}) {
  const headerCountry = normalizedHeaderString(headers["x-vercel-ip-country"]);
  const headerCity = decodeURIComponent(normalizedHeaderString(headers["x-vercel-ip-city"]) || "");

  return {
    source,
    timestamp: new Date().toISOString(),
    ip: extractClientIp(headers),
    method: method || "",
    pathname: pathname || "/",
    country: geo?.country || headerCountry || "",
    city: geo?.city || headerCity || "",
    userAgent: firstHeaderValue(headers["user-agent"]).toString(),
    referer: firstHeaderValue(headers.referer).toString()
  };
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildDiscoveryLogEntry({
  headers = {},
  pathname = "/find-nearby",
  action = "",
  permission = "unknown",
  coords = null,
  source = "discovery_location",
  geo = null
} = {}) {
  const baseLog = buildVisitorLogEntry({
    headers,
    method: "POST",
    pathname,
    source,
    geo
  });

  return {
    ...baseLog,
    action: action || "",
    permission,
    latitude: normalizeNumber(coords?.latitude),
    longitude: normalizeNumber(coords?.longitude),
    accuracy: normalizeNumber(coords?.accuracy)
  };
}
