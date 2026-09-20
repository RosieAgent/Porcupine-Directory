import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Link,
  List,
  ListItem,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import {
  PORCUPINE_REPORT_ID,
  publicationsResponse,
  REPORT_PLAYLIST,
  REPORT_FEED,
} from "../../shared/publications";
import { request } from "../lib/api";
import { ErrorState, Loading } from "./Page";

export function RecentPublications({ listingId }: { listingId: string }) {
  const result = useQuery({
    queryKey: ["publications", listingId],
    queryFn: ({ signal }) =>
      request(`/publications/${listingId}`, publicationsResponse, { signal }),
    enabled: listingId === PORCUPINE_REPORT_ID,
    refetchInterval: 60_000,
    staleTime: 60_000,
  });
  if (listingId !== PORCUPINE_REPORT_ID) return null;
  const data = result.data;
  return (
    <Paper
      component="section"
      aria-label="Recent episodes"
      variant="outlined"
      sx={{ p: 3 }}
    >
      <Stack spacing={2}>
        <Typography variant="h2">Recent episodes</Typography>
        <Typography variant="body2">
          From the publisher’s podcast feed, including occasional special
          editions. Open an episode to listen, or visit the{" "}
          <Link href={REPORT_PLAYLIST} target="_blank" rel="noreferrer">
            YouTube video archive
          </Link>
          .
        </Typography>
        {result.isPending ? (
          <Loading />
        ) : result.error ? (
          <ErrorState
            error={result.error}
            retry={() => void result.refetch()}
          />
        ) : (
          data && (
            <>
              {(data.status === "error" || data.status === "disabled") && (
                <Alert severity="info">
                  {data.status === "disabled"
                    ? "Automatic checks are paused."
                    : "The latest check failed."}{" "}
                  {data.items.length
                    ? "Showing the last saved episodes; newer releases may be missing."
                    : "Visit the publisher for current episodes."}
                </Alert>
              )}
              {!data.items.length && data.status === "pending" && (
                <Typography>The first episode check is pending.</Typography>
              )}
              <List disablePadding>
                {data.items.map((item) => (
                  <ListItem
                    key={item.url}
                    disableGutters
                    sx={{ display: "block" }}
                  >
                    <Link
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      sx={{ overflowWrap: "anywhere" }}
                    >
                      {item.title}
                    </Link>
                    <Typography variant="body2" color="text.secondary">
                      Published{" "}
                      <time dateTime={item.publishedAt}>
                        {new Date(item.publishedAt).toLocaleDateString()}
                      </time>
                    </Typography>
                  </ListItem>
                ))}
              </List>
              <Typography variant="caption">
                {data.lastCheckedAt
                  ? `Last checked ${new Date(data.lastCheckedAt).toLocaleString()}. `
                  : "Not yet checked. "}
                {data.lastSuccessfulAt &&
                  `Last successful check ${new Date(data.lastSuccessfulAt).toLocaleString()}. `}
                {data.pollIntervalMinutes &&
                  `Checked every ${data.pollIntervalMinutes} minutes while the server runs.`}
              </Typography>
            </>
          )
        )}
        <Typography variant="body2" color="text.secondary">
          Publication activity is not confirmation and does not currently change
          listing order. No external players, images or audio load here.
          Following a link uses that service’s privacy practices.{" "}
          <Link href={REPORT_FEED} target="_blank" rel="noreferrer">
            Publisher RSS feed
          </Link>
        </Typography>
      </Stack>
    </Paper>
  );
}
