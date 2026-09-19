import helmet from "helmet";

export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { "default-src": ["'none'"], "frame-ancestors": ["'none'"] },
    },
    frameguard: { action: "deny" },
    hsts: { maxAge: 63_072_000, includeSubDomains: false },
    referrerPolicy: { policy: "no-referrer" },
  });
}
