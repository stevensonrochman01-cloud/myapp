function firstHeaderValue(value) {
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  return value || "";
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
  source = "request"
} = {}) {
  return {
    source,
    timestamp: new Date().toISOString(),
    ip: extractClientIp(headers),
    method: method || "",
    pathname: pathname || "/",
    userAgent: firstHeaderValue(headers["user-agent"]).toString(),
    referer: firstHeaderValue(headers.referer).toString()
  };
}
