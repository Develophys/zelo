import type { NextFunction, Request, Response } from "express";
import { hasSessionCookie } from "./session-cookie.ts";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function originCheck(allowedOrigins: string[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!STATE_CHANGING_METHODS.has(request.method) || !hasSessionCookie(request)) {
      next();
      return;
    }

    const origin = request.headers.origin;
    if (typeof origin === "string" && allowedOrigins.includes(origin)) {
      next();
      return;
    }

    response.status(403).json({ statusCode: 403, message: "Forbidden" });
  };
}
