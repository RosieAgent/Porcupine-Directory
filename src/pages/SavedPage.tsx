import { useQueries } from "@tanstack/react-query";
import { Alert, Box, Stack } from "@mui/material";
import { IconAction } from "../components/IconAction";
import BookmarkRemoveOutlined from "@mui/icons-material/BookmarkRemoveOutlined";
import { useSearchParams } from "react-router";
import { listingQuerySchema } from "../../shared/contracts";
import { queries } from "../lib/api";
import { useSaved } from "../state/SavedProvider";
import { useAuth } from "../state/AuthProvider";
import { Empty, ErrorState, Loading, Page } from "../components/Page";
import { ListingCard } from "../components/ListingCard";
import { Paging } from "../components/Paging";
export default function SavedPage() {
  const { ids, toggle, storageError } = useSaved();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const parsed = listingQuerySchema.safeParse(Object.fromEntries(params));
  const { page, pageSize } = parsed.success
    ? parsed.data
    : listingQuerySchema.parse({});
  const visible = ids.slice((page - 1) * pageSize, page * pageSize);
  const results = useQueries({
    queries: visible.map((id) => queries.listing(id)),
  });
  return (
    <Page
      title="Saved entries"
      description={
        (user
          ? "Your saved entries sync privately across devices. They are not end-to-end encrypted."
          : "Your favorites are stored on this browser.") +
        " This page’s URL does not share your favorites; open an entry to share its individual link."
      }
    >
      {storageError && (
        <Alert severity="warning">
          {user
            ? "Saved entries could not be synchronized. Please try again."
            : "Browser storage is unavailable. Changes are saved for this visit only."}
        </Alert>
      )}
      {!visible.length && (
        <Empty
          message={
            ids.length
              ? "No saved entries on this page. Choose page 1."
              : "Use the bookmark icon on any directory entry to save it here."
          }
        />
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 2,
        }}
      >
        {results.map((result, i) => (
          <Box key={visible[i]}>
            {result.isPending ? (
              <Loading />
            ) : result.error ? (
              <Stack spacing={1}>
                <ErrorState
                  error={result.error}
                  retry={() => void result.refetch()}
                />
                <IconAction
                  label="Remove unavailable bookmark"
                  onClick={() => toggle(visible[i])}
                >
                  <BookmarkRemoveOutlined />
                </IconAction>
              </Stack>
            ) : (
              result.data && <ListingCard listing={result.data} />
            )}
          </Box>
        ))}
      </Box>
      {ids.length > 0 && (
        <Paging total={ids.length} page={page} pageSize={pageSize} />
      )}
    </Page>
  );
}
