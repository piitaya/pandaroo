import { describe, expect, it, vi } from "vitest";
import { createAmsChangeDetector } from "./ams-change-detector.js";
import { createEventBus } from "../events.js";
import { createTestLogger } from "../test-helpers/logger.js";
import type { Printer, AmsSlot, SpoolReading } from "@bambu-spoolman-sync/shared";

const printer: Printer = {
  name: "Test",
  host: "192.168.1.1",
  serial: "AC12",
  access_code: "xxx",
  enabled: true,
};

function makeSlot(over: Partial<AmsSlot> = {}): AmsSlot {
  return {
    printer_serial: "AC12",
    ams_id: 0,
    slot_id: 0,
    nozzle_id: 0,
    has_spool: true,
    spool: {
      tag_id: "UUID-A",
      variant_id: "A01-B6",
      material: "PLA",
      product: "PLA Matte",
      color_hex: "042F56FF",
      color_hexes: null,
      weight: 1000,
      temp_min: 220,
      temp_max: 240,
      remain: 80,
    },
    ...over,
  };
}

describe("AmsChangeDetector", () => {
  it("emits spool:detected on first AMS report with spool data", () => {
    const bus = createEventBus();
    const detector = createAmsChangeDetector(bus, createTestLogger());
    detector.start();

    const detected = vi.fn();
    bus.on("spool:detected", detected);

    bus.emit("ams:reported", printer, [{ id: 0, nozzle_id: 0, slots: [makeSlot()] }]);

    expect(detected).toHaveBeenCalledOnce();
    expect(detected.mock.calls[0][0].tag_id).toBe("UUID-A");
    expect(detected.mock.calls[0][1]).toEqual({
      printer_serial: "AC12",
      ams_id: 0,
      slot_id: 0,
    });

    detector.stop();
  });

  it("does not re-emit when same data is reported twice", () => {
    const bus = createEventBus();
    const detector = createAmsChangeDetector(bus, createTestLogger());
    detector.start();

    const detected = vi.fn();
    bus.on("spool:detected", detected);

    const units = [{ id: 0, nozzle_id: 0, slots: [makeSlot()] }];
    bus.emit("ams:reported", printer, units);
    bus.emit("ams:reported", printer, units);

    expect(detected).toHaveBeenCalledOnce();

    detector.stop();
  });

  it("re-emits when remain changes", () => {
    const bus = createEventBus();
    const detector = createAmsChangeDetector(bus, createTestLogger());
    detector.start();

    const detected = vi.fn();
    bus.on("spool:detected", detected);

    bus.emit("ams:reported", printer, [{ id: 0, nozzle_id: 0, slots: [makeSlot()] }]);

    const changedSpool: SpoolReading = {
      ...makeSlot().spool!,
      remain: 75,
    };
    bus.emit("ams:reported", printer, [{
      id: 0, nozzle_id: 0, slots: [makeSlot({ spool: changedSpool })],
    }]);

    expect(detected).toHaveBeenCalledTimes(2);

    detector.stop();
  });

  it("does not emit for slots without tag_id", () => {
    const bus = createEventBus();
    const detector = createAmsChangeDetector(bus, createTestLogger());
    detector.start();

    const detected = vi.fn();
    bus.on("spool:detected", detected);

    const noTagSpool: SpoolReading = {
      tag_id: null,
      variant_id: null,
      material: "PLA",
      product: null,
      color_hex: null,
      color_hexes: null,
      weight: null,
      temp_min: null,
      temp_max: null,
      remain: null,
    };
    bus.emit("ams:reported", printer, [{
      id: 0, nozzle_id: 0, slots: [makeSlot({ spool: noTagSpool })],
    }]);

    expect(detected).not.toHaveBeenCalled();

    detector.stop();
  });
});
