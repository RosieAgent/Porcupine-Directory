import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Typography } from "@mui/material";
import { Link } from "react-router";
import { z } from "zod";
import type { Submission } from "../../shared/contracts";
import { mutate } from "../lib/api";
import { Page } from "../components/Page";
import { ListingForm } from "../components/ListingForm";
import { useAuth } from "../state/AuthProvider";
export default function SubmitPage() {
  const { user, loading, error } = useAuth();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: Submission) =>
      mutate(
        "/listings",
        z.object({
          id: z.uuid(),
          status: z.enum(["published", "pending_review"]),
        }),
        { ...data, expectedAccountId: user?.id ?? null },
      ),
    onSuccess: () =>
      client.invalidateQueries({
        predicate: (query) =>
          ["listings", "facets", "sources"].includes(
            String(query.queryKey[0]),
          ) ||
          (query.queryKey[0] === "private" && query.queryKey[1] === "entries"),
      }),
  });
  return (
    <Page
      title="Add a directory entry"
      description="Suggest a group, channel, business, or resource. No account or personal contact information is required."
    >
      {user ? (
        <Typography>
          Your account privately owns this entry, so you can edit it later. Your
          username will not be published.
        </Typography>
      ) : (
        <Alert severity="info">
          Anonymous submissions cannot be edited by their submitter.{" "}
          <Link to="/login">Sign in</Link> first if you want to manage this
          entry later.
        </Alert>
      )}
      {mutation.data ? (
        <Alert severity="success">
          {mutation.data.status === "published"
            ? "Your entry is published and marked unconfirmed."
            : "Your entry is awaiting publication."}
          {mutation.data.status === "published" && (
            <Button component={Link} to={"/listings/" + mutation.data.id}>
              View entry
            </Button>
          )}
          {user && (
            <Button component={Link} to="/account/entries">
              My entries
            </Button>
          )}
        </Alert>
      ) : (
        <ListingForm
          onSave={(data) => mutation.mutate(data)}
          pending={mutation.isPending || loading || !!error}
          error={mutation.error || error}
        />
      )}
    </Page>
  );
}
