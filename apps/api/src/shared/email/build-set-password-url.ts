export function buildSetPasswordUrl(kind: "manager" | "peer-partner", token: string): string {
  const baseUrl = process.env.WEB_APP_BASE_URL ?? "http://localhost:5173";
  const path = kind === "manager" ? "manager/finish-setup" : "peer/finish-setup";
  return `${baseUrl}/${path}/${token}`;
}
