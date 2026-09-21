import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Checkbox,
  FormControlLabel,
  Pagination,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import VerifiedUserOutlined from "@mui/icons-material/VerifiedUserOutlined";
import Check from "@mui/icons-material/Check";
import Close from "@mui/icons-material/Close";
import { Link } from "react-router";
import { ownershipInboxSchema } from "../../shared/ownership";
import { okSchema } from "../../shared/auth";
import { request, mutate } from "../lib/api";
import { useAuth } from "../state/AuthProvider";
import { Page, Loading, ErrorState } from "../components/Page";
import { IconAction } from "../components/IconAction";

export default function OwnershipPage() {
  const { user, loading, refresh, staffAuthMode } = useAuth();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState<string[]>([]);
  const inbox = useQuery({
    queryKey: ["private", "ownership-inbox", user?.id, page],
    queryFn: ({ signal }) =>
      request(`/ownership/inbox?page=${page}`, ownershipInboxSchema, {
        signal,
      }),
    enabled: !!user,
    refetchInterval: 60000,
  });
  const verify = useMutation({
    mutationFn: async () => {
      try {
        await mutate("/auth/reauthenticate", okSchema, { password });
        await refresh();
      } finally {
        setPassword("");
      }
    },
  });
  const respond = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "accept" | "decline";
    }) => mutate(`/ownership/${id}/${action}`, okSchema),
    onSuccess: () => setConsent([]),
    // Refresh terminal failures (expiry/revocation) as well as successful transfers.
    onSettled: () => client.invalidateQueries(),
  });
  if (loading) return <Loading />;
  if (!user)
    return (
      <Page title="Ownership assignments" shareable={false}>
        <Link to="/login">Sign in to see your assignments</Link>
      </Page>
    );
  const busy = respond.isPending || verify.isPending;
  return (
    <Page title="Ownership assignments" account shareable={false}>
      <Typography>
        These are private invitations to maintain directory entries. Accepting
        grants editing access to that entry and replaces its previous owner. It
        grants no staff role and makes no public claim about who leads the
        community. Invitations expire after seven days.
      </Typography>
      {staffAuthMode !== "session" && (
        <Stack
          component="form"
          spacing={2}
          onSubmit={(event) => {
            event.preventDefault();
            verify.mutate();
          }}
        >
          <Typography>
            Acceptance requires password verification within the last 15
            minutes. Verification alone does not accept an assignment.
          </Typography>
          <TextField
            label="Current password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 128 } }}
          />
          <IconAction
            label="Verify password"
            type="submit"
            disabled={busy || !password}
          >
            <VerifiedUserOutlined />
          </IconAction>
        </Stack>
      )}
      {verify.error && <Alert severity="error">{verify.error.message}</Alert>}
      {verify.isSuccess && (
        <Alert severity="success">
          Password verified. Choose an assignment below to accept.
        </Alert>
      )}
      {respond.error && <Alert severity="error">{respond.error.message}</Alert>}
      {respond.isSuccess && (
        <Alert severity="success">
          {respond.variables.action === "accept" ? (
            <>
              Ownership accepted. <Link to="/account/entries">My entries</Link>
            </>
          ) : (
            "Assignment declined. Ownership has not changed."
          )}
        </Alert>
      )}
      {inbox.isPending ? (
        <Loading />
      ) : inbox.error ? (
        <ErrorState error={inbox.error} retry={() => void inbox.refetch()} />
      ) : (
        <Stack spacing={2}>
          {!inbox.data.items.length && (
            <Typography>No ownership assignments.</Typography>
          )}
          {inbox.data.items.map((offer) => (
            <Paper key={offer.id} variant="outlined" sx={{ p: 3 }}>
              <Stack spacing={1}>
                <Typography variant="h2">{offer.listingName}</Typography>
                <Typography>
                  Revision {offer.listingVersion} ·{" "}
                  {offer.listingStatus.replaceAll("_", " ")} · {offer.state}
                </Typography>
                {offer.listingStatus === "published" && (
                  <Link to={`/listings/${offer.listingId}`}>
                    View public entry
                  </Link>
                )}
                <Typography>
                  Expires {new Date(offer.expiresAt).toLocaleString()}
                </Typography>
                {offer.state === "pending" && (
                  <>
                    <FormControlLabel
                      label={`I agree to maintain ${offer.listingName}`}
                      control={
                        <Checkbox
                          checked={consent.includes(offer.id)}
                          disabled={busy}
                          onChange={(_, checked) =>
                            setConsent((previous) =>
                              checked
                                ? [...previous, offer.id]
                                : previous.filter((id) => id !== offer.id),
                            )
                          }
                        />
                      }
                    />
                    <Stack direction="row" spacing={2}>
                      <IconAction
                        label="Accept ownership"
                        disabled={busy || !consent.includes(offer.id)}
                        onClick={() =>
                          respond.mutate({ id: offer.id, action: "accept" })
                        }
                      >
                        <Check />
                      </IconAction>
                      <IconAction
                        label="Decline assignment"
                        disabled={busy}
                        onClick={() =>
                          respond.mutate({ id: offer.id, action: "decline" })
                        }
                      >
                        <Close />
                      </IconAction>
                    </Stack>
                  </>
                )}
              </Stack>
            </Paper>
          ))}
          <Pagination
            page={page}
            count={Math.max(
              1,
              Math.ceil(inbox.data.total / inbox.data.pageSize),
            )}
            onChange={(_, value) => {
              setPage(value);
              setConsent([]);
            }}
          />
        </Stack>
      )}
    </Page>
  );
}
