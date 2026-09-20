import { useQuery } from "@tanstack/react-query";
import { EventLocation } from "../components/EventLocation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Link as RouterLink, useSearchParams } from "react-router";
import { eventQuerySchema } from "../../shared/contracts";
import { queries } from "../lib/api";
import { dateLabel, updatedSearch } from "../lib/urls";
import { Empty, ErrorState, Loading, Page } from "../components/Page";
import { Paging } from "../components/Paging";
import { IconAction } from "../components/IconAction";
import Search from "@mui/icons-material/Search";
import FilterAltOff from "@mui/icons-material/FilterAltOff";
import { EventNavigation } from "../components/EventNavigation";
import { EventSourceStatus } from "../components/EventSourceStatus";
import { DateTime } from "luxon";
import { EVENT_TIMEZONE, eventSourceName } from "../../shared/event-sources";
export default function EventsPage() {
  const [params, setParams] = useSearchParams();
  const parsed = eventQuerySchema.safeParse(Object.fromEntries(params));
  const filters = parsed.success ? parsed.data : eventQuerySchema.parse({});
  const result = useQuery({
    ...queries.events(params.toString()),
    enabled: parsed.success,
  });
  const today = DateTime.now().setZone(EVENT_TIMEZONE);
  return (
    <Page
      title="Community events"
      description="Upcoming events from the FSP Community Calendar. All times are shown in New Hampshire time."
    >
      <EventNavigation view="list" q={filters.q} />
      <EventSourceStatus />
      <Paper
        component="form"
        key={params.toString()}
        variant="outlined"
        sx={{ p: 2 }}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setParams(
            updatedSearch(params, {
              q: String(data.get("q")),
              from: String(data.get("from")),
              to: String(data.get("to")),
            }),
          );
        }}
      >
        <Stack spacing={2}>
          <TextField
            name="q"
            label="Search events or venues"
            defaultValue={filters.q}
            fullWidth
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              name="from"
              label="From date"
              type="date"
              defaultValue={filters.from ?? ""}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              name="to"
              label="Through date"
              type="date"
              defaultValue={filters.to ?? ""}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: "wrap" }}
          >
            <IconAction label="Find events" type="submit">
              <Search />
            </IconAction>
            <IconAction label="Clear filters" onClick={() => setParams({})}>
              <FilterAltOff />
            </IconAction>
          </Stack>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: "wrap" }}
          >
            <Button
              onClick={() =>
                setParams(
                  updatedSearch(params, {
                    from: today.toISODate()!,
                    to: today.toISODate()!,
                  }),
                )
              }
            >
              Today
            </Button>
            <Button
              onClick={() => {
                const saturday = today.plus({
                  days: today.weekday === 7 ? -1 : 6 - today.weekday,
                });
                setParams(
                  updatedSearch(params, {
                    from: saturday.toISODate()!,
                    to: saturday.plus({ days: 1 }).toISODate()!,
                  }),
                );
              }}
            >
              This weekend
            </Button>
            <Button
              onClick={() =>
                setParams(
                  updatedSearch(params, {
                    from: today.toISODate()!,
                    to: today.plus({ days: 6 }).toISODate()!,
                  }),
                )
              }
            >
              Next 7 days
            </Button>
          </Stack>
        </Stack>
      </Paper>
      {!parsed.success ? (
        <Alert severity="warning">
          Check the dates and page in this link, or clear filters to continue.
        </Alert>
      ) : result.isPending ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={() => void result.refetch()} />
      ) : (
        result.data && (
          <>
            {!result.data.items.length && (
              <Empty message="No events on this page. Try a different date or search, or return to page 1." />
            )}
            <Box sx={{ display: "grid", gap: 2 }}>
              {result.data.items.map((event) => (
                <Card component="article" key={event.id}>
                  <CardContent>
                    <Typography variant="overline" color="primary">
                      {dateLabel(event.startsAt, event.allDay)}
                    </Typography>
                    <Typography variant="h2" sx={{ mb: 1 }}>
                      <Link component={RouterLink} to={"/events/" + event.id}>
                        {event.title}
                      </Link>
                    </Typography>
                    <Typography color="text.secondary">
                      <EventLocation event={event} />
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 1 }}
                    >
                      {eventSourceName(event.sourceKey)}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
            <Paging
              total={result.data.total}
              page={filters.page}
              pageSize={filters.pageSize}
            />
          </>
        )
      )}
    </Page>
  );
}
