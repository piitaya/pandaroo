import {
  ActionIcon,
  Badge,
  Button,
  Drawer,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconFilter,
  IconLayoutGrid,
  IconLayoutList,
  IconList,
  IconSearch,
  IconSortAscending,
  IconSortDescending,
  IconX,
} from "@tabler/icons-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { CatalogEntry, Spool } from "../api";
import { useIsMobile } from "../lib/breakpoints";
import {
  COLOR_FAMILIES,
  FAMILY_HEX,
  colorFamily,
  type ColorFamily,
} from "../lib/colorFamily";
import { ColorSwatch } from "./ColorSwatch";
import { PillPicker } from "./PillPicker";
import { spoolHexes } from "./spoolLabel";

export interface FilamentOwnership {
  spools: Spool[];
  totalRemaining: number | null;
}

export interface FilamentRow {
  entry: CatalogEntry;
  variantIds: string[];
  ownership: FilamentOwnership | null;
}

export function aggregateBySku(
  catalog: readonly CatalogEntry[],
  spools: readonly Spool[],
): FilamentRow[] {
  const spoolsByVariant = new Map<string, Spool[]>();
  for (const s of spools) {
    if (!s.variant_id) continue;
    const arr = spoolsByVariant.get(s.variant_id);
    if (arr) arr.push(s);
    else spoolsByVariant.set(s.variant_id, [s]);
  }
  const groups = new Map<string, CatalogEntry[]>();
  for (const e of catalog) {
    const key = `${e.sku}::${e.product}`;
    const arr = groups.get(key);
    if (arr) arr.push(e);
    else groups.set(key, [e]);
  }
  const rows: FilamentRow[] = [];
  for (const entries of groups.values()) {
    const entry = entries[0];
    const variantIds = entries.map((e) => e.id);
    const owned: Spool[] = [];
    for (const id of variantIds) {
      const sp = spoolsByVariant.get(id);
      if (sp) owned.push(...sp);
    }
    let total: number | null = null;
    for (const s of owned) {
      if (s.weight != null && s.remain != null) {
        total = (total ?? 0) + (s.weight * s.remain) / 100;
      }
    }
    const ownership: FilamentOwnership | null =
      owned.length > 0 ? { spools: owned, totalRemaining: total } : null;
    rows.push({ entry, variantIds, ownership });
  }
  return rows;
}

type Ownership = "all" | "owned" | "not_owned";

export type FilamentSortField =
  | "material"
  | "product"
  | "color_name"
  | "owned"
  | "remain_grams";

export interface FilamentSort {
  field: FilamentSortField;
  direction: "asc" | "desc";
}

export const DEFAULT_SORT: FilamentSort = { field: "owned", direction: "desc" };

const DEFAULT_DIRECTION: Record<FilamentSortField, "asc" | "desc"> = {
  material: "asc",
  product: "asc",
  color_name: "asc",
  owned: "desc",
  remain_grams: "desc",
};

export interface FilamentFilters {
  search: string;
  materials: string[];
  products: string[];
  colorFamilies: ColorFamily[];
  ownership: Ownership;
}

export const EMPTY_FILTERS: FilamentFilters = {
  search: "",
  materials: [],
  products: [],
  colorFamilies: [],
  ownership: "all",
};

function facetsAreActive(f: FilamentFilters): boolean {
  return (
    f.materials.length > 0 ||
    f.products.length > 0 ||
    f.colorFamilies.length > 0 ||
    f.ownership !== "all"
  );
}

function clearFacets(f: FilamentFilters): FilamentFilters {
  return {
    ...f,
    materials: [],
    products: [],
    colorFamilies: [],
    ownership: "all",
  };
}

interface PanelProps {
  catalog: readonly CatalogEntry[];
  filters: FilamentFilters;
  onFiltersChange: (next: FilamentFilters) => void;
  sort: FilamentSort;
  onSortChange: (sort: FilamentSort) => void;
}

