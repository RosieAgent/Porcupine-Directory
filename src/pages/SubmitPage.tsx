import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Alert, Button, Typography } from "@mui/material";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import type { Submission } from "../../shared/contracts";
import { entryImageSchema } from "../../shared/contracts";
import { mutate, uploadImage } from "../lib/api";
import { Page } from "../components/Page";
import { ListingForm } from "../components/ListingForm";
import { useAuth } from "../state/AuthProvider";
import type { PendingImage } from "../components/EntryImages";
import { prepareImage } from "../lib/images";
export default function SubmitPage() {
  const { user, loading, error } = useAuth();
  const client = useQueryClient();
  const navigate = useNavigate();
  const submissionKey = useRef(crypto.randomUUID());
  const submissionFingerprint = useRef("");
  const mutation = useMutation({
    mutationFn: async ({
      data,
      images,
    }: {
      data: Submission;
      images: PendingImage[];
    }) => {
      const body = { ...data, expectedAccountId: user?.id ?? null };
      const fingerprint = JSON.stringify(body);
      if (submissionFingerprint.current !== fingerprint) {
        submissionKey.current = crypto.randomUUID();
        submissionFingerprint.current = fingerprint;
      }
      const created = await mutate(
        "/listings",
        z.object({
          id: z.uuid(),
          status: z.enum(["published", "pending_review"]),
        }),
        body,
        "POST",
        { headers: { "Idempotency-Key": submissionKey.current } },
      );
      if (user && images.length) {
        for (const image of images) {
          await uploadImage(
            `/listings/${created.id}/images`,
            await prepareImage(image.file),
            {
              altText: image.altText,
              caption: image.caption,
              shareable: image.shareable,
              reason: "Initial entry images added with the entry.",
            },
            entryImageSchema,
          );
        }
      }
      return created;
    },
    onSuccess: async (data) => {
      await client.invalidateQueries({
        predicate: (query) =>
          ["listings", "facets", "sources"].includes(
            String(query.queryKey[0]),
          ) ||
          (query.queryKey[0] === "private" && query.queryKey[1] === "entries"),
      });
      if (data.status === "published") navigate("/listings/" + data.id);
    },
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
          <strong>Submitting without an account?</strong> This entry will be
          public, but anonymous submissions cannot be edited by their submitter
          later. <Link to="/login">Sign in or create an account</Link> first if
          you want to manage this entry later.
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
          onSave={(data, images) =>
            mutation.mutate({ data, images: images ?? [] })
          }
          pending={mutation.isPending || loading || !!error}
          error={mutation.error || error}
          canUploadImages={!!user}
        />
      )}
    </Page>
  );
}
