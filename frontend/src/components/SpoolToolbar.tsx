import {
  ActionIcon,
  Badge,
  Button,
  Drawer,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
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
import type { Spool } from "../api";
import {
  COLOR_FAMILIES,
  FAMILY_HEX,
  colorFamily,
  type ColorFamily,
} from "../lib/colorFamily";
import { PillPicker } from "./PillPicker";

function FamilySwatch({ family, size = 12 }: { family: ColorFamily; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 3,
        background: FAMILY_HEX[family],
        border: "1px solid rgba(0,0,0,0.12)",
        flexShrink: 0,
      }}
    />
  );
}

type SpoolStockLevel = "all" | "low" | "full";

export type SpoolSortField =
  | "last_updated"
  | "last_used"
  | "first_seen"
  | "remain"
  | "remain_grams"
  | "material"
  | "product"
  | "color_name";

export interface SpoolSort {
  field: SpoolSortField;
  direction: "asc" | "desc";
}

export const DEFAULT_SORT: SpoolSort = { field: "last_updated", direction: "desc" };

// Sensible defaults per field — newest-first for dates, lowest-first for
// "remaining" so low-stock rises to the top, alphabetical for text.
const DEFAULT_DIRECTION: Record<SpoolSortField, "asc" | "desc"> = {
  last_updated: "desc",
  last_used: "desc",
  first_seen: "desc",
  remain: "asc",
  remain_grams: "asc",
  material: "asc",
  product: "asc",
  color_name: "asc",
};

export interface SpoolFilters {
  search: string;
  materials: string[];
  products: string[];
  colorFamilies: ColorFamily[];
  stock: SpoolStockLevel;
  amsOnly: boolean;
  weightUnknown: boolean;
}

export const EMPTY_FILTERS: SpoolFilters = {
  search: "",
  materials: [],
  products: [],
  colorFamilies: [],
  stock: "all",
  amsOnly: false,
  weightUnknown: false,
};

function facetsAreActive(f: SpoolFilters): boolean {
  return (
    f.materials.length > 0 ||
    f.products.length > 0 ||
    f.colorFamilies.length > 0 ||
    f.stock !== "all" ||
    f.amsOnly ||
    f.weightUnknown
  );
}

function clearFacets(f: SpoolFilters): SpoolFilters {
  return {
    ...f,
    materials: [],
    products: [],
    colorFamilies: [],
    stock: "all",
    amsOnly: false,
    weightUnknown: false,
  };
}

interface PanelProps {
  spools: readonly Spool[];
  filters: SpoolFilters;
  onFiltersChange: (next: SpoolFilters) => void;
  sort: SpoolSort;
  onSortChange: (sort: SpoolSort) => void;
}

/**
 * Stacked filter + sort controls. Used in the desktop sidebar
 * and inside the mobile drawer.
 */