export function FilamentFilterPanel({
  catalog,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
}: PanelProps) {
  const { t } = useTranslation();
  const { materials, products, colorFamilies: availableFamilies } = useMemo(
    () => deriveOptions(catalog, filters.materials),
    [catalog, filters.materials],
  );

  const update = <K extends keyof FilamentFilters>(
    key: K,
    value: FilamentFilters[K],
  ) => onFiltersChange({ ...filters, [key]: value });

  const changeMaterials = (next: string[]) => {
    if (next.length === 0) {
      onFiltersChange({ ...filters, materials: next });
      return;
    }
    const { products: valid, colorFamilies: validFams } = deriveOptions(
      catalog,
      next,
    );
    const validProducts = new Set(valid);
    const validFamSet = new Set(validFams);
    onFiltersChange({
      ...filters,
      materials: next,
      products: filters.products.filter((p) => validProducts.has(p)),
      colorFamilies: filters.colorFamilies.filter((f) => validFamSet.has(f)),
    });
  };

  return (
    <Stack gap="md">
      <Group gap="xs" wrap="nowrap" align="flex-end">
        <Select
          label={t("filaments.sort.label")}
          data={SORT_FIELDS.map((f) => ({
            value: f,
            label: t(`filaments.sort.${f}`),
          }))}
          value={sort.field}
          onChange={(v) => {
            if (!v) return;
            const field = v as FilamentSortField;
            onSortChange({ field, direction: DEFAULT_DIRECTION[field] });
          }}
          allowDeselect={false}
          style={{ flex: 1 }}
        />
        <Tooltip
          label={t(
            `filaments.sort.direction.${sort.direction === "asc" ? "asc" : "desc"}`,
          )}
        >
          <ActionIcon
            variant="default"
            size="lg"
            onClick={() =>
              onSortChange({
                ...sort,
                direction: sort.direction === "asc" ? "desc" : "asc",
              })
            }
            aria-label={t("filaments.sort.toggle_direction")}
          >
            {sort.direction === "asc" ? (
              <IconSortAscending size={16} />
            ) : (
              <IconSortDescending size={16} />
            )}
          </ActionIcon>
        </Tooltip>
      </Group>
      <PillPicker<string>
        label={t("filaments.filters.material")}
        placeholder={t("filaments.filters.material_placeholder")}
        value={filters.materials}
        onChange={changeMaterials}
        options={materials}
        getLabel={(v) => v}
      />
      <PillPicker<string>
        label={t("filaments.filters.product")}
        placeholder={t("filaments.filters.product_placeholder")}
        value={filters.products}
        onChange={(v) => update("products", v)}
        options={products}
        getLabel={(v) => v}
      />
      <PillPicker<ColorFamily>
        label={t("filaments.filters.color")}
        placeholder={t("filaments.filters.color_placeholder")}
        value={filters.colorFamilies}
        onChange={(v) => update("colorFamilies", v)}
        options={availableFamilies}
        getLabel={(v) => t(`color_family.${v}`)}
        renderAdornment={(v) => (
          <ColorSwatch hexes={[FAMILY_HEX[v]]} size={12} />
        )}
      />
      <Stack gap={6}>
        <Text size="sm" fw={500}>
          {t("filaments.filters.ownership.label")}
        </Text>
        <SegmentedControl
          fullWidth
          value={filters.ownership}
          onChange={(v) => update("ownership", v as Ownership)}
          data={[
            { value: "all", label: t("filaments.filters.ownership.all") },
            { value: "owned", label: t("filaments.filters.ownership.owned") },
            {
              value: "not_owned",
              label: t("filaments.filters.ownership.not_owned"),
            },
          ]}
        />
      </Stack>
      {facetsAreActive(filters) && (
        <Button
          variant="subtle"
          color="gray"
          size="xs"
          onClick={() => onFiltersChange(clearFacets(filters))}
        >
          {t("filaments.filters.clear")}
        </Button>
      )}
    </Stack>
  );
}

export type FilamentView = "table" | "grid" | "list";

interface Props extends PanelProps {
  view: FilamentView;
  onViewChange: (view: FilamentView) => void;
}

