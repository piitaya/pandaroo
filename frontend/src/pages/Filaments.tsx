import {
  Alert,
  Badge,
  Box,
  Group,
  Loader,
  Text,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { CatalogEntry } from "../api";
import { useFilamentCatalogEntries, useSpools } from "../hooks";
import { useIsMobile } from "../lib/breakpoints";
import { useScrollSaveRestore } from "../lib/useScrollSaveRestore";
import { useViewStorage } from "../lib/useViewStorage";
import { groupRows, type RowGroup } from "../lib/groupRows";
import {
  buildTableRecords,
  dataCell,
  isGroupHeaderRow,
  makeGroupRowFactory,
  type WithGroupHeader,
} from "../lib/groupedTableRecords";
import { formatGrams } from "../lib/format";
import { ColorSwatch } from "../components/ColorSwatch";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { PageShell } from "../components/PageShell";
import { FilamentGrid } from "../components/FilamentGrid";
import { FilamentList } from "../components/FilamentList";
import { spoolHexes } from "../components/spoolLabel";
import {
  aggregateBySku,
  applyFilamentFilters,
  applyFilamentSort,
  filamentStateToSearchParams,
  getFilamentGroupKey,
  getFilamentGroupLabel,
  searchParamsToFilamentState,
  SORT_FIELDS,
  FilamentFilterPanel,
  FilamentToolbar,
  type FilamentFilters,
  type FilamentGroupBy,
  type FilamentRow,
  type FilamentSort,
  type FilamentSortField,
  type FilamentView,
} from "../components/FilamentToolbar";

const FILAMENT_VIEW_STORAGE_KEY = "pandaroo.filaments.view";
const FILAMENT_VIEW_VALUES: readonly FilamentView[] = ["table", "grid", "list"];

export default function FilamentsPage() {
  const { data: catalog, isLoading, isError, error } = useFilamentCatalogEntries();
  const { data: spools } = useSpools();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<FilamentFilters>(
    () => searchParamsToFilamentState(searchParams).filters,
  );
  const [sort, setSort] = useState<FilamentSort>(
    () => searchParamsToFilamentState(searchParams).sort,
  );
  const [view, setView] = useViewStorage<FilamentView>(
    FILAMENT_VIEW_STORAGE_KEY,
    FILAMENT_VIEW_VALUES,
    () => searchParamsToFilamentState(searchParams).view,
    searchParams.has("view"),
  );
  const [groupBy, setGroupBy] = useState<FilamentGroupBy>(
    () => searchParamsToFilamentState(searchParams).groupBy,
  );
  const isMobile = useIsMobile();
  const effectiveView: FilamentView = isMobile ? "list" : view;
  const navigate = useNavigate();

  const [debouncedFilters] = useDebouncedValue(filters, 250);
  useEffect(() => {
    setSearchParams(
      filamentStateToSearchParams(debouncedFilters, sort, view, groupBy),
      { replace: true },
    );
  }, [debouncedFilters, sort, view, groupBy, setSearchParams]);

  const rows = useMemo<FilamentRow[]>(
    () => aggregateBySku(catalog ?? [], spools ?? []),
    [catalog, spools],
  );
  const filtered = useMemo(
    () => applyFilamentFilters(rows, filters),
    [rows, filters],
  );
  const sorted = useMemo(
    () => applyFilamentSort(filtered, sort),
    [filtered, sort],
  );

  const groups = useMemo<RowGroup<FilamentRow>[]>(() => {
    if (groupBy === "none") {
      return [{ key: "", label: "", rows: sorted }];
    }
    return groupRows(
      sorted,
      (r) => getFilamentGroupKey(r, groupBy),
      (k) => getFilamentGroupLabel(k, groupBy, t),
    );
  }, [sorted, groupBy, t]);

  const tableRecords = useMemo(() => buildTableRecords(groups), [groups]);

  const { panelScrollRef, tableScrollRef, saveScroll } = useScrollSaveRestore(
    effectiveView,
    sorted.length,
  );

  const openFilament = (variantIds: string[]) => {
    saveScroll();
    const params = new URLSearchParams();
    if (variantIds.length) params.set("variant", variantIds.join(","));
    navigate(`/inventory?${params.toString()}`);
  };

  const sortStatus: DataTableSortStatus<WithGroupHeader<FilamentRow>> = {
    columnAccessor: sort.field,
    direction: sort.direction,
  };

  const handleSortStatusChange = (
    status: DataTableSortStatus<WithGroupHeader<FilamentRow>>,
  ) => {
    const accessor = status.columnAccessor as string;
    if (SORT_FIELDS.includes(accessor as FilamentSortField)) {
      setSort({ field: accessor as FilamentSortField, direction: status.direction });
    }
  };

  if (isLoading) {
    return (
      <PageShell>
        <Loader />
      </PageShell>
    );
  }
  if (isError) {
    return (
      <PageShell>
        <Alert color="red" title={t("filaments.failed_to_load")}>
          {error instanceof Error ? error.message : String(error)}
        </Alert>
      </PageShell>
    );
  }
  if (!catalog || catalog.length === 0) {
    return (
      <PageShell>
        <EmptyStateCard description={t("filaments.empty")} />
      </PageShell>
    );
  }

  return (
    <Box style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box
        component="header"
        p="sm"
        style={{
          flexShrink: 0,
          borderBottom: "1px solid var(--mantine-color-default-border)",
        }}
      >
        <FilamentToolbar
          catalog={catalog}
          filters={filters}
          onFiltersChange={setFilters}
          sort={sort}
          onSortChange={setSort}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          view={view}
          onViewChange={setView}
        />
      </Box>
      <Box style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <Box
          component="aside"
          w={320}
          visibleFrom="sm"
          p="md"
          style={{
            flexShrink: 0,
            overflow: "auto",
            borderRight: "1px solid var(--mantine-color-default-border)",
          }}
        >
          <FilamentFilterPanel
            catalog={catalog}
            filters={filters}
            onFiltersChange={setFilters}
            sort={sort}
            onSortChange={setSort}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
          />
        </Box>
        <Box
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {sorted.length === 0 && (
            <Box p="md" style={{ overflow: "auto" }}>
              <EmptyStateCard description={t("filaments.no_match")} />
            </Box>
          )}
          {sorted.length > 0 && effectiveView === "grid" && (
            <Box
              ref={panelScrollRef}
              style={{ flex: 1, overflow: "auto" }}
            >
              <FilamentGrid groups={groups} onOpen={openFilament} />
            </Box>
          )}
          {sorted.length > 0 && effectiveView === "list" && (
            <Box
              ref={panelScrollRef}
              style={{ flex: 1, overflow: "auto" }}
            >
              <FilamentList groups={groups} onOpen={openFilament} />
            </Box>
          )}
          {sorted.length > 0 && effectiveView === "table" && (
            <DataTable<WithGroupHeader<FilamentRow>>
              height="100%"
              scrollViewportRef={tableScrollRef}
              withTableBorder={false}
              highlightOnHover
              records={tableRecords}
              idAccessor={(r) =>
                isGroupHeaderRow(r) ? r.key : `${r.entry.sku}::${r.entry.product}`
              }
              sortStatus={sortStatus}
              onSortStatusChange={handleSortStatusChange}
              onRowClick={({ record }) => {
                if (isGroupHeaderRow(record)) return;
                openFilament(record.variantIds);
              }}
              rowFactory={makeGroupRowFactory<FilamentRow>(7)}
              columns={[
                {
                  accessor: "color_hex",
                  title: "",
                  sortable: false,
                  width: 40,
                  render: dataCell<FilamentRow>(({ entry }) => (
                    <ColorSwatch hexes={spoolHexes(entry)} size={24} round />
                  )),
                },
                {
                  accessor: "color_name",
                  title: t("filaments.columns.color_name"),
                  sortable: true,
                  render: dataCell<FilamentRow>(({ entry }) => (
                    <Text size="sm" fw={500}>
                      {entry.color_name}
                    </Text>
                  )),
                },
                {
                  accessor: "product",
                  title: t("filaments.columns.product"),
                  sortable: true,
                  render: dataCell<FilamentRow>(
                    ({ entry }: { entry: CatalogEntry }) => (
                      <Text size="sm">{entry.product}</Text>
                    ),
                  ),
                },
                {
                  accessor: "material",
                  title: t("filaments.columns.material"),
                  sortable: true,
                  render: dataCell<FilamentRow>(({ entry }) => (
                    <Text size="sm">{entry.material ?? "—"}</Text>
                  )),
                },
                {
                  accessor: "sku",
                  title: t("filaments.columns.sku"),
                  sortable: false,
                  render: dataCell<FilamentRow>(({ entry }) => (
                    <Text size="xs" ff="monospace" c="dimmed">
                      {entry.sku}
                    </Text>
                  )),
                },
                {
                  accessor: "owned",
                  title: t("filaments.columns.owned"),
                  sortable: true,
                  render: dataCell<FilamentRow>(({ ownership }) =>
                    ownership ? (
                      <Badge size="sm" variant="light" color="green">
                        {t("filaments.ownership.n_spools", {
                          count: ownership.spools.length,
                        })}
                      </Badge>
                    ) : (
                      <Text size="xs" c="dimmed">
                        {t("filaments.ownership.not_owned")}
                      </Text>
                    ),
                  ),
                },
                {
                  accessor: "remain_grams",
                  title: t("filaments.columns.remaining"),
                  sortable: true,
                  width: 120,
                  render: dataCell<FilamentRow>(({ ownership }) => (
                    <Group justify="flex-end" gap="xs">
                      <Text size="xs">
                        {ownership && ownership.totalRemaining != null
                          ? formatGrams(ownership.totalRemaining)
                          : "—"}
                      </Text>
                    </Group>
                  )),
                },
              ]}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}
