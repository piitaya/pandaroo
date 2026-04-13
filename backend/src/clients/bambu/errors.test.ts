import { describe, expect, it } from "vitest";
import { classifyMqttError } from "./errors.js";

const mqttErr = (
  init: { code?: number | string; message?: string },
): Error & { code?: number | string } => {
  const e = new Error(init.message ?? "") as Error & {
    code?: number | string;
  };
  if (init.code !== undefined) e.code = init.code;
  return e;
};

describe("classifyMqttError", () => {
  it("classifies CONNACK code 4 (bad username/password) as unauthorized", () => {
    expect(classifyMqttError(mqttErr({ code: 4, message: "..." }))).toBe(
      "unauthorized",
    );
  });

  it("classifies CONNACK code 5 (not authorized) as unauthorized", () => {
    expect(classifyMqttError(mqttErr({ code: 5, message: "..." }))).toBe(
      "unauthorized",
    );
  });

  it("falls back to message regex for 'Not authorized'", () => {
    expect(
      classifyMqttError(
        mqttErr({ message: "Connection refused: Not authorized" }),
      ),
    ).toBe("unauthorized");
  });

  it("classifies network syscall codes as unreachable", () => {
    expect(classifyMqttError(mqttErr({ code: "EACCES" }))).toBe(
      "unreachable",
    );
    expect(classifyMqttError(mqttErr({ code: "ECONNREFUSED" }))).toBe(
      "unreachable",
    );
    expect(classifyMqttError(mqttErr({ code: "ETIMEDOUT" }))).toBe(
      "unreachable",
    );
    expect(classifyMqttError(mqttErr({ code: "ENOTFOUND" }))).toBe(
      "unreachable",
    );
  });

  it("falls back to 'connect EXXX' message regex for unreachable", () => {
    expect(
      classifyMqttError(
        mqttErr({
          message:
            "connect EACCES 10.0.0.0:8883 - Local (10.0.100.1:55326)",
        }),
      ),
    ).toBe("unreachable");
  });

  it("returns 'other' for unknown errors", () => {
    expect(
      classifyMqttError(mqttErr({ message: "weird mystery error" })),
    ).toBe("other");
  });
});
