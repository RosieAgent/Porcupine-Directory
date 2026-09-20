import { Alert, Link, Paper, Stack, Typography } from "@mui/material";
import { IconLink } from "../components/IconAction";
import OpenInNew from "@mui/icons-material/OpenInNew";
import PlayCircleOutline from "@mui/icons-material/PlayCircleOutlined";
import { Page } from "../components/Page";
import { eventSources } from "../../shared/event-sources";
const fsp = eventSources.fsp_calendar;
export default function AddEventPage() {
  return (
    <Page
      title="Add your community event"
      parent={{ label: "Events", to: "/events" }}
      description="Publish with FSP; discover it here. No Porcupine Directory account is needed."
    >
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h2">
          How to add an event to the FSP calendar
        </Typography>
        <Stack component="ol" spacing={2} sx={{ pl: 3 }}>
          <Typography component="li">
            <Link href={fsp.accountUrl} target="_blank" rel="noreferrer">
              Sign in or create an FSP account
            </Link>
            . This account belongs to FSP, not Porcupine Directory.
          </Typography>
          <Typography component="li">
            <Link href={fsp.accessUrl} target="_blank" rel="noreferrer">
              Request event-submission access
            </Link>{" "}
            if you do not already have it. Wait for FSP to grant access.
          </Typography>
          <Typography component="li">
            Open the submission form and enter your event’s title, date, time,
            location and details. Follow FSP’s publishing requirements.
          </Typography>
          <Typography component="li">
            Use the{" "}
            <Link href={fsp.dashboardUrl} target="_blank" rel="noreferrer">
              FSP calendar dashboard
            </Link>{" "}
            for future edits or cancellations.
          </Typography>
        </Stack>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ flexWrap: "wrap", mt: 2 }}
        >
          <IconLink label="Open FSP event form" href={fsp.submitUrl}>
            <OpenInNew />
          </IconLink>
          <IconLink label="Watch FSP’s tutorial" href={fsp.guideUrl}>
            <PlayCircleOutline />
          </IconLink>
        </Stack>
      </Paper>
      <Alert severity="info">
        Once an event is public and included in FSP’s Community Calendar, it
        should appear here after the next successful hourly check, if it falls
        within our imported date window and its schedule can be read. FSP
        controls access and publishing; inclusion here is not immediate or
        guaranteed.
      </Alert>
      <Typography variant="body2" color="text.secondary">
        These links open external services with their own privacy policies. We
        do not receive your FSP login or form responses. Instructions verified
        against{" "}
        <Link href={fsp.submitUrl} target="_blank" rel="noreferrer">
          FSP’s submission page
        </Link>
        . Additional event sources may be supported later.
      </Typography>
    </Page>
  );
}
