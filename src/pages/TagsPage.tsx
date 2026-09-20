import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  FormControlLabel,
  Checkbox,
  Link,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Link as RouterLink, useLocation } from "react-router";
import Add from "@mui/icons-material/Add";
import EditOutlined from "@mui/icons-material/EditOutlined";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import Merge from "@mui/icons-material/Merge";
import { z } from "zod";
import { tagIconKeys } from "../../shared/tags";
import type { TagDefinition } from "../../shared/tags";
import { queries, mutate } from "../lib/api";
import { useAuth } from "../state/AuthProvider";
import { Page, ErrorState, Loading } from "../components/Page";
import { StaffVerification } from "../components/StaffVerification";
import { IconAction } from "../components/IconAction";
import { TagLabel } from "../components/TopicTags";

export default function TagsPage() {
  const staffPage = useLocation().pathname === "/editor/tags";
  const { user } = useAuth();
  const staff = !!user && user.role !== "user" && !user.privilegesSuspended;
  const result = useQuery(queries.tags);
  const client = useQueryClient();
  const [q, setQ] = useState("");
  const [showRetired, setShowRetired] = useState(false);
  const [selected, setSelected] = useState<TagDefinition | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<(typeof tagIconKeys)[number]>("tag");
  const [aliases, setAliases] = useState("");
  const [retired, setRetired] = useState(false);
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState<TagDefinition | null>(null);
  const [notice, setNotice] = useState("");
  function edit(tag: TagDefinition | null) {
    setSelected(tag);
    setName(tag?.name ?? "");
    setIcon(tag?.icon ?? "tag");
    setAliases((tag?.aliases ?? []).join("\n"));
    setRetired(tag?.retired ?? false);
    setReason("");
    setTarget(null);
    setEditing(true);
    setNotice("");
    mutation.reset();
  }
  const mutation = useMutation({
    mutationFn: async (merge: boolean) => {
      if (merge && selected && target) {
        if (
          !window.confirm(
            `Merge ${selected.name} into ${target.name}? Existing entry tags will change and old links will redirect to the target tag. This is audited.`,
          )
        )
          return false;
        await mutate(
          `/tags/${selected.id}/merge`,
          z.object({ ok: z.boolean() }),
          {
            targetId: target.id,
            version: selected.version,
            targetVersion: target.version,
            reason,
          },
        );
      } else {
        await mutate(
          selected ? `/tags/${selected.id}` : "/tags",
          z.unknown(),
          {
            name,
            icon,
            aliases: aliases
              .split("\n")
              .map((a) => a.trim())
              .filter(Boolean),
            retired,
            reason,
            ...(selected ? { version: selected.version } : {}),
          },
          selected ? "PUT" : "POST",
        );
      }
      return true;
    },
    onSuccess: async (done) => {
      if (!done) return;
      await client.invalidateQueries();
      setEditing(false);
      setNotice("Catalog updated. Existing shared tag links remain usable.");
    },
  });
  return (
    <Page
      title={staffPage ? "Manage tags" : "Browse tags"}
      parent={
        staffPage ? { label: "Editor workspace", to: "/editor" } : undefined
      }
      description="Find entries by topic or descriptor. Signal and other connection filters come from the entry’s actual links, not its topic tags."
    >
      {staffPage && !staff ? (
        <Alert severity="info">
          Sign in with an editor or administrator account to manage tags.
        </Alert>
      ) : (
        <>
          {staffPage && <StaffVerification />}
          {notice && <Alert severity="success">{notice}</Alert>}
          <Stack direction="row" spacing={1}>
            <TextField
              fullWidth
              label="Search tags"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {staffPage && (
              <IconAction label="Create tag" onClick={() => edit(null)}>
                <Add />
              </IconAction>
            )}
          </Stack>
          {staffPage && (
            <FormControlLabel
              label="Show retired tags"
              control={
                <Checkbox
                  checked={showRetired}
                  onChange={(_, value) => setShowRetired(value)}
                />
              }
            />
          )}
          {staffPage && editing && (
            <Paper
              component="form"
              variant="outlined"
              sx={{ p: 2 }}
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate(false);
              }}
            >
              <Stack spacing={2}>
                <Typography variant="h2">
                  {selected ? "Edit tag" : "Create tag"}
                </Typography>
                <TextField
                  label="Tag name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  slotProps={{ htmlInput: { maxLength: 80 } }}
                />
                <TextField
                  select
                  label="Tag icon"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value as typeof icon)}
                >
                  {tagIconKeys.map((key) => (
                    <MenuItem key={key} value={key}>
                      {key}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Aliases (one per line)"
                  multiline
                  minRows={2}
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                  helperText="Previous names and aliases are retained so shared links keep working. Merge tags to resolve duplicate names."
                />
                <FormControlLabel
                  label="Retired (keep existing uses; prevent new selections)"
                  control={
                    <Checkbox
                      checked={retired}
                      onChange={(_, v) => setRetired(v)}
                    />
                  }
                />
                <TextField
                  label="Reason for catalog change"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  slotProps={{ htmlInput: { maxLength: 300 } }}
                />
                {mutation.error && <ErrorState error={mutation.error} />}
                <IconAction
                  label="Save tag"
                  type="submit"
                  disabled={
                    mutation.isPending ||
                    reason.trim().length < 3 ||
                    !name.trim()
                  }
                >
                  <SaveOutlined />
                </IconAction>
                {selected && (
                  <>
                    <Autocomplete
                      options={(result.data?.items ?? []).filter(
                        (t) =>
                          t.id !== selected.id && !t.retired && !t.mergedInto,
                      )}
                      value={target}
                      onChange={(_, t) => setTarget(t)}
                      getOptionLabel={(t) => t.name}
                      isOptionEqualToValue={(a, b) => a.id === b.id}
                      renderInput={(props) => (
                        <TextField {...props} label="Merge into tag" />
                      )}
                    />
                    <IconAction
                      label="Merge selected tag"
                      disabled={
                        !target ||
                        reason.trim().length < 3 ||
                        mutation.isPending
                      }
                      onClick={() => mutation.mutate(true)}
                    >
                      <Merge />
                    </IconAction>
                  </>
                )}
              </Stack>
            </Paper>
          )}
          {result.isPending ? (
            <Loading />
          ) : result.error ? (
            <ErrorState error={result.error} />
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 1,
              }}
            >
              {result.data.items
                .filter(
                  (t) =>
                    !t.mergedInto &&
                    ((staffPage && showRetired) || !t.retired) &&
                    [t.name, ...t.aliases].some((v) =>
                      v.toLowerCase().includes(q.toLowerCase()),
                    ),
                )
                .map((tag) => (
                  <Paper key={tag.id} variant="outlined" sx={{ p: 2 }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center" }}
                    >
                      <Link
                        component={RouterLink}
                        to={"/directory?tags=" + tag.id}
                        sx={{ flex: 1 }}
                      >
                        <TagLabel name={tag.name} />
                      </Link>
                      <Typography variant="caption">{tag.count}</Typography>
                      {tag.retired && <Chip size="small" label="Retired" />}
                      {staffPage && (
                        <IconAction
                          label={"Edit tag: " + tag.name}
                          onClick={() => edit(tag)}
                        >
                          <EditOutlined />
                        </IconAction>
                      )}
                    </Stack>
                  </Paper>
                ))}
            </Box>
          )}
        </>
      )}
    </Page>
  );
}
