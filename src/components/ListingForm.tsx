import { useForm, Controller, useFieldArray, useWatch } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { queries } from "../lib/api";
import { TagIcon, TagLabel } from "./TopicTags";
import { LocationSelector } from "./LocationSelector";
import {
  Alert,
  Autocomplete,
  Box,
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
  Tooltip,
} from "@mui/material";
import {
  submissionSchema,
  accessLabels,
  lifecycleLabels,
} from "../../shared/contracts";
import ExpandMore from "@mui/icons-material/ExpandMore";
import HelpOutline from "@mui/icons-material/HelpOutlineOutlined";
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
import type { PendingImage } from "./EntryImages";
import { TagSuggestionDialog } from "./TagSuggestionDialog";

type SectionKey =
  | "images"
  | "community"
  | "connections"
  | "participation"
  | "location"
  | "topics";

type ListingFormProps = {
  initial?: Submission;
  onSave: (data: Submission, images?: PendingImage[]) => void;
  pending: boolean;
  error: Error | null;
  disabled?: boolean;
  canUploadImages?: boolean;
  formId?: string;
  hideSaveAction?: boolean;
  imageContent?: ReactNode;
  onDirtyChange?: (dirty: boolean) => void;
};

type ConnectionFieldName =
  | `connections.${number}.url`
  | `connections.${number}.type`
  | `connections.${number}.label`
  | `connections.${number}.placement`;

function connectionFieldName(
  index: number,
  field: "url" | "type" | "label" | "placement",
): ConnectionFieldName {
  return `connections.${index}.${field}`;
}

function FieldLabel({ label, help }: { label: string; help: string }) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      <span>{label}</span>
      <Tooltip title={help} describeChild>
        <HelpOutline
          fontSize="small"
          sx={{ color: "text.secondary", verticalAlign: "middle" }}
        />
      </Tooltip>
    </Stack>
  );
}

function FormSection({
  id,
  title,
  description,
  expanded,
  onChange,
  errorCount = 0,
  children,
}: {
  id: SectionKey;
  title: string;
  description: string;
  expanded: boolean;
  onChange: () => void;
  errorCount?: number;
  children: ReactNode;
}) {
  return (
    <Accordion
      expanded={expanded}
      onChange={onChange}
      disableGutters
      sx={{
        border: 1,
        borderColor: errorCount ? "error.main" : "divider",
        borderRadius: 1,
        "&:before": { display: "none" },
      }}
    >
      <AccordionSummary
        id={id + "-section-header"}
        aria-controls={id + "-section-content"}
        expandIcon={<ExpandMore />}
        sx={{ px: { xs: 2, md: 3 } }}
      >
        <Stack spacing={0.25} sx={{ minWidth: 0 }}>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ alignItems: "center", flexWrap: "wrap" }}
          >
            <Typography variant="h2">{title}</Typography>
            {errorCount > 0 && (
              <Chip
                size="small"
                color="error"
                label={errorCount + (errorCount === 1 ? " error" : " errors")}
              />
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails
        id={id + "-section-content"}
        sx={{ px: { xs: 2, md: 3 } }}
      >
        <Stack spacing={2}>{children}</Stack>
      </AccordionDetails>
    </Accordion>
  );
}

type ValidationIssue = {
  id: string;
  section: "basics" | SectionKey;
  label: string;
  message: string;
};

function messageFrom(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return "Check this field.";
}

type ComparableConnection = {
  id?: unknown;
  type?: unknown;
  url?: unknown;
  label?: unknown;
  placement?: unknown;
};

function comparableListingValues(value: unknown) {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const stringValue = (key: string, fallback = "") =>
    typeof source[key] === "string" ? source[key] : fallback;
  const connections = Array.isArray(source.connections)
    ? source.connections.map((item) => {
        const connection =
          item && typeof item === "object"
            ? (item as ComparableConnection)
            : {};
        return {
          id: typeof connection.id === "string" ? connection.id : "",
          type: typeof connection.type === "string" ? connection.type : "",
          url: typeof connection.url === "string" ? connection.url : "",
          label: typeof connection.label === "string" ? connection.label : "",
          placement:
            typeof connection.placement === "string"
              ? connection.placement
              : "auto",
        };
      })
    : [];
  return {
    name: stringValue("name"),
    summary: stringValue("summary"),
    description: stringValue("description"),
    connections,
    location: stringValue("location"),
    tags: Array.isArray(source.tags)
      ? source.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    accessMode: stringValue("accessMode", "unknown"),
    accessInstructions: stringValue("accessInstructions"),
    lifecycle: stringValue("lifecycle", "unknown"),
    seekingOrganizer: source.seekingOrganizer === true,
    publicPhone: stringValue("publicPhone"),
    publicEmail: stringValue("publicEmail"),
    publicAddress: stringValue("publicAddress"),
    openingHours: stringValue("openingHours"),
  };
}

