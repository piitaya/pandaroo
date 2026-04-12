export interface SpoolmanVendor {
  id: number;
  name: string;
}

export interface SpoolmanFilament {
  id: number;
  external_id?: string | null;
  extra?: Record<string, string>;
}

export interface SpoolmanSpool {
  id: number;
  filament: { id: number };
  used_weight?: number;
  first_used?: string | null;
  last_used?: string | null;
  archived?: boolean;
  extra?: Record<string, string>;
}

export interface SpoolmanInfo {
  version?: string;
}

interface SpoolmanSettingResponse {
  value: string;
  is_set: boolean;
  type: string;
}

export interface ExternalFilament {
  id: string;
  name?: string;
  manufacturer?: string;
  material?: string;
  density: number;
  diameter: number;
  weight?: number;
  spool_weight?: number;
  color_hex?: string;
  color_hexes?: string[];
  multi_color_direction?: "coaxial" | "longitudinal";
  extruder_temp?: number;
  bed_temp?: number;
}

// Spoolman's `extra` field is documented as a map of JSON-encoded
// strings, so a plain text value is stored wrapped in JSON quotes.
export function encodeExtraString(value: string): string {
  return JSON.stringify(value);
}

export function decodeExtraString(value: string | undefined): string | null {
  if (value == null) return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
}

export interface SpoolmanClient {
  getInfo(signal?: AbortSignal): Promise<SpoolmanInfo>;
  getBaseUrl(signal?: AbortSignal): Promise<string | null>;
  findVendorByName(name: string): Promise<SpoolmanVendor | null>;
  createVendor(name: string): Promise<SpoolmanVendor>;
  findFilamentByExternalId(
    externalId: string,
  ): Promise<SpoolmanFilament | null>;
  createFilamentFromExternal(externalId: string): Promise<SpoolmanFilament>;
  listSpools(): Promise<SpoolmanSpool[]>;
  ensureSpoolTagField(): Promise<void>;
  createSpool(filamentId: number, trayUuid: string): Promise<SpoolmanSpool>;
  updateSpool(
    spoolId: number,
    patch: {
      used_weight?: number;
      last_used?: string;
      first_used?: string;
      archived?: boolean;
    },
  ): Promise<SpoolmanSpool>;
  findSpoolByTag(tag: string, spools?: SpoolmanSpool[]): Promise<SpoolmanSpool | null>;
  deleteSpool(spoolId: number): Promise<void>;
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

export function createSpoolmanClient(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): SpoolmanClient {
  const base = normalizeBaseUrl(baseUrl);
  let tagFieldRegistered: Promise<void> | null = null;

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Spoolman ${method} ${path} failed: ${res.status} ${res.statusText}${
          text ? ` — ${text}` : ""
        }`,
      );
    }
    return (await res.json()) as T;
  }

  return {
    async getInfo(signal) {
      return request<SpoolmanInfo>("GET", "/api/v1/info", undefined, signal);
    },

    async getBaseUrl(signal) {
      try {
        const res = await request<SpoolmanSettingResponse>(
          "GET",
          "/api/v1/setting/base_url",
          undefined,
          signal,
        );
        if (!res.is_set) return null;
        try {
          const parsed = JSON.parse(res.value);
          if (typeof parsed !== "string" || parsed === "") return null;
          return parsed;
        } catch {
          return null;
        }
      } catch {
        return null;
      }
    },

    async findVendorByName(name) {
      const list = await request<SpoolmanVendor[]>(
        "GET",
        `/api/v1/vendor?name=${encodeURIComponent(name)}`,
      );
      const needle = name.toLowerCase();
      return list.find((v) => v.name.toLowerCase() === needle) ?? null;
    },

    async createVendor(name) {
      return request<SpoolmanVendor>("POST", "/api/v1/vendor", { name });
    },

    async findFilamentByExternalId(externalId) {
      const list = await request<SpoolmanFilament[]>(
        "GET",
        `/api/v1/filament?external_id=${encodeURIComponent(externalId)}`,
      );
      return list[0] ?? null;
    },

    async createFilamentFromExternal(externalId) {
      const external = await request<ExternalFilament[]>(
        "GET",
        "/api/v1/external/filament",
      );
      const source = external.find((f) => f.id === externalId);
      if (!source) {
        throw new Error(
          `Filament ${externalId} not found in Spoolman's external database.`,
        );
      }
      let vendorId: number | undefined;
      if (source.manufacturer) {
        const existing = await this.findVendorByName(source.manufacturer);
        const vendor =
          existing ?? (await this.createVendor(source.manufacturer));
        vendorId = vendor.id;
      }
      return request<SpoolmanFilament>("POST", "/api/v1/filament", {
        name: source.name,
        vendor_id: vendorId,
        material: source.material,
        density: source.density,
        diameter: source.diameter,
        weight: source.weight,
        spool_weight: source.spool_weight,
        color_hex: source.color_hex,
        multi_color_hexes: source.color_hexes?.join(","),
        multi_color_direction: source.multi_color_direction,
        settings_extruder_temp: source.extruder_temp,
        settings_bed_temp: source.bed_temp,
        external_id: source.id,
      });
    },

    async listSpools() {
      return request<SpoolmanSpool[]>(
        "GET",
        "/api/v1/spool?allow_archived=true",
      );
    },

    async ensureSpoolTagField() {
      if (!tagFieldRegistered) {
        tagFieldRegistered = request<unknown>(
          "POST",
          "/api/v1/field/spool/tag",
          { name: "Tag", field_type: "text" },
        )
          .then(() => undefined)
          .catch((err) => {
            tagFieldRegistered = null;
            throw err;
          });
      }
      return tagFieldRegistered;
    },

    async createSpool(filamentId, trayUuid) {
      await this.ensureSpoolTagField();
      const now = new Date().toISOString();
      return request<SpoolmanSpool>("POST", "/api/v1/spool", {
        filament_id: filamentId,
        first_used: now,
        last_used: now,
        extra: { tag: encodeExtraString(trayUuid) },
      });
    },

    async updateSpool(spoolId, patch) {
      return request<SpoolmanSpool>(
        "PATCH",
        `/api/v1/spool/${spoolId}`,
        patch,
      );
    },

    async findSpoolByTag(tag, spools) {
      const list = spools ?? await this.listSpools();
      return list.find((s) => decodeExtraString(s.extra?.tag) === tag) ?? null;
    },

    async deleteSpool(spoolId) {
      await request<void>("DELETE", `/api/v1/spool/${spoolId}`);
    },
  };
}
