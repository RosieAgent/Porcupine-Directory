import { useQuery } from "@tanstack/react-query";
import {
  Autocomplete,
  Box,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Link,
  Chip,
} from "@mui/material";
import Search from "@mui/icons-material/Search";
import { Link as RouterLink } from "react-router";
import FilterAltOff from "@mui/icons-material/FilterAltOff";
import type { z } from "zod";
import {
  accessLabels,
  listingQuerySchema,
  lifecycleLabels,
} from "../../shared/contracts";
import { queries } from "../lib/api";
import { IconAction } from "./IconAction";
import { ErrorState } from "./Page";
import { connectionLabels } from "../../shared/connections";
import { TagLabel } from "./TopicTags";
import { LocationSelector } from "./LocationSelector";

type FilterValues = z.infer<typeof listingQuerySchema>;
export function FilterComponent({
  filters,
  onChange,
  onReset,
}: {
  filters: FilterValues;
  onChange: (values: Record<string, string | undefined>) => void;
  onReset: () => void;
}) {
  const facets = useQuery(queries.facets);
  const catalog = useQuery(queries.tags);
  const selectedIds = filters.tags?.split(",") ?? [];
  const selectedTags = (catalog.data?.items ?? []).filter(
    (t) =>
      selectedIds.includes(t.id) ||
      (filters.tag &&
        [t.name, ...t.aliases].some(
          (n) => n.toLowerCase() === filters.tag?.toLowerCase(),
        )),
  );
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Box
          component="form"
          key={filters.q}
          onSubmit={(event) => {
            event.preventDefault();
            onChange({
              q: String(new FormData(event.currentTarget).get("q") ?? ""),
            });
          }}
          sx={{ display: "flex", gap: 1 }}
        >
          <TextField
            fullWidth
            label="Search entries"
            name="q"
            defaultValue={filters.q}
          />
          <IconAction label="Search" type="submit">
            <Search />
          </IconAction>
        </Box>
        {facets.error && (
          <ErrorState
            error={facets.error}
            retry={() => void facets.refetch()}
          />
        )}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2,1fr)",
              lg: "repeat(3,1fr)",
            },
            gap: 2,
          }}
        >
          <TextField
            select
            label="Access"
            value={filters.access ?? ""}
            onChange={(event) => onChange({ access: event.target.value })}
          >
            <MenuItem value="">Any access</MenuItem>
            {Object.entries(accessLabels).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <Autocomplete
            multiple
            options={(catalog.data?.items ?? []).filter(
              (t) => !t.retired && !t.mergedInto,
            )}
            renderOption={({ key, ...props }, tag) => (
              <li key={key} {...props}>
                <TagLabel name={tag.name} />
              </li>
            )}
            loading={catalog.isPending}
            value={selectedTags}
            getOptionLabel={(tag) => tag.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            filterOptions={(options, { inputValue }) =>
              options.filter((tag) =>
                [tag.name, ...tag.aliases].some((n) =>
                  n.toLowerCase().includes(inputValue.toLowerCase()),
                ),
              )
            }
            renderValue={(value, getItemProps) =>
              value.map((tag, index) => {
                const { key, ...props } = getItemProps({ index });
                return (
                  <Chip
                    key={key}
                    {...props}
                    label={<TagLabel name={tag.name} />}
                  />
                );
              })
            }
            onChange={(_, value) =>
              onChange({
                tags: value.map((t) => t.id).join(","),
                tag: undefined,
              })
            }
            renderInput={(props) => (
              <TextField
                {...props}
                label="Tags"
                helperText={
                  catalog.error
                    ? "Tag catalog unavailable; reload to retry."
                    : "Matches all selected tags. Use Connection for Signal and other platforms."
                }
              />
            )}
          />
          <TextField
            select
            label="Connection"
            value={filters.connection ?? ""}
            onChange={(event) => onChange({ connection: event.target.value })}
          >
            <MenuItem value="">All connections</MenuItem>
            {Object.entries(connectionLabels).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <LocationSelector
            label="Location"
            value={filters.location ?? ""}
            legacy={[
              ...(facets.data?.locations ?? []),
              ...(filters.location ? [filters.location] : []),
            ]}
            onChange={(location) => onChange({ location })}
            helperText="Matches the entry's selected area, not nearby towns. Statewide entries are listed as New Hampshire."
          />
          <TextField
            select
            label="Sort"
            helperText={
              <Link component={RouterLink} to="/about#listing-order">
                Missing joining details sort last
              </Link>
            }
            value={filters.sort}
            onChange={(event) => onChange({ sort: event.target.value })}
          >
            <MenuItem value="confirmed">Confirmation first</MenuItem>
            <MenuItem value="name">Name A–Z</MenuItem>
            <MenuItem value="recent">Recently updated</MenuItem>
          </TextField>
        </Box>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            fullWidth
            select
            label="Community stage"
            value={filters.lifecycle ?? ""}
            onChange={(event) => onChange({ lifecycle: event.target.value })}
          >
            <MenuItem value="">All stages</MenuItem>
            {Object.entries(lifecycleLabels).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            select
            label="Needs"
            value={filters.needs ?? ""}
            onChange={(event) => onChange({ needs: event.target.value })}
          >
            <MenuItem value="">Any</MenuItem>
            <MenuItem value="joining_details">Joining details missing</MenuItem>
            <MenuItem value="organizer">Seeking an organizer</MenuItem>
          </TextField>
        </Stack>
        <IconAction label="Clear filters" onClick={onReset}>
          <FilterAltOff />
        </IconAction>
      </Stack>
    </Paper>
  );
}
