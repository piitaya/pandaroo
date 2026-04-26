import {
  Alert,
  Box,
  Group,
  Loader,
  Progress,
  Text,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useEffect, useMemo, useState } from "react";
import { useViewStorage } from "../lib/useViewStorage";
import { useScrollSaveRestore } from "../lib/useScrollSaveRestore";
import { groupRows, type RowGroup } from "../lib/groupRows";
import {
  buildTableRecords,
  dataCell,
  isGroupHeaderRow,
  makeGroupRowFactory,
  type WithGroupHeader,
} from "../lib/groupedTableRecords";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Spool } from "../api";
import { useLoadedTagIds, useSpools } from "../hooks";
import { useIsMobile } from "../lib/breakpoints";
import { formatGrams } from "../lib/format";
import { ColorSwatch } from "../components/ColorSwatch";
import { spoolHexes } from "../components/spoolLabel";
import { spoolFillColor } from "../components/spoolFillColor";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { PageShell } from "../components/PageShell";
import { SpoolGrid } from "../components/SpoolGrid";
import { SpoolList } from "../components/SpoolList";
import {
  applySpoolFilters,
  applySpoolSort,
  getSpoolGroupKey,
  getSpoolGroupLabel,
  searchParamsToSpoolState,
  SORT_FIELDS,
  spoolStateToSearchParams,
  remainingGrams,
  SpoolFilterPanel,
  SpoolToolbar,
  type SpoolFilters,
  type SpoolGroupBy,
  type SpoolSort,
  type SpoolSortField,
  type SpoolView,
} from "../components/SpoolToolbar";

const SPOOL_VIEW_STORAGE_KEY = "pandaroo.spools.view";
const SPOOL_VIEW_VALUES: readonly SpoolView[] = ["table", "grid", "list"];

function formatDate(value: string | null): string {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  return new Date(normalized).toLocaleString();
}

