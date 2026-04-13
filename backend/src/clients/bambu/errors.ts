import type { PrinterErrorCode } from "@bambu-spoolman-sync/shared";

const NETWORK_ERROR_CODES = new Set([
  "EACCES",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ECONNRESET",
]);

export function classifyMqttError(
  err: Error & { code?: number | string },
): PrinterErrorCode {
  if (err.code === 4 || err.code === 5) return "unauthorized";
  if (/not authorized|bad username|bad password/i.test(err.message)) {
    return "unauthorized";
  }
  if (typeof err.code === "string" && NETWORK_ERROR_CODES.has(err.code)) {
    return "unreachable";
  }
  if (/^connect E[A-Z]+ /.test(err.message)) return "unreachable";
  return "other";
}
