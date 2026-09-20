import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import luxonPlugin from "@fullcalendar/luxon3";
import { useQuery } from "@tanstack/react-query";
import { Alert, Box, Paper, Stack, TextField, Typography } from "@mui/material";
import { useSearchParams } from "react-router";
import { calendarQuerySchema } from "../../shared/contracts";
import {
  currentMonth,
  monthDate,
  toCalendarEvent,
} from "../../shared/calendar";
import { EVENT_TIMEZONE } from "../../shared/event-sources";
import { queries } from "../lib/api";
import { updatedSearch } from "../lib/urls";
import { Empty, ErrorState, Loading, Page } from "../components/Page";
import { EventNavigation } from "../components/EventNavigation";
import { EventSourceStatus } from "../components/EventSourceStatus";
import { IconAction, IconLink } from "../components/IconAction";
import Search from "@mui/icons-material/Search";
import FilterAltOff from "@mui/icons-material/FilterAltOff";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import Today from "@mui/icons-material/Today";

export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const parsed = calendarQuerySchema.safeParse({
    month: currentMonth(),
    ...Object.fromEntries(params),
  });
  const { month, q } = parsed.success
    ? parsed.data
    : { month: currentMonth(), q: "" };
  const result = useQuery({
    ...queries.calendar(new URLSearchParams({ month, q }).toString()),
    enabled: parsed.success,
  });
  const date = monthDate(month);
  const monthUrl = (value: string) =>
    "/events/calendar?" + updatedSearch(params, { month: value });
  return (
    <Page
      title="Community calendar"
      description="Explore the month at a glance. Times are shown in New Hampshire time."
      parent={{ label: "Events", to: "/events" }}
    >
      <EventNavigation view="calendar" month={month} q={q} />
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
              month: String(data.get("month")),
            }),
          );
        }}
      >
        <Stack
          direction={{ xs: "column", lg: "row" }}
          spacing={2}
          sx={{
            alignItems: { lg: "center" },
          }}
        >
          <TextField
            name="q"
            label="Search events or venues"
            defaultValue={q}
            fullWidth
            sx={{ flex: 1, minWidth: 0 }}
          />
          <TextField
            name="month"
            type="month"
            label="Month"
            defaultValue={month}
            sx={{ minWidth: { lg: 200 }, flexShrink: 0 }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Stack direction="row" spacing={1}>
            <IconAction label="Find events" type="submit">
              <Search />
            </IconAction>
            <IconAction
              label="Clear filters"
              onClick={() => setParams({ month: currentMonth() })}
            >
              <FilterAltOff />
            </IconAction>
          </Stack>
        </Stack>
      </Paper>
      <Stack
        direction="row"
        useFlexGap
        spacing={1}
        sx={{ flexWrap: "wrap", alignItems: "center" }}
      >
        <IconLink
          to={monthUrl(date.minus({ months: 1 }).toFormat("yyyy-MM"))}
          label="Previous month"
        >
          <ChevronLeft />
        </IconLink>
        <Typography variant="h2" sx={{ flex: 1, textAlign: "center" }}>
          {date.toFormat("LLLL yyyy")}
        </Typography>
        <IconLink
          to={monthUrl(date.plus({ months: 1 }).toFormat("yyyy-MM"))}
          label="Next month"
        >
          <ChevronRight />
        </IconLink>
        <IconLink label="This month" to={monthUrl(currentMonth())}>
          <Today />
        </IconLink>
      </Stack>
      {!parsed.success ? (
        <Alert severity="warning">
          Invalid month or search in this link. Clear filters to continue.
        </Alert>
      ) : result.isPending ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={() => void result.refetch()} />
      ) : (
        <>
          {!result.data.items.length && (
            <Empty message="No imported events match this month and search. Check the imported date window above or try the FSP calendar." />
          )}
          <Typography variant="body2" color="text.secondary">
            Select an event for details. On a small screen, scroll the calendar
            horizontally or use the upcoming list.
          </Typography>
          <Box
            role="region"
            aria-label="Monthly events calendar"
            tabIndex={0}
            sx={{
              overflowX: "auto",
              p: 1,
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              bgcolor: "background.paper",
              "& .fc-daygrid-dot-event": {
                color: "primary.dark",
                textDecoration: "none",
              },
              "& .fc-daygrid-dot-event:hover": { textDecoration: "underline" },
              "& .fc": {
                "--fc-event-bg-color": "#235e46",
                "--fc-event-border-color": "#235e46",
                "--fc-today-bg-color": "#f4edd8",
                fontSize: "0.875rem",
              },
              "& .fc-event": { cursor: "pointer" },
            }}
          >
            <Box sx={{ minWidth: 680 }}>
              <FullCalendar
                key={month}
                plugins={[dayGridPlugin, luxonPlugin]}
                initialView="dayGridMonth"
                initialDate={month + "-01"}
                timeZone={EVENT_TIMEZONE}
                headerToolbar={false}
                firstDay={0}
                fixedWeekCount
                height="auto"
                dayMaxEvents={3}
                events={result.data.items.map(toCalendarEvent)}
                eventTimeFormat={{
                  hour: "numeric",
                  minute: "2-digit",
                  meridiem: "short",
                }}
              />
            </Box>
          </Box>
        </>
      )}
    </Page>
  );
}