export default function SpoolsPage() {
  const { data: spools, isLoading, isError, error } = useSpools();
  const loadedTags = useLoadedTagIds();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<SpoolFilters>(
    () => searchParamsToSpoolState(searchParams).filters,
  );
  const [sort, setSort] = useState<SpoolSort>(
    () => searchParamsToSpoolState(searchParams).sort,
  );
  const [view, setView] = useViewStorage<SpoolView>(
    SPOOL_VIEW_STORAGE_KEY,
    SPOOL_VIEW_VALUES,
    () => searchParamsToSpoolState(searchParams).view,
    searchParams.has("view"),
  );
  const [groupBy, setGroupBy] = useState<SpoolGroupBy>(
    () => searchParamsToSpoolState(searchParams).groupBy,
  );
  const isMobile = useIsMobile();
  const effectiveView: SpoolView = isMobile ? "list" : view;

  // Mirror filter/sort/view into the URL so back-navigation from a spool
  // detail page restores the user's view, and URLs are shareable. Debounced so
  // each keystroke in search doesn't trigger a Router re-render.
  const [debouncedFilters] = useDebouncedValue(filters, 250);
  useEffect(() => {
    setSearchParams(
      spoolStateToSearchParams(debouncedFilters, sort, view, groupBy),
      { replace: true },
    );
  }, [debouncedFilters, sort, view, groupBy, setSearchParams]);

  const filtered = useMemo(
    () => (spools ? applySpoolFilters(spools, filters, loadedTags) : []),
    [spools, filters, loadedTags],
  );

  const sorted = useMemo(
    () => applySpoolSort(filtered, sort),
    [filtered, sort],
  );

  const groups = useMemo<RowGroup<Spool>[]>(() => {
    if (groupBy === "none") {
      return [{ key: "", label: "", rows: sorted }];
    }
    return groupRows(
      sorted,
      (s) => getSpoolGroupKey(s, groupBy),
      (k) => getSpoolGroupLabel(k, groupBy, t),
    );
  }, [sorted, groupBy, t]);

  const tableRecords = useMemo(() => buildTableRecords(groups), [groups]);

  const { panelScrollRef, tableScrollRef, saveScroll } = useScrollSaveRestore(
    effectiveView,
    sorted.length,
  );
  const navigate = useNavigate();
  const location = useLocation();

  const openSpool = (tagId: string) => {
    saveScroll();
    navigate(`/inventory/${encodeURIComponent(tagId)}`);
  };

  useEffect(() => {
    const state = location.state as { selectTagId?: string } | null;
    if (state?.selectTagId) {
      navigate(`/inventory/${encodeURIComponent(state.selectTagId)}`, {
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortStatus: DataTableSortStatus<WithGroupHeader<Spool>> = {
    columnAccessor: sort.field,
    direction: sort.direction,
  };

  const handleSortStatusChange = (
    status: DataTableSortStatus<WithGroupHeader<Spool>>,
  ) => {
    const accessor = status.columnAccessor as string;
    if (SORT_FIELDS.includes(accessor as SpoolSortField)) {
      setSort({ field: accessor as SpoolSortField, direction: status.direction });
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
        <Alert color="red" title={t("spools.failed_to_load")}>
          {error instanceof Error ? error.message : String(error)}
        </Alert>
      </PageShell>
    );
  }
  if (!spools || spools.length === 0) {
    return (
      <PageShell>
        <EmptyStateCard description={t("spools.empty")} />
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
        <SpoolToolbar
          spools={spools}
          loadedTags={loadedTags}
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
          <SpoolFilterPanel
            spools={spools}
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
              <EmptyStateCard description={t("spools.no_match")} />
            </Box>
          )}
          {sorted.length > 0 && effectiveView === "grid" && (
            <Box
              ref={panelScrollRef}
              style={{ flex: 1, overflow: "auto" }}
            >
              <SpoolGrid groups={groups} onOpen={openSpool} />
            </Box>
          )}
          {sorted.length > 0 && effectiveView === "list" && (
            <Box
              ref={panelScrollRef}
              style={{ flex: 1, overflow: "auto" }}
            >
              <SpoolList groups={groups} onOpen={openSpool} />
            </Box>
          )}
          {sorted.length > 0 && effectiveView === "table" && (
            <DataTable<WithGroupHeader<Spool>>
              height="100%"
              scrollViewportRef={tableScrollRef}
              withTableBorder={false}
              highlightOnHover
              records={tableRecords}
              idAccessor={(r) => (isGroupHeaderRow(r) ? r.key : r.tag_id)}
              sortStatus={sortStatus}
              onSortStatusChange={handleSortStatusChange}
              onRowClick={({ record }) => {
                if (isGroupHeaderRow(record)) return;
                openSpool(record.tag_id);
              }}
              rowFactory={makeGroupRowFactory<Spool>(7)}
              columns={[
                {
                  accessor: "color_hex",
                  title: "",
                  sortable: false,
                  width: 40,
                  render: dataCell<Spool>((spool) => (
                    <ColorSwatch
                      hexes={spoolHexes(spool)}
                      size={24}
                      round
                    />
                  )),
                },
                {
                  accessor: "color_name",
                  title: t("spools.columns.color_name"),
                  sortable: true,
                  render: dataCell<Spool>((spool) => (
                    <Text size="sm" fw={500}>
                      {spool.color_name ?? "—"}
                    </Text>
                  )),
                },
                {
                  accessor: "product",
                  title: t("spools.columns.product"),
                  sortable: true,
                  render: dataCell<Spool>((spool) => (
                    <Text size="sm">{spool.product ?? "—"}</Text>
                  )),
                },
                {
                  accessor: "material",
                  title: t("spools.columns.material"),
                  sortable: true,
                  render: dataCell<Spool>((spool) => (
                    <Text size="sm">{spool.material ?? "—"}</Text>
                  )),
                },
                {
                  accessor: "remain",
                  title: t("spools.columns.remaining"),
                  sortable: true,
                  width: 200,
                  render: dataCell<Spool>((spool) =>
                    spool.remain != null ? (
                      <Group gap="xs" wrap="nowrap">
                        <Progress
                          value={spool.remain}
                          size="sm"
                          style={{ flex: 1 }}
                          color={spoolFillColor(spool.remain)}
                        />
                        <Text size="xs" w={64} ta="right">
                          {formatGrams(remainingGrams(spool))}
                        </Text>
                      </Group>
                    ) : (
                      <Text c="dimmed" size="sm">—</Text>
                    ),
                  ),
                },
                {
                  accessor: "in_ams",
                  title: t("spools.columns.in_ams"),
                  sortable: false,
                  width: 90,
                  textAlign: "center",
                  render: dataCell<Spool>((spool) =>
                    loadedTags.has(spool.tag_id) ? (
                      <Text size="sm">{t("common.yes")}</Text>
                    ) : (
                      <Text size="sm" c="dimmed">—</Text>
                    ),
                  ),
                },
                {
                  accessor: "last_used",
                  title: t("spools.columns.last_used"),
                  sortable: true,
                  render: dataCell<Spool>((spool) => (
                    <Text size="xs" c="dimmed">
                      {formatDate(spool.last_used)}
                    </Text>
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
