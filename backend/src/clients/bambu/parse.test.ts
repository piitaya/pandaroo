import { describe, expect, it } from "vitest";
import { parseAmsReport, decodeNozzleId } from "./parse.js";

describe("parseAmsReport", () => {
  it("parses ams[].tray[] into nested AmsUnit[]", () => {
    const payload = {
      print: {
        ams: {
          ams: [
            {
              id: 0,
              info: "1003",
              tray: [
                {
                  id: 0,
                  tray_id_name: "A01-B6",
                  tray_sub_brands: "PLA Matte",
                  tray_type: "PLA",
                  tray_color: "042F56FF",
                  tray_uuid: "UUID-A",
                  nozzle_temp_min: 220,
                  nozzle_temp_max: 240,
                  tray_weight: "1000",
                  remain: 87,
                },
                {
                  id: 1,
                  tray_id_name: null,
                  tray_sub_brands: null,
                  tray_type: null,
                },
              ],
            },
          ],
        },
      },
    };
    const units = parseAmsReport("AC12", payload);
    expect(units).toEqual([
      {
        id: 0,
        nozzle_id: 0,
        slots: [
          expect.objectContaining({
            slot_id: 0,
            has_spool: true,
            spool: expect.objectContaining({
              tag_id: "UUID-A",
              variant_id: "A01-B6",
              remain: 87,
              temp_min: 220,
            }),
          }),
          expect.objectContaining({
            slot_id: 1,
            has_spool: true,
            spool: null,
          }),
        ],
      },
    ]);
  });

  it("returns [] when the payload has no ams report", () => {
    expect(parseAmsReport("AC12", {})).toEqual([]);
    expect(parseAmsReport("AC12", { print: {} })).toEqual([]);
    expect(parseAmsReport("AC12", null)).toEqual([]);
  });

  it("returns [] when the ams array is empty", () => {
    expect(
      parseAmsReport("AC12", { print: { ams: { ams: [] } } }),
    ).toEqual([]);
  });

  it("handles multiple AMS units", () => {
    const payload = {
      print: {
        ams: {
          ams: [
            { id: 0, tray: [{ id: 0, tray_id_name: "A01-B6" }] },
            { id: 1, tray: [{ id: 0, tray_id_name: "A01-B7" }] },
          ],
        },
      },
    };
    expect(parseAmsReport("AC12", payload)).toEqual([
      expect.objectContaining({ id: 0 }),
      expect.objectContaining({ id: 1 }),
    ]);
  });

  it("preserves nozzle_id from previous units when partial updates omit the info field", () => {
    const initialPayload = {
      print: {
        ams: {
          ams: [{ id: 0, info: "11002103", tray: [{ id: 0 }] }],
        },
      },
    };
    const initial = parseAmsReport("AC12", initialPayload);
    expect(initial[0]?.nozzle_id).toBe(1);

    // Bambu sends partial updates without the `info` field — should keep
    // the nozzle_id we learned from the initial pushall.
    const partialPayload = {
      print: {
        ams: {
          ams: [{ id: 0, tray: [{ id: 0, remain: 50 }] }],
        },
      },
    };
    const updated = parseAmsReport("AC12", partialPayload, initial);
    expect(updated[0]?.nozzle_id).toBe(1);
    expect(updated[0]?.slots[0]?.nozzle_id).toBe(1);
  });

  it("decodes nozzle_id from the AMS info hex field on an H2C-shaped payload", () => {
    const payload = {
      print: {
        ams: {
          ams: [
            { id: 0, info: "1003", tray: [{ id: 0 }] },
            { id: 1, info: "2003", tray: [{ id: 0 }] },
            { id: 128, info: "2104", tray: [{ id: 0 }] },
          ],
        },
      },
    };
    const units = parseAmsReport("AC12", payload);
    expect(units.map((u) => [u.id, u.nozzle_id])).toEqual([
      [0, 0],
      [1, 0],
      [128, 1],
    ]);
  });
});

describe("decodeNozzleId", () => {
  it("decodes right-nozzle info values", () => {
    expect(decodeNozzleId("1003")).toBe(0);
    expect(decodeNozzleId("2003")).toBe(0);
  });

  it("decodes left-nozzle info values", () => {
    expect(decodeNozzleId("2104")).toBe(1);
  });

  it("returns null for the 0xE uninitialized sentinel", () => {
    expect(decodeNozzleId("1E03")).toBeNull();
  });

  it("returns null for missing or unparseable values", () => {
    expect(decodeNozzleId(null)).toBeNull();
    expect(decodeNozzleId(undefined)).toBeNull();
    expect(decodeNozzleId("zzz")).toBeNull();
  });
});
