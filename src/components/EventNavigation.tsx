import { Stack } from "@mui/material";
import { IconLink } from "./IconAction";
import ViewListOutlined from "@mui/icons-material/ViewListOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import AddCircleOutline from "@mui/icons-material/AddCircleOutlined";
import { currentMonth } from "../../shared/calendar";

export function EventNavigation({
  view,
  q = "",
  month = currentMonth(),
}: {
  view: "list" | "calendar";
  q?: string;
  month?: string;
}) {
  const calendarParams = new URLSearchParams({ month, ...(q ? { q } : {}) });
  const listParams = new URLSearchParams(q ? { q } : {});
  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      sx={{ flexWrap: "wrap" }}
      component="nav"
      aria-label="Event views"
    >
      <IconLink
        label="Upcoming list"
        to={"/events?" + listParams}
        current={view === "list"}
      >
        <ViewListOutlined />
      </IconLink>
      <IconLink
        label="Month calendar"
        to={"/events/calendar?" + calendarParams}
        current={view === "calendar"}
      >
        <CalendarMonthOutlined />
      </IconLink>
      <IconLink label="Add an event on FSP" to="/events/add">
        <AddCircleOutline />
      </IconLink>
    </Stack>
  );
}
