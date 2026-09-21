import { useDeferredValue, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Pagination,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PersonAddOutlined from "@mui/icons-material/PersonAddOutlined";
import CancelOutlined from "@mui/icons-material/CancelOutlined";
import Close from "@mui/icons-material/Close";
import {
  nominationSchema,
  externalOwnerSchema,
  ownershipAssignmentSchema,
  ownershipCandidatesSchema,
  ownershipCreatedSchema,
} from "../../shared/ownership";
import { okSchema } from "../../shared/auth";
import { mutate, request } from "../lib/api";
import { useAuth } from "../state/AuthProvider";
import { ErrorState, Loading } from "./Page";
import { StaffVerification } from "./StaffVerification";
import { IconAction } from "./IconAction";

type Candidate = { id: string; username: string; alias: string };

export function OwnershipAssignment({
  listingId,
  version,
  button = false,
}: {
  listingId: string;
  version: number;
  button?: boolean;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("account");
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [label, setLabel] = useState("");
  const [reason, setReason] = useState("");
  const staff = !!user && user.role !== "user" && !user.privilegesSuspended;
  const authorized = staff && user.recoverySaved && user.staffVerified;
  const assignment = useQuery({
    queryKey: ["private", "ownership-assignment", listingId, version, user?.id],
    queryFn: ({ signal }) =>
      request(`/ownership/listings/${listingId}`, ownershipAssignmentSchema, {
        signal,
      }),
    enabled: open && authorized,
  });
  const candidates = useQuery({
    queryKey: ["private", "ownership-candidates", user?.id, query, page],
    queryFn: ({ signal }) =>
      request(
        `/ownership/candidates?q=${encodeURIComponent(query)}&page=${page}`,
        ownershipCandidatesSchema,
        { signal },
      ),
    enabled: open && authorized && mode === "account",
  });
  const propose = useMutation({
    mutationFn: async () => {
      if (mode === "account")
        await mutate(
          `/ownership/listings/${listingId}`,
          ownershipCreatedSchema,
          nominationSchema.parse({
            username: selected?.username,
            version,
            reason,
          }),
        );
      else
        await mutate(
          `/ownership/listings/${listingId}/no-account`,
          okSchema,
          externalOwnerSchema.parse({ label, version, reason }),
        );
    },
    onSuccess: async () => {
      setSelected(null);
      setReason("");
      await client.invalidateQueries();
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => mutate(`/ownership/${id}/cancel`, okSchema),
    onSettled: () => client.invalidateQueries({ queryKey: ["private"] }),
  });
  if (!staff) return null;
  const pending = assignment.data?.pending;
  const busy = propose.isPending || cancel.isPending;
  const valid =
    mode === "account"
      ? nominationSchema.safeParse({
          username: selected?.username,
          version,
          reason,
        }).success
      : externalOwnerSchema.safeParse({ label, version, reason }).success;
  const openAssignment = () => {
    setOpen(true);
    setSelected(null);
    setSearch("");
    setPage(1);
    setReason("");
    setLabel("");
    setMode("account");
    propose.reset();
    cancel.reset();
  };
  return (
    <>
      {button ? (
        <Button startIcon={<PersonAddOutlined />} onClick={openAssignment}>
          Assign owner
        </Button>
      ) : (
        <IconAction label="Assign owner" onClick={openAssignment}>
          <PersonAddOutlined />
        </IconAction>
      )}
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="ownership-title"
      >
        <DialogTitle>
          <Stack
            direction="row"
            sx={{ alignItems: "center", justifyContent: "space-between" }}
          >
            <span id="ownership-title">Assign owner</span>
            <IconAction
              label="Close owner assignment"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              <Close />
            </IconAction>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2">
              Private entry maintenance, not a public claim of community
              leadership. Account recipients must accept within seven days; the
              current owner retains access until acceptance. Save content edits
              first; ownership changes create a new revision.
            </Typography>
            <StaffVerification />
            {authorized &&
              (assignment.isPending ? (
                <Loading />
              ) : assignment.error ? (
                <ErrorState
                  error={assignment.error}
                  retry={() => void assignment.refetch()}
                />
              ) : (
                <>
                  <Typography>
                    Current private owner:{" "}
                    {assignment.data.ownerUsername ??
                      (assignment.data.externalOwnerLabel
                        ? `No account — ${assignment.data.externalOwnerLabel}`
                        : "No account / unassigned")}
                  </Typography>
                  {pending ? (
                    <Stack spacing={1}>
                      <Typography>
                        Awaiting {pending.recipientUsername} · expires{" "}
                        {new Date(pending.expiresAt).toLocaleString()}. The
                        recipient can respond in Account → Ownership
                        assignments.
                      </Typography>
                      <IconAction
                        label="Cancel assignment"
                        disabled={busy}
                        onClick={() => cancel.mutate(pending.id)}
                      >
                        <CancelOutlined />
                      </IconAction>
                    </Stack>
                  ) : (
                    <Stack
                      component="form"
                      spacing={2}
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (
                          !valid ||
                          busy ||
                          assignment.data.version !== version
                        )
                          return;
                        if (
                          mode === "no-account" &&
                          assignment.data.ownerUsername &&
                          !window.confirm(
                            "Remove the current account owner's editing access? Only editors and administrators will be able to maintain this entry.",
                          )
                        )
                          return;
                        propose.mutate();
                      }}
                    >
                      <RadioGroup
                        row
                        aria-label="Owner account type"
                        value={mode}
                        onChange={(_, value) => {
                          setMode(value);
                          propose.reset();
                        }}
                      >
                        <FormControlLabel
                          value="account"
                          control={<Radio disabled={busy} />}
                          label="Porcupine account"
                        />
                        <FormControlLabel
                          value="no-account"
                          control={<Radio disabled={busy} />}
                          label="No account"
                        />
                      </RadioGroup>
                      {mode === "account" ? (
                        <>
                          <Autocomplete<Candidate>
                            options={candidates.data?.items ?? []}
                            value={selected}
                            loading={candidates.isPending}
                            disabled={busy}
                            openOnFocus
                            filterOptions={(options) => options}
                            isOptionEqualToValue={(a, b) => a.id === b.id}
                            getOptionLabel={(option) =>
                              option.alias && option.alias !== "Anonymous"
                                ? `${option.username} · ${option.alias}`
                                : option.username
                            }
                            getOptionDisabled={(option) =>
                              option.username === assignment.data.ownerUsername
                            }
                            onChange={(_, value) => setSelected(value)}
                            onInputChange={(_, value, cause) => {
                              if (cause === "input" || cause === "clear") {
                                setSearch(value.slice(0, 80));
                                setPage(1);
                                setSelected(null);
                              }
                            }}
                            noOptionsText={
                              candidates.error
                                ? "Accounts unavailable"
                                : "No matching accounts"
                            }
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label="Select account"
                                required
                                helperText="Search private username or display alias. Select an existing account; typing alone does not assign ownership."
                              />
                            )}
                          />
                          {candidates.error && (
                            <ErrorState
                              error={candidates.error}
                              retry={() => void candidates.refetch()}
                            />
                          )}
                          {!!candidates.data &&
                            candidates.data.total >
                              candidates.data.pageSize && (
                              <Pagination
                                size="small"
                                count={Math.ceil(
                                  candidates.data.total /
                                    candidates.data.pageSize,
                                )}
                                page={page}
                                onChange={(_, value) => setPage(value)}
                                aria-label="Account choices pages"
                              />
                            )}
                        </>
                      ) : (
                        <>
                          <Alert severity="info">
                            No account receives editing rights. Only
                            editors/admins maintain the entry. Use an optional
                            alias with permission; do not enter private contact
                            details. The label stays in staff-only ownership
                            records and audit history.
                          </Alert>
                          <TextField
                            label="Manager alias (optional, private)"
                            value={label}
                            disabled={busy}
                            onChange={(event) => setLabel(event.target.value)}
                            slotProps={{ htmlInput: { maxLength: 80 } }}
                          />
                        </>
                      )}
                      <TextField
                        label="Reason for ownership assignment"
                        required
                        value={reason}
                        disabled={busy}
                        onChange={(event) => setReason(event.target.value)}
                        helperText="Private audit record. Do not include passwords or personal information."
                        slotProps={{ htmlInput: { maxLength: 500 } }}
                      />
                      {assignment.data.version !== version && (
                        <Alert severity="warning">
                          The entry changed. Reload before assigning ownership.
                        </Alert>
                      )}
                      <IconAction
                        label={
                          mode === "account"
                            ? "Propose ownership"
                            : "Save no-account owner"
                        }
                        type="submit"
                        disabled={
                          busy || !valid || assignment.data.version !== version
                        }
                      >
                        <PersonAddOutlined />
                      </IconAction>
                    </Stack>
                  )}
                </>
              ))}
            {propose.error && (
              <Alert severity="error">{propose.error.message}</Alert>
            )}
            {cancel.error && (
              <Alert severity="error">{cancel.error.message}</Alert>
            )}
            {propose.isSuccess && (
              <Alert severity="success">
                {mode === "account"
                  ? "Assignment proposed. Ownership changes only after acceptance."
                  : "No-account ownership saved. Only editors/admins can maintain this entry."}
              </Alert>
            )}
            {cancel.isSuccess && !pending && (
              <Alert severity="success">
                Assignment cancelled. Ownership has not changed.
              </Alert>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}
