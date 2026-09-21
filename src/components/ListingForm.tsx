import { useForm, Controller, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { queries } from "../lib/api";
import { TagIcon, TagLabel } from "./TopicTags";
import { LocationSelector } from "./LocationSelector";
import {
  Alert,
  Autocomplete,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  Checkbox,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import {
  submissionSchema,
  accessLabels,
  lifecycleLabels,
} from "../../shared/contracts";
import ExpandMore from "@mui/icons-material/ExpandMore";
import type { Submission } from "../../shared/contracts";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import AddLinkOutlined from "@mui/icons-material/AddLinkOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutlined";
import ArrowUpward from "@mui/icons-material/ArrowUpward";
import ArrowDownward from "@mui/icons-material/ArrowDownward";
import {
  classifyConnection,
  connectionLabels,
  normalizeWebUrl,
} from "../../shared/connections";
import { EntryCreationWizard } from "./EntryCreationWizard";
import { TagSuggestionDialog } from "./TagSuggestionDialog";

type ListingFormProps = {
  initial?: Submission;
  onSave: (data: Submission) => void;
  pending: boolean;
  error: Error | null;
  disabled?: boolean;
  reason?: string;
  onReasonChange?: (reason: string) => void;
};

function DetailedListingForm({
  initial,
  onSave,
  pending,
  error,
  disabled = false,
  reason = "",
  onReasonChange,
}: ListingFormProps) {
  const catalog = useQuery(queries.tags);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<z.input<typeof submissionSchema>, unknown, Submission>({
    resolver: zodResolver(submissionSchema),
    defaultValues: initial ?? {
      kind: "entry",
      name: "",
      summary: "",
      description: "",
      url: "",
      contactUrl: "",
      connections: [],
      location: "",
      tags: [],
      accessMode: "unknown",
      accessInstructions: "",
      lifecycle: "unknown",
      seekingOrganizer: false,
      publicPhone: "",
      publicEmail: "",
      publicAddress: "",
      openingHours: "",
    },
  });
  const connections = useFieldArray({
    control,
    name: "connections",
    keyName: "fieldKey",
  });
  const access = useWatch({ control, name: "accessMode" });
  const entryName = useWatch({ control, name: "name" });
  const invitationOnly = access === "invite_only" || access === "private";

  return (
    <Paper
      component="form"
      variant="outlined"
      sx={{ p: { xs: 2, md: 3 }, maxWidth: 800 }}
      onSubmit={handleSubmit((data) => onSave(data))}
      noValidate
    >
      <Stack spacing={3}>
        <Typography variant="body2">
          Every listing is an entry. Choose existing tags below to describe it;
          connection types such as Signal are searchable automatically from the
          links you add.
        </Typography>
        <TextField
          label="Name"
          required
          {...register("name")}
          error={!!errors.name}
          helperText={errors.name?.message}
        />
        <Controller
          name="lifecycle"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              select
              label="Community stage"
              helperText="Not sure yet: you don't know whether it already exists. Existing: it operates now. Idea / proposed: you'd like to start it. Missing joining details alone do not make it an idea."
            >
              {Object.entries(lifecycleLabels).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <Controller
          name="seekingOrganizer"
          control={control}
          render={({ field }) => (
            <FormControlLabel
              label="Seeking an organizer"
              control={
                <Checkbox
                  checked={field.value ?? false}
                  onChange={(_, value) => field.onChange(value)}
                />
              }
            />
          )}
        />
        <Typography variant="caption">
          An organizer helps run the real-world community. This flag does not
          assign an account owner or grant editing rights.
        </Typography>
        <TextField
          label="Short description"
          required
          multiline
          minRows={2}
          {...register("summary")}
          error={!!errors.summary}
          helperText={errors.summary?.message ?? "10–280 characters"}
        />
        <TextField
          label="More details"
          multiline
          minRows={3}
          {...register("description")}
          error={!!errors.description}
          helperText={errors.description?.message}
        />
        <Stack spacing={2}>
          <Typography variant="h2">Connections</Typography>
          <Typography variant="body2">
            Only share links intended for publication. Add multiple
            destinations, or leave empty if unknown.
          </Typography>
          {connections.fields.map((connection, index) => (
            <Paper key={connection.fieldKey} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <TextField
                  label={`Connection ${index + 1} URL`}
                  {...register(`connections.${index}.url`, {
                    onChange: (event) =>
                      setValue(
                        `connections.${index}.type`,
                        classifyConnection(event.target.value),
                      ),
                    onBlur: (event) => {
                      const normalized = normalizeWebUrl(event.target.value);
                      if (normalized !== event.target.value)
                        setValue(`connections.${index}.url`, normalized, {
                          shouldDirty: true,
                        });
                    },
                  })}
                  error={!!errors.connections?.[index]?.url}
                  helperText={errors.connections?.[index]?.url?.message}
                />
                <Controller
                  control={control}
                  name={`connections.${index}.type`}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      select
                      label={`Connection ${index + 1} type`}
                    >
                      {Object.entries(connectionLabels).map(([type, label]) => (
                        <MenuItem key={type} value={type}>
                          {label}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
                <TextField
                  label={`Connection ${index + 1} label (optional)`}
                  {...register(`connections.${index}.label`)}
                  error={!!errors.connections?.[index]?.label}
                  helperText={
                    errors.connections?.[index]?.label?.message ??
                    "For example: Main chat, Events chat, or Public contact page."
                  }
                />
                <Controller
                  control={control}
                  name={`connections.${index}.placement`}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value ?? "auto"}
                      select
                      label={`Connection ${index + 1} placement`}
                      helperText="Automatic keeps one homepage and a main link per platform. Same-site subpages stay off the public list unless explicitly added as a resource."
                    >
                      <MenuItem value="auto">Automatic</MenuItem>
                      <MenuItem value="primary">Primary connection</MenuItem>
                      <MenuItem value="additional">
                        Additional resource
                      </MenuItem>
                    </TextField>
                  )}
                />
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<ArrowUpward />}
                    disabled={index === 0}
                    onClick={() => connections.move(index, index - 1)}
                  >
                    Move up
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<ArrowDownward />}
                    disabled={index === connections.fields.length - 1}
                    onClick={() => connections.move(index, index + 1)}
                  >
                    Move down
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    startIcon={<DeleteOutline />}
                    onClick={() => connections.remove(index)}
                  >
                    Remove
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          ))}
          {errors.connections?.root?.message && (
            <Alert severity="error">{errors.connections.root.message}</Alert>
          )}
          {errors.connections?.message && (
            <Alert severity="error">{errors.connections.message}</Alert>
          )}
          <Button
            variant="outlined"
            startIcon={<AddLinkOutlined />}
            disabled={connections.fields.length >= 30}
            onClick={() =>
              connections.append({
                id: crypto.randomUUID(),
                type: "website",
                url: "",
                label: "",
              })
            }
          >
            Add another link
          </Button>
        </Stack>
        <Controller
          name="location"
          control={control}
          render={({ field }) => (
            <LocationSelector
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              legacy={initial?.location ? [initial.location] : []}
              error={!!errors.location}
              helperText={errors.location?.message}
            />
          )}
        />
        <Controller
          name="accessMode"
          control={control}
          render={({ field }) => (
            <TextField {...field} select label="Access">
              {Object.entries(accessLabels).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        {invitationOnly && (
          <Alert severity="warning">
            This listing and its invitation instructions are public. The lock
            describes access to the group, not privacy on this website. Prefer a
            group-managed request form or public contact page added under
            Connections. Do not enter private invite links or someone’s name,
            email or phone without their permission. Changes are retained in
            revision history.
          </Alert>
        )}
        <TextField
          label={
            invitationOnly
              ? "How to request an invitation (public)"
              : "How to participate"
          }
          multiline
          minRows={2}
          {...register("accessInstructions")}
          error={!!errors.accessInstructions}
          helperText={
            errors.accessInstructions?.message ??
            (invitationOnly
              ? "Explain the request process and which connection link to use. No personal contact details are required; leaving this blank is okay when the process is unknown."
              : undefined)
          }
        />
        <Controller
          name="tags"
          control={control}
          render={({ field }) => (
            <Autocomplete
              multiple
              options={(catalog.data?.items ?? [])
                .filter((tag) => !tag.retired && !tag.mergedInto)
                .map((tag) => tag.name)}
              loading={catalog.isPending}
              filterOptions={(options, { inputValue }) =>
                options.filter((name) => {
                  const tag = catalog.data?.items.find(
                    (item) => item.name === name,
                  );
                  return [name, ...(tag?.aliases ?? [])].some((value) =>
                    value.toLowerCase().includes(inputValue.toLowerCase()),
                  );
                })
              }
              renderOption={({ key, ...props }, tag) => (
                <li key={key} {...props}>
                  <TagLabel name={tag} />
                </li>
              )}
              renderValue={(value, getItemProps) =>
                value.map((tag, index) => {
                  const { key, ...props } = getItemProps({ index });
                  return (
                    <Chip
                      key={key}
                      {...props}
                      label={tag}
                      icon={<TagIcon name={tag} />}
                    />
                  );
                })
              }
              value={field.value ?? []}
              onChange={(_, value) => field.onChange(value)}
              onBlur={field.onBlur}
              renderInput={(props) => (
                <TextField
                  {...props}
                  label="Topics"
                  error={!!errors.tags}
                  helperText={
                    errors.tags?.message ??
                    (catalog.error
                      ? "Tag catalog unavailable. Reload before selecting tags."
                      : "Select existing topic tags (12 tags total). Website, Facebook, Telegram and Slack tags are matched to the actual connections when saved; mentioning a platform is not enough. Editors manage the catalog.")
                  }
                />
              )}
            />
          )}
        />
        <TagSuggestionDialog listingName={entryName} />
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMore />}>
            Public contact details (optional)
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <Typography variant="body2">
                Only organization/business contacts intended for public use. Do
                not publish personal phone numbers, private emails or
                residential addresses. Check hours at the original website
                before visiting.
              </Typography>
              <TextField
                label="Public phone"
                {...register("publicPhone")}
                error={!!errors.publicPhone}
                helperText={errors.publicPhone?.message}
              />
              <TextField
                label="Public email"
                {...register("publicEmail")}
                error={!!errors.publicEmail}
                helperText={errors.publicEmail?.message}
              />
              <TextField
                label="Public address"
                {...register("publicAddress")}
                error={!!errors.publicAddress}
                helperText={errors.publicAddress?.message}
              />
              <TextField
                label="Opening hours"
                multiline
                {...register("openingHours")}
                error={!!errors.openingHours}
                helperText={errors.openingHours?.message}
              />
            </Stack>
          </AccordionDetails>
        </Accordion>
        {onReasonChange && (
          <TextField
            label="Reason for change"
            required
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            helperText="At least 3 characters. Do not include personal information."
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
        )}
        {error && <Alert severity="error">{error.message}</Alert>}
        <Button
          type="submit"
          variant="contained"
          startIcon={<SaveOutlined />}
          aria-label={pending ? "Saving entry" : "Save entry"}
          disabled={pending || disabled}
        >
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </Stack>
    </Paper>
  );
}

export function ListingForm(props: ListingFormProps) {
  if (!props.initial)
    return (
      <EntryCreationWizard
        onSave={props.onSave}
        pending={props.pending}
        error={props.error}
        disabled={props.disabled}
      />
    );
  return <DetailedListingForm {...props} />;
}
