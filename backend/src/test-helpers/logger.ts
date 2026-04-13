import { vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";

export function createTestLogger(): FastifyBaseLogger {
  const logger: Record<string, any> = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    silent: vi.fn(),
    level: "silent",
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as FastifyBaseLogger;
}
