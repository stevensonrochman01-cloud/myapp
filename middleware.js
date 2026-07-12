import { geolocation, ipAddress, next } from "@vercel/functions";

import { buildVisitorLogEntry } from "./api/_requestMeta.js";

export default function middleware(req) {
  const geo = geolocation(req);
  const logEntry = buildVisitorLogEntry({
    headers: Object.fromEntries(req.headers.entries()),
    method: req.method,
    pathname: new URL(req.url).pathname,
    source: "site_visit",
    geo
  });
  logEntry.ip = ipAddress(req) || logEntry.ip;

  console.log("visitor_log", JSON.stringify(logEntry));

  return next();
}

export const config = {
  matcher: [
    "/((?!api/|_next/|_vercel/|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:css|js|mjs|map|png|jpg|jpeg|gif|webp|svg|ico|txt|xml|woff|woff2)$).*)"
  ]
};