export function FilamentToolbar(props: Props) {
  const {
    catalog,
    filters,
    onFiltersChange,
    sort,
    onSortChange,
    view,
    onViewChange,
  } = props;
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [opened, { open, close }] = useDisclosure(false);

  const facetCount =
    filters.materials.length +
    filters.products.length +
    filters.colorFamilies.length +
    (filters.ownership !== "all" ? 1 : 0);

  return (
    <>
      <Group gap="xs" wrap="nowrap">
        <TextInput
          leftSection={<IconSearch size={14} />}
          placeholder={t("filaments.filters.search_placeholder")}
          value={filters.search}
          onChange={(e) =>
            onFiltersChange({ ...filters, search: e.currentTarget.value })
          }
          rightSection={
            filters.search ? (
              <ActionIcon
                variant="subtle"
                size="sm"
                color="gray"
                onClick={() => onFiltersChange({ ...filters, search: "" })}
                aria-label={t("common.clear")}
              >
                <IconX size={14} />
              </ActionIcon>
            ) : null
          }
          style={{ flex: 1 }}
        />
        {isMobile ? (
          <Button
            variant={facetCount > 0 ? "filled" : "default"}
            leftSection={<IconFilter size={14} />}
            onClick={open}
          >
            {facetCount > 0 ? (
              <Group gap={6} wrap="nowrap">
                {t("filaments.filters.label")}
                <Badge size="xs" color="gray" variant="white">
                  {facetCount}
                </Badge>
              </Group>
            ) : (
              t("filaments.filters.label")
            )}
          </Button>
        ) : (
          <SegmentedControl
            value={view}
            onChange={(v) => onViewChange(v as FilamentView)}
            data={[
              {
                value: "table",
                label: (
                  <Tooltip label={t("filaments.view.table")}>
                    <IconLayoutList size={16} />
                  </Tooltip>
                ),
              },
              {
                value: "grid",
                label: (
                  <Tooltip label={t("filaments.view.grid")}>
                    <IconLayoutGrid size={16} />
                  </Tooltip>
                ),
              },
              {
                value: "list",
                label: (
                  <Tooltip label={t("filaments.view.list")}>
                    <IconList size={16} />
                  </Tooltip>
                ),
              },
            ]}
          />
        )}
      </Group>

      {isMobile && (
        <Drawer
          opened={opened}
          onClose={close}
          position="bottom"
          size="auto"
          title={t("filaments.filters.label")}
        >
          <FilamentFilterPanel
            catalog={catalog}
            filters={filters}
            onFiltersChange={onFiltersChange}
            sort={sort}
            onSortChange={onSortChange}
          />
        </Drawer>
      )}
    </>
  );
}

function deriveOptions(
  catalog: readonly CatalogEntry[],
  selectedMaterials: readonly string[] = [],
) {
  const materials = new Set<string>();
  const products = new Set<string>();
  const families = new Set<ColorFamily>();
  const materialFilter = new Set(selectedMaterials);
  const cascadeActive = materialFilter.size > 0;
  for (const e of catalog) {
    if (e.material) materials.add(e.material);
    if (cascadeActive && (!e.material || !materialFilter.has(e.material)))
      continue;
    if (e.product) products.add(e.product);
    for (const h of spoolHexes(e)) {
      const fam = colorFamily(h);
      if (fam) families.add(fam);
    }
  }
  return {
    materials: [...materials].sort(),
    products: [...products].sort(),
    colorFamilies: COLOR_FAMILIES.filter((f) => families.has(f)),
  };
}

function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function primaryValue(
  row: FilamentRow,
  field: FilamentSortField,
): string | number | null {
  switch (field) {
    case "material":
      return row.entry.material;
    case "product":
      return row.entry.product;
    case "color_name":
      return row.entry.color_name;
    case "owned":
      return row.ownership ? 1 : 0;
    case "remain_grams":
      return row.ownership?.totalRemaining ?? null;
  }
}