function DetailedListingForm({
  initial,
  onSave,
  pending,
  error,
  disabled = false,
  formId,
  hideSaveAction = false,
  imageContent,
  onDirtyChange,
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
  const watchedValues = useWatch({ control });
  const invitationOnly = access === "invite_only" || access === "private";
  const initialComparable = useMemo(
    () => comparableListingValues(initial),
    [initial],
  );
  const isDirty =
    JSON.stringify(comparableListingValues(watchedValues)) !==
    JSON.stringify(initialComparable);
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    images: false,
    community: false,
    connections: false,
    participation: false,
    location: false,
    topics: false,
  });

  const issues: ValidationIssue[] = [
    errors.name && {
      id: "name-field",
      section: "basics",
      label: "Name",
      message: messageFrom(errors.name),
    },
    errors.summary && {
      id: "summary-field",
      section: "basics",
      label: "Short description",
      message: messageFrom(errors.summary),
    },
    errors.description && {
      id: "description-field",
      section: "community",
      label: "More details",
      message: messageFrom(errors.description),
    },
    errors.location && {
      id: "location-field",
      section: "location",
      label: "Town or region",
      message: messageFrom(errors.location),
    },
    errors.accessInstructions && {
      id: "access-instructions-field",
      section: "participation",
      label: "How to participate",
      message: messageFrom(errors.accessInstructions),
    },
    errors.tags && {
      id: "tags-field",
      section: "topics",
      label: "Topics",
      message: messageFrom(errors.tags),
    },
    errors.publicPhone && {
      id: "public-phone-field",
      section: "location",
      label: "Public phone",
      message: messageFrom(errors.publicPhone),
    },
    errors.publicEmail && {
      id: "public-email-field",
      section: "location",
      label: "Public email",
      message: messageFrom(errors.publicEmail),
    },
    errors.publicAddress && {
      id: "public-address-field",
      section: "location",
      label: "Public address",
      message: messageFrom(errors.publicAddress),
    },
    errors.openingHours && {
      id: "opening-hours-field",
      section: "location",
      label: "Opening hours",
      message: messageFrom(errors.openingHours),
    },
    errors.connections?.root && {
      id: "connections-section-header",
      section: "connections",
      label: "Connections",
      message: messageFrom(errors.connections.root),
    },
  ].filter(Boolean) as ValidationIssue[];

  connections.fields.forEach((_, index) => {
    const connectionError = errors.connections?.[index];
    if (connectionError?.url)
      issues.push({
        id: "connection-" + index + "-url",
        section: "connections",
        label: "Connection " + (index + 1) + " URL",
        message: messageFrom(connectionError.url),
      });
    if (connectionError?.label)
      issues.push({
        id: "connection-" + index + "-label",
        section: "connections",
        label: "Connection " + (index + 1) + " label",
        message: messageFrom(connectionError.label),
      });
  });

  function focusIssue(issue: ValidationIssue) {
    if (issue.section !== "basics")
      setExpanded((current) => ({ ...current, [issue.section]: true }));
    window.setTimeout(() => {
      const element = document.getElementById(issue.id);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (element instanceof HTMLElement) element.focus();
    }, 50);
  }

  const issueCount = (section: ValidationIssue["section"]) =>
    issues.filter((issue) => issue.section === section).length;

  return (
    <Box
      component="form"
      id={formId}
      sx={{ width: "100%" }}
      onSubmit={handleSubmit(
        (data) => onSave(data),
        () => {
          window.setTimeout(() =>
            document.getElementById("edit-form-errors")?.focus(),
          );
        },
      )}
      noValidate
    >
      <Stack spacing={2.5}>
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="h2">Basics</Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                Keep the public identity clear and easy to understand. The same
                information starts the creation wizard.
              </Typography>
            </Box>
            {issues.length > 0 && (
              <Alert id="edit-form-errors" severity="error" tabIndex={-1}>
                <Typography sx={{ fontWeight: 600, mb: 0.5 }}>
                  Check {issues.length === 1 ? "this field" : "these fields"} before
                  saving.
                </Typography>
                <Stack component="ul" spacing={0.25} sx={{ m: 0, pl: 2 }}>
                  {issues.map((issue) => (
                    <li key={issue.section + "-" + issue.id}>
                      <Button
                        type="button"
                        size="small"
                        onClick={() => focusIssue(issue)}
                        sx={{
                          minWidth: 0,
                          p: 0,
                          justifyContent: "flex-start",
                          textTransform: "none",
                          color: "inherit",
                          textDecoration: "underline",
                        }}
                      >
                        {issue.label}: {issue.message}
                      </Button>
                    </li>
                  ))}
                </Stack>
              </Alert>
            )}
            <TextField
              id="name-field"
              label="Name"
              required
              {...register("name")}
              error={!!errors.name}
              helperText={errors.name?.message}
            />
            <TextField
              id="summary-field"
              label="Short description"
              required
              multiline
              minRows={2}
              {...register("summary")}
              error={!!errors.summary}
              helperText={errors.summary?.message ?? "10–280 characters"}
            />
          </Stack>
        </Paper>
        {imageContent && (
          <FormSection
            id="images"
            title="Images"
            description="Add pictures that are part of this entry and choose one community card image."
            expanded={expanded.images}
            onChange={() =>
              setExpanded((current) => ({
                ...current,
                images: !current.images,
              }))
            }
            errorCount={issueCount("images")}
          >
            {imageContent}
          </FormSection>
        )}

        <FormSection
          id="community"
          title="Community details"
          description="Describe what this is, where it stands, and whether it needs an organizer."
          expanded={expanded.community}
          onChange={() =>
            setExpanded((current) => ({
              ...current,
              community: !current.community,
            }))
          }
          errorCount={issueCount("community")}
        >
          <Controller
            name="lifecycle"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                select
                label={
                  <FieldLabel
                    label="Community stage"
                    help="Existing means it operates now. Idea / proposed means you would like to start it."
                  />
                }
              >
                {Object.entries(lifecycleLabels).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Box>
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
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block" }}
            >
              This helps people find ideas that need someone to get them
              started. It does not assign ownership or editing rights.
            </Typography>
          </Box>
          <TextField
            id="description-field"
            label="More details"
            multiline
            minRows={3}
            {...register("description")}
            error={!!errors.description}
            helperText={errors.description?.message}
          />
        </FormSection>

        <FormSection
          id="connections"
          title="Connections"
          description="Add the public links people can use to find or join this community."
          expanded={expanded.connections}
          onChange={() =>
            setExpanded((current) => ({
              ...current,
              connections: !current.connections,
            }))
          }
          errorCount={issueCount("connections")}
        >
          <Typography variant="body2" color="text.secondary">
            Choose a link type, then paste the public URL. For example, a Signal
            group needs its public Signal invite link.
          </Typography>
          {connections.fields.map((connection, index) => {
            const urlName = connectionFieldName(index, "url");
            const typeName = connectionFieldName(index, "type");
            const labelName = connectionFieldName(index, "label");
            const placementName = connectionFieldName(index, "placement");
            return (
              <Paper key={connection.fieldKey} variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={2}>
                  <TextField
                    id={"connection-" + index + "-url"}
                    label={"Connection " + (index + 1) + " URL"}
                    {...register(urlName, {
                      onChange: (event) =>
                        setValue(
                          typeName,
                          classifyConnection(event.target.value),
                        ),
                      onBlur: (event) => {
                        const normalized = normalizeWebUrl(event.target.value);
                        if (normalized !== event.target.value)
                          setValue(urlName, normalized, {
                            shouldDirty: true,
                          });
                      },
                    })}
                    error={!!errors.connections?.[index]?.url}
                    helperText={errors.connections?.[index]?.url?.message}
                  />
                  <Controller
                    control={control}
                    name={typeName}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        select
                        label={"Connection " + (index + 1) + " type"}
                      >
                        {Object.entries(connectionLabels).map(
                          ([type, label]) => (
                            <MenuItem key={type} value={type}>
                              {label}
                            </MenuItem>
                          ),
                        )}
                      </TextField>
                    )}
                  />
                  <TextField
                    id={"connection-" + index + "-label"}
                    label={"Connection " + (index + 1) + " label (optional)"}
                    {...register(labelName)}
                    error={!!errors.connections?.[index]?.label}
                    helperText={errors.connections?.[index]?.label?.message}
                  />
                  <Controller
                    control={control}
                    name={placementName}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        value={field.value ?? "auto"}
                        select
                        label={
                          <FieldLabel
                            label={"Connection " + (index + 1) + " placement"}
                            help="Automatic keeps one homepage and a main link per platform. Use Additional resource for supporting pages."
                          />
                        }
                      >
                        <MenuItem value="auto">Automatic</MenuItem>
                        <MenuItem value="primary">Primary connection</MenuItem>
                        <MenuItem value="additional">
                          Additional resource
                        </MenuItem>
                      </TextField>
                    )}
                  />
                  <Stack
                    direction="row"
                    spacing={1}
                    useFlexGap
                    sx={{ flexWrap: "wrap" }}
                  >
                    <Button
                      type="button"
                      size="small"
                      variant="outlined"
                      startIcon={<ArrowUpward />}
                      disabled={index === 0}
                      onClick={() => connections.move(index, index - 1)}
                    >
                      Move up
                    </Button>
                    <Button
                      type="button"
                      size="small"
                      variant="outlined"
                      startIcon={<ArrowDownward />}
                      disabled={index === connections.fields.length - 1}
                      onClick={() => connections.move(index, index + 1)}
                    >
                      Move down
                    </Button>
                    <Button
                      type="button"
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
            );
          })}
          {errors.connections?.root?.message && (
            <Alert severity="error">{errors.connections.root.message}</Alert>
          )}
          <Button
            type="button"
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
        </FormSection>

        <FormSection
          id="participation"
          title="Participation"
          description="Tell visitors what they can expect and how they can participate."
          expanded={expanded.participation}
          onChange={() =>
            setExpanded((current) => ({
              ...current,
              participation: !current.participation,
            }))
          }
          errorCount={issueCount("participation")}
        >
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
              These instructions are public. Do not publish private invite links
              or someone else&apos;s contact information.
            </Alert>
          )}
          <TextField
            id="access-instructions-field"
            label={
              invitationOnly
                ? "How to request an invitation (public)"
                : "How to participate"
            }
            multiline
            minRows={2}
            {...register("accessInstructions")}
            error={!!errors.accessInstructions}
            helperText={errors.accessInstructions?.message}
          />
        </FormSection>

        <FormSection
          id="location"
          title="Location and public contact"
          description="Add public location or contact details when they help people participate."
          expanded={expanded.location}
          onChange={() =>
            setExpanded((current) => ({
              ...current,
              location: !current.location,
            }))
          }
          errorCount={issueCount("location")}
        >
          <Controller
            name="location"
            control={control}
            render={({ field }) => (
              <LocationSelector
                id="location-field"
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                legacy={initial?.location ? [initial.location] : []}
                error={!!errors.location}
                helperText={errors.location?.message}
              />
            )}
          />
          <Typography variant="body2" color="text.secondary">
            Only add organization or business contact details intended for
            public use. Do not publish personal phone numbers, private emails,
            or residential addresses.
          </Typography>
          <TextField
            id="public-phone-field"
            label="Public phone"
            {...register("publicPhone")}
            error={!!errors.publicPhone}
            helperText={errors.publicPhone?.message}
          />
          <TextField
            id="public-email-field"
            label="Public email"
            {...register("publicEmail")}
            error={!!errors.publicEmail}
            helperText={errors.publicEmail?.message}
          />
          <TextField
            id="public-address-field"
            label="Public address"
            {...register("publicAddress")}
            error={!!errors.publicAddress}
            helperText={errors.publicAddress?.message}
          />
          <TextField
            id="opening-hours-field"
            label="Opening hours"
            multiline
            {...register("openingHours")}
            error={!!errors.openingHours}
            helperText={errors.openingHours?.message}
          />
        </FormSection>

        <FormSection
          id="topics"
          title="Topics and tags"
          description="Help people find this entry with the topics that best describe it."
          expanded={expanded.topics}
          onChange={() =>
            setExpanded((current) => ({ ...current, topics: !current.topics }))
          }
          errorCount={issueCount("topics")}
        >
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
                    id="tags-field"
                    label="Topics"
                    error={!!errors.tags}
                    helperText={
                      errors.tags?.message ??
                      (catalog.error
                        ? "Tag catalog unavailable. Reload before selecting tags."
                        : "Select up to 12 topics. Platform tags come from the links you add.")
                    }
                  />
                )}
              />
            )}
          />
          <TagSuggestionDialog listingName={entryName} />
        </FormSection>

        {error && !hideSaveAction && (
          <Alert severity="error">{error.message}</Alert>
        )}
        {!hideSaveAction && (
          <Button
            type="submit"
            variant="contained"
            startIcon={<SaveOutlined />}
            aria-label={pending ? "Saving entry" : "Save entry"}
            disabled={pending || disabled}
          >
            {pending ? "Saving…" : "Save changes"}
          </Button>
        )}
      </Stack>
    </Box>
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
        canUploadImages={props.canUploadImages}
      />
    );
  return <DetailedListingForm {...props} />;
}
