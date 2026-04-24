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
  searchParamsToSpoolState,
  SORT_FIELDS,
  spoolStateToSearchParams,
  remainingGrams,
  SpoolFilterPanel,
  SpoolToolbar,
  type SpoolFilters,
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
  const isMobile = useIsMobile();
  const effectiveView: SpoolView = isMobile ? "list" : view;

  // Mirror filter/sort/view into the URL so back-navigation from a spool
  // detail page restores the user's view, and URLs are shareable. Debounced so
  // each keystroke in search doesn't trigger a Router re-render.
  const [debouncedFilters] = useDebouncedValue(filters, 250);
  useEffect(() => {
    setSearchParams(spoolStateToSearchParams(debouncedFilters, sort, view), {
      replace: true,
    });
  }, [debouncedFilters, sort, view, setSearchParams]);

  const filtered = useMemo(
    () => (spools ? applySpoolFilters(spools, filters, loadedTags) : []),
    [spools, filters, loadedTags],
  );

  const sorted = useMemo(
    () => applySpoolSort(filtered, sort),
    [filtered, sort],
  );

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

  const sortStatus: DataTableSortStatus<Spool> = {
    columnAccessor: sort.field,
    direction: sort.direction,
  };

  const handleSortStatusChange = (status: DataTableSortStatus<Spool>) => {
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
          {sorted.length === 0 ? (
            <Box p="md" style={{ overflow: "auto" }}>
              <EmptyStateCard description={t("spools.no_match")} />
            </Box>
          ) : effectiveView === "grid" || effectiveView === "list" ? (
            <Box
              ref={panelScrollRef}
              p={effectiveView === "grid" ? "md" : 0}
              style={{ flex: 1, overflow: "auto" }}
            >
              {effectiveView === "grid" ? (
                <SpoolGrid spools={sorted} onOpen={openSpool} />
              ) : (
                <SpoolList spools={sorted} onOpen={openSpool} />
              )}
            </Box>
          ) : (
            <DataTable
              height="100%"
              scrollViewportRef={tableScrollRef}
              withTableBorder={false}
              highlightOnHover
              records={sorted}
              idAccessor="tag_id"
              sortStatus={sortStatus}
              onSortStatusChange={handleSortStatusChange}
              onRowClick={({ record }) => openSpool(record.tag_id)}
              columns={[
                {
                  accessor: "color_hex",
                  title: "",
                  sortable: false,
                  width: 40,
                  render: (spool) => (
                    <ColorSwatch
                      hexes={spoolHexes(spool)}
                      size={24}
                      round
                    />
                  ),
                },
                {
                  accessor: "color_name",
                  title: t("spools.columns.color_name"),
                  sortable: true,
                  render: (spool) => (
                    <Text size="sm" fw={500}>
                      {spool.color_name ?? "—"}
                    </Text>
                  ),
                },
                {
                  accessor: "product",
                  title: t("spools.columns.product"),
                  sortable: true,
                  render: (spool) => (
                    <Text size="sm">{spool.product ?? "—"}</Text>
                  ),
                },
                {
                  accessor: "material",
                  title: t("spools.columns.material"),
                  sortable: true,
                },
                {
                  accessor: "remain",
                  title: t("spools.columns.remaining"),
                  sortable: true,
                  width: 200,
                  render: (spool) =>
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
                },
                {
                  accessor: "in_ams",
                  title: t("spools.columns.in_ams"),
                  sortable: false,
                  width: 90,
                  textAlign: "center",
                  render: (spool) =>
                    loadedTags.has(spool.tag_id) ? (
                      <Text size="sm">{t("common.yes")}</Text>
                    ) : (
                      <Text size="sm" c="dimmed">—</Text>
                    ),
                },
                {
                  accessor: "last_used",
                  title: t("spools.columns.last_used"),
                  sortable: true,
                  render: (spool) => (
                    <Text size="xs" c="dimmed">
                      {formatDate(spool.last_used)}
                    </Text>
                  ),
                },
              ]}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}