export function applyFilamentSort(
  rows: readonly FilamentRow[],
  sort: FilamentSort,
): FilamentRow[] {
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const primary =
      compareValues(primaryValue(a, sort.field), primaryValue(b, sort.field)) *
      dir;
    if (primary !== 0) return primary;
    return (
      compareValues(a.entry.material, b.entry.material) ||
      compareValues(a.entry.product, b.entry.product) ||
      compareValues(a.entry.color_name, b.entry.color_name)
    );
  });
}

export function filamentStateToSearchParams(
  filters: FilamentFilters,
  sort: FilamentSort,
  view: FilamentView,
): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.search) p.set("q", filters.search);
  if (filters.materials.length) p.set("material", filters.materials.join(","));
  if (filters.products.length) p.set("product", filters.products.join(","));
  if (filters.colorFamilies.length)
    p.set("color", filters.colorFamilies.join(","));
  if (filters.ownership !== "all") p.set("own", filters.ownership);
  if (
    sort.field !== DEFAULT_SORT.field ||
    sort.direction !== DEFAULT_SORT.direction
  ) {
    p.set("sort", `${sort.field}:${sort.direction}`);
  }
  if (view !== "grid") p.set("view", view);
  return p;
}

const OWNERSHIP_VALUES: readonly Ownership[] = ["all", "owned", "not_owned"];
export const SORT_FIELDS: readonly FilamentSortField[] = [
  "material",
  "product",
  "color_name",
  "owned",
  "remain_grams",
];

export function searchParamsToFilamentState(params: URLSearchParams): {
  filters: FilamentFilters;
  sort: FilamentSort;
  view: FilamentView;
} {
  const ownRaw = params.get("own");
  const ownership = OWNERSHIP_VALUES.includes(ownRaw as Ownership)
    ? (ownRaw as Ownership)
    : "all";
  const filters: FilamentFilters = {
    search: params.get("q") ?? "",
    materials: params.get("material")?.split(",").filter(Boolean) ?? [],
    products: params.get("product")?.split(",").filter(Boolean) ?? [],
    colorFamilies: (params.get("color")?.split(",").filter(Boolean) ?? []).filter(
      (c): c is ColorFamily => COLOR_FAMILIES.includes(c as ColorFamily),
    ),
    ownership,
  };
  const sortParam = params.get("sort");
  let sort: FilamentSort = DEFAULT_SORT;
  if (sortParam) {
    const [field, direction] = sortParam.split(":");
    if (
      SORT_FIELDS.includes(field as FilamentSortField) &&
      (direction === "asc" || direction === "desc")
    ) {
      sort = { field: field as FilamentSortField, direction };
    }
  }
  const viewRaw = params.get("view");
  const view: FilamentView =
    viewRaw === "table" || viewRaw === "list" ? viewRaw : "grid";
  return { filters, sort, view };
}

export function applyFilamentFilters(
  rows: readonly FilamentRow[],
  filters: FilamentFilters,
): FilamentRow[] {
  const q = filters.search.trim().toLowerCase();
  const materialSet = new Set(filters.materials);
  const productSet = new Set(filters.products);
  const familySet = new Set(filters.colorFamilies);
  const out: FilamentRow[] = [];
  for (const row of rows) {
    const e = row.entry;
    if (q) {
      const hay = [e.color_name, e.product, e.material, e.sku, ...row.variantIds]
        .filter((v): v is string => !!v)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) continue;
    }
    if (materialSet.size > 0 && (!e.material || !materialSet.has(e.material)))
      continue;
    if (productSet.size > 0 && !productSet.has(e.product)) continue;
    if (familySet.size > 0) {
      let matched = false;
      for (const h of spoolHexes(e)) {
        const fam = colorFamily(h);
        if (fam && familySet.has(fam)) {
          matched = true;
          break;
        }
      }
      if (!matched) continue;
    }
    if (filters.ownership === "owned" && !row.ownership) continue;
    if (filters.ownership === "not_owned" && row.ownership) continue;
    out.push(row);
  }
  return out;
}
