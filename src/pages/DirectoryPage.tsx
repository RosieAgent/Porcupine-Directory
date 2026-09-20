import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Box,
  Chip,
  Collapse,
  Stack,
  Typography,
  Link,
} from "@mui/material";
import FilterList from "@mui/icons-material/FilterList";
import ViewModuleOutlined from "@mui/icons-material/ViewModuleOutlined";
import TableRowsOutlined from "@mui/icons-material/TableRowsOutlined";
import { ListingTable } from "../components/ListingTable";
import { Link as RouterLink, useLocation, useSearchParams } from "react-router";
import {
  kindLabels,
  kindPaths,
  listingQuerySchema,
} from "../../shared/contracts";
import type { ListingKind } from "../../shared/contracts";
import { queries } from "../lib/api";
import { updatedSearch } from "../lib/urls";
import { Empty, ErrorState, Loading, Page } from "../components/Page";
import { Paging } from "../components/Paging";
import { IconAction } from "../components/IconAction";
import { ListingCard } from "../components/ListingCard";
import { FilterComponent } from "../components/FilterComponent";

export default function DirectoryPage() {
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterPanelId = useId();
  const section = (Object.keys(kindPaths) as ListingKind[]).find(
    (kind) => kind !== "entry" && kindPaths[kind] === pathname,
  );
  const effective = new URLSearchParams(params);
  if (section) effective.set("kind", section);
  const parsed = listingQuerySchema.safeParse(Object.fromEntries(effective));
  const filters = parsed.success ? parsed.data : listingQuerySchema.parse({});
  const result = useQuery({
    ...queries.listings(effective.toString()),
    enabled: parsed.success,
  });
  const catalog = useQuery(queries.tags);
  const change = (values: Record<string, string | undefined>) =>
    setParams(updatedSearch(params, values));
  const activeCount = [
    filters.q,
    !section && filters.kind,
    filters.access,
    filters.tag,
    filters.tags,
    filters.location,
    filters.connection,
    filters.sort !== "confirmed",
    filters.lifecycle,
    filters.needs,
  ].filter(Boolean).length;
  return (
    <Page
      title={section ? kindLabels[section] : "Explore the directory"}
      description="Search by interest, place, or name. Open an entry for joining instructions and source links."
    >
      <Stack
        direction="row"
        useFlexGap
        sx={{ flexWrap: "wrap", gap: 1 }}
        aria-label="Directory shortcuts"
      >
        <Chip component={RouterLink} clickable to="/tags" label="Browse tags" />
      </Stack>
      {section && (
        <Alert severity="info">
          This shared link retains its legacy{" "}
          {kindLabels[section].toLowerCase()} selection.{" "}
          <Link component={RouterLink} to="/">
            Explore all entries by tag
          </Link>
          .
        </Alert>
      )}
      <Stack
        direction="row"
        useFlexGap
        sx={{ flexWrap: "wrap", gap: 1 }}
        aria-label="Selected filters"
      >
        {Object.entries({
          q: filters.q,
          tag: filters.tag,
          connection: filters.connection,
          location: filters.location,
          access: filters.access,
          lifecycle: filters.lifecycle,
          needs: filters.needs,
          ...(!section && filters.kind ? { kind: filters.kind } : {}),
        })
          .filter(([, v]) => v)
          .map(([key, value]) => (
            <Chip
              key={key}
              label={`${key === "q" ? "Search" : key}: ${value}`}
              onDelete={() => change({ [key]: undefined })}
            />
          ))}
        {(filters.tags?.split(",") ?? []).map((id) => (
          <Chip
            key={id}
            label={
              catalog.data?.items.find((t) => t.id === id)?.name ??
              "Selected tag"
            }
            onDelete={() =>
              change({
                tags: filters.tags
                  ?.split(",")
                  .filter((t) => t !== id)
                  .join(","),
              })
            }
          />
        ))}
      </Stack>
      <Box>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center" }}
          data-testid="directory-results-toolbar"
        >
          <Typography color="text.secondary" role="status">
            {!parsed.success
              ? "Check filters"
              : result.isPending
                ? "Searching…"
                : result.error
                  ? "Entries unavailable"
                  : `${result.data.total} entries found`}
          </Typography>
          <IconAction
            label="Filters"
            aria-expanded={filtersOpen}
            aria-controls={filterPanelId}
            aria-description={
              activeCount
                ? `${activeCount} active filters`
                : "Search and filter entries"
            }
            onClick={() => setFiltersOpen((open) => !open)}
            sx={{ bgcolor: filtersOpen ? "action.selected" : undefined }}
          >
            <Badge badgeContent={activeCount} color="primary">
              <FilterList />
            </Badge>
          </IconAction>
          <Stack
            direction="row"
            sx={{ ml: "auto !important" }}
            role="group"
            aria-label="Directory view"
          >
            <IconAction
              label="Card view"
              aria-pressed={filters.view === "cards"}
              onClick={() =>
                change({ view: undefined, page: String(filters.page) })
              }
              sx={{
                bgcolor:
                  filters.view === "cards" ? "action.selected" : undefined,
              }}
            >
              <ViewModuleOutlined />
            </IconAction>
            <IconAction
              label="Table view"
              aria-pressed={filters.view === "table"}
              onClick={() =>
                change({ view: "table", page: String(filters.page) })
              }
              sx={{
                bgcolor:
                  filters.view === "table" ? "action.selected" : undefined,
              }}
            >
              <TableRowsOutlined />
            </IconAction>
          </Stack>
        </Stack>
        <Collapse
          in={filtersOpen}
          timeout="auto"
          unmountOnExit
          id={filterPanelId}
        >
          <Box role="region" aria-label="Directory filters" sx={{ pt: 2 }}>
            <FilterComponent
              filters={filters}
              onChange={change}
              onReset={() =>
                setParams(filters.view === "table" ? { view: "table" } : {})
              }
            />
          </Box>
        </Collapse>
      </Box>
      {!parsed.success ? (
        <Alert severity="warning">
          This link contains invalid filters. Open Filters and clear filters to
          continue.
        </Alert>
      ) : result.isPending ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={() => void result.refetch()} />
      ) : (
        <>
          {!result.data.items.length && (
            <Empty message="No entries on this page. Open Filters to adjust your search, or choose page 1." />
          )}
          {filters.view === "table" ? (
            <ListingTable items={result.data.items} />
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "1fr 1fr",
                  xl: "repeat(3,1fr)",
                },
                gap: 2,
              }}
            >
              {result.data.items.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </Box>
          )}
          <Paging
            total={result.data.total}
            page={filters.page}
            pageSize={filters.pageSize}
          />
        </>
      )}
    </Page>
  );
}