export function SpoolFilterPanel({
  spools,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
}: PanelProps) {
  const { t } = useTranslation();
  const { materials, products, colorFamilies: availableFamilies } = useMemo(
    () => deriveOptions(spools),
    [spools],
  );

  const update = <K extends keyof SpoolFilters>(
    key: K,
    value: SpoolFilters[K],
  ) => onFiltersChange({ ...filters, [key]: value });

  const sortFields: SpoolSortField[] = [
    "last_updated",
    "last_used",
    "first_seen",
    "remain",
    "remain_grams",
    "material",
    "product",
    "color_name",
  ];

  return (
    <Stack gap="md">
      <Group gap="xs" wrap="nowrap" align="flex-end">
        <Select
          label={t("spools.sort.label")}
          data={sortFields.map((f) => ({
            value: f,
            label: t(`spools.sort.${f}`),
          }))}
          value={sort.field}
          onChange={(v) => {
            if (!v) return;
            const field = v as SpoolSortField;
            onSortChange({ field, direction: DEFAULT_DIRECTION[field] });
          }}
          allowDeselect={false}
          style={{ flex: 1 }}
        />
        <Tooltip
          label={t(
            `spools.sort.direction.${sort.direction === "asc" ? "asc" : "desc"}`,
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
            aria-label={t("spools.sort.toggle_direction")}
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
        label={t("spools.filters.material")}
        placeholder={t("spools.filters.material_placeholder")}
        value={filters.materials}
        onChange={(v) => update("materials", v)}
        options={materials}
        getLabel={(v) => v}
      />
      <PillPicker<string>
        label={t("spools.filters.product")}
        placeholder={t("spools.filters.product_placeholder")}
        value={filters.products}
        onChange={(v) => update("products", v)}
        options={products}
        getLabel={(v) => v}
      />
      <PillPicker<ColorFamily>
        label={t("spools.filters.color")}
        placeholder={t("spools.filters.color_placeholder")}
        value={filters.colorFamilies}
        onChange={(v) => update("colorFamilies", v)}
        options={availableFamilies}
        getLabel={(v) => t(`color_family.${v}`)}
        renderAdornment={(v) => <FamilySwatch family={v} size={12} />}
      />
      <Stack gap={6}>
        <Text size="sm" fw={500}>
          {t("spools.filters.stock.label")}
        </Text>
        <SegmentedControl
          fullWidth
          value={filters.stock}
          onChange={(v) => update("stock", v as SpoolStockLevel)}
          data={[
            { value: "all", label: t("spools.filters.stock.all") },
            { value: "low", label: t("spools.filters.stock.low") },
            { value: "full", label: t("spools.filters.stock.full") },
          ]}
        />
      </Stack>
      <Switch
        label={t("spools.filters.ams_only")}
        checked={filters.amsOnly}
        onChange={(e) => update("amsOnly", e.currentTarget.checked)}
      />
      <Switch
        label={t("spools.filters.weight_unknown")}
        checked={filters.weightUnknown}
        onChange={(e) => update("weightUnknown", e.currentTarget.checked)}
      />
      {facetsAreActive(filters) && (
        <Button
          variant="subtle"
          color="gray"
          size="xs"
          onClick={() => onFiltersChange(clearFacets(filters))}
        >
          {t("spools.filters.clear")}
        </Button>
      )}
    </Stack>
  );
}

export type SpoolView = "table" | "grid" | "list";

interface Props extends PanelProps {
  loadedTags: ReadonlySet<string>;
  view: SpoolView;
  onViewChange: (view: SpoolView) => void;
}

/**
 * Search input + (on mobile) a Filter button that opens a bottom
 * drawer containing the SpoolFilterPanel. On desktop, callers render
 * the panel separately in a sidebar.
 */
export function SpoolToolbar(props: Props) {
  const {
    spools,
    filters,
    onFiltersChange,
    sort,
    onSortChange,
    view,
    onViewChange,
  } = props;
  const { t } = useTranslation();
  const isMobile = useMediaQuery("(max-width: 48em)") ?? false;
  const [opened, { open, close }] = useDisclosure(false);

  const facetCount =
    filters.materials.length +
    filters.products.length +
    filters.colorFamilies.length +
    (filters.stock !== "all" ? 1 : 0) +
    (filters.amsOnly ? 1 : 0) +
    (filters.weightUnknown ? 1 : 0);

  return (
    <>
      <Group gap="xs" wrap="nowrap">
        <TextInput
          leftSection={<IconSearch size={14} />}
          placeholder={t("spools.filters.search_placeholder")}
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
                {t("spools.filters.label")}
                <Badge size="xs" color="gray" variant="white">
                  {facetCount}
                </Badge>
              </Group>
            ) : (
              t("spools.filters.label")
            )}
          </Button>
        ) : (
          <SegmentedControl
            value={view}
            onChange={(v) => onViewChange(v as SpoolView)}
            data={[
              {
                value: "table",
                label: (
                  <Tooltip label={t("spools.view.table")}>
                    <IconLayoutList size={16} />
                  </Tooltip>
                ),
              },
              {
                value: "list",
                label: (
                  <Tooltip label={t("spools.view.list")}>
                    <IconList size={16} />
                  </Tooltip>
                ),
              },
              {
                value: "grid",
                label: (
                  <Tooltip label={t("spools.view.grid")}>
                    <IconLayoutGrid size={16} />
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
          title={t("spools.filters.label")}
        >
          <SpoolFilterPanel
            spools={spools}
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

function deriveOptions(spools: readonly Spool[]) {
  const materials = new Set<string>();
  const products = new Set<string>();
  const families = new Set<ColorFamily>();
  for (const s of spools) {
    if (s.material) materials.add(s.material);
    if (s.product) products.add(s.product);
    const fam = colorFamily(s.color_hex);
    if (fam) families.add(fam);
  }
  return {
    materials: [...materials].sort(),
    products: [...products].sort(),
    colorFamilies: COLOR_FAMILIES.filter((f) => families.has(f)),
  };
}

export function remainingGrams(spool: Spool): number | null {
  if (spool.weight == null || spool.remain == null) return null;
  return (spool.weight * spool.remain) / 100;
}

function sortValue(spool: Spool, field: SpoolSortField): string | number | null {
  switch (field) {
    case "last_updated": return spool.last_updated;
    case "last_used": return spool.last_used;
    case "first_seen": return spool.first_seen;
    case "remain": return spool.remain;
    case "remain_grams": return remainingGrams(spool);
    case "material": return spool.material;
    case "product": return spool.product;
    case "color_name": return spool.color_name;
  }
}

export function applySpoolSort(
  spools: readonly Spool[],
  sort: SpoolSort,
): Spool[] {
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...spools].sort((a, b) => {
    const av = sortValue(a, sort.field);
    const bv = sortValue(b, sort.field);
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // nulls last regardless of direction
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

export function spoolStateToSearchParams(
  filters: SpoolFilters,
  sort: SpoolSort,
  view: SpoolView,
): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.search) p.set("q", filters.search);
  if (filters.materials.length) p.set("material", filters.materials.join(","));
  if (filters.products.length) p.set("product", filters.products.join(","));
  if (filters.colorFamilies.length) p.set("color", filters.colorFamilies.join(","));
  if (filters.stock !== "all") p.set("stock", filters.stock);
  if (filters.amsOnly) p.set("ams", "1");
  if (filters.weightUnknown) p.set("noweight", "1");
  if (sort.field !== DEFAULT_SORT.field || sort.direction !== DEFAULT_SORT.direction) {
    p.set("sort", `${sort.field}:${sort.direction}`);
  }
  if (view !== "table") p.set("view", view);
  return p;
}

const STOCK_LEVELS: readonly SpoolStockLevel[] = ["all", "low", "full"];
const SORT_FIELDS: readonly SpoolSortField[] = [
  "last_updated",
  "last_used",
  "first_seen",
  "remain",
  "remain_grams",
  "material",
  "product",
  "color_name",
];

export function searchParamsToSpoolState(params: URLSearchParams): {
  filters: SpoolFilters;
  sort: SpoolSort;
  view: SpoolView;
} {
  const stockRaw = params.get("stock");
  const stock = STOCK_LEVELS.includes(stockRaw as SpoolStockLevel)
    ? (stockRaw as SpoolStockLevel)
    : "all";
  const filters: SpoolFilters = {
    search: params.get("q") ?? "",
    materials: params.get("material")?.split(",").filter(Boolean) ?? [],
    products: params.get("product")?.split(",").filter(Boolean) ?? [],
    colorFamilies: (params.get("color")?.split(",").filter(Boolean) ?? []).filter(
      (c): c is ColorFamily => COLOR_FAMILIES.includes(c as ColorFamily),
    ),
    stock,
    amsOnly: params.get("ams") === "1",
    weightUnknown: params.get("noweight") === "1",
  };
  const sortParam = params.get("sort");
  let sort: SpoolSort = DEFAULT_SORT;
  if (sortParam) {
    const [field, direction] = sortParam.split(":");
    if (
      SORT_FIELDS.includes(field as SpoolSortField) &&
      (direction === "asc" || direction === "desc")
    ) {
      sort = { field: field as SpoolSortField, direction };
    }
  }
  const viewRaw = params.get("view");
  const view: SpoolView =
    viewRaw === "grid" || viewRaw === "list" ? viewRaw : "table";
  return { filters, sort, view };
}

export function applySpoolFilters(
  spools: readonly Spool[],
  filters: SpoolFilters,
  loadedTags: ReadonlySet<string>,
): Spool[] {
  const q = filters.search.trim().toLowerCase();
  const out: Spool[] = [];
  for (const s of spools) {
    if (q) {
      const hay = [s.color_name, s.product, s.material, s.variant_id]
        .filter((v): v is string => !!v)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) continue;
    }
    if (filters.materials.length > 0) {
      if (!s.material || !filters.materials.includes(s.material)) continue;
    }
    if (filters.products.length > 0) {
      if (!s.product || !filters.products.includes(s.product)) continue;
    }
    if (filters.colorFamilies.length > 0) {
      const fam = colorFamily(s.color_hex);
      if (!fam || !filters.colorFamilies.includes(fam)) continue;
    }
    switch (filters.stock) {
      case "low":
        if (s.remain == null || s.remain >= 20) continue;
        break;
      case "full":
        if (s.remain == null || s.remain < 95) continue;
        break;
    }
    if (filters.amsOnly && !loadedTags.has(s.tag_id)) continue;
    if (filters.weightUnknown && s.weight != null) continue;
    out.push(s);
  }
  return out;
}
