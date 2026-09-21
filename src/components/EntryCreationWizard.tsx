import { useFieldArray, useForm, Controller, useWatch } from "react-hook-form";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  Link as MuiLink,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
import DeleteOutline from "@mui/icons-material/DeleteOutlined";
import AddLinkOutlined from "@mui/icons-material/AddLinkOutlined";
import { queries } from "../lib/api";
import { LocationSelector } from "./LocationSelector";
import { TagIcon, TagLabel } from "./TopicTags";
import { TagSuggestionDialog } from "./TagSuggestionDialog";
import {
  accessLabels,
  submissionSchema,
  type Submission,
} from "../../shared/contracts";
import {
  classifyConnection,
  connectionLabels,
  normalizeWebUrl,
  type ConnectionType,
} from "../../shared/connections";

type EntryIntent = "existing" | "proposed";
type EntryFocus = "business" | "organization" | "community" | "resource";

const focusOptions: Array<{
  value: EntryFocus;
  title: string;
  description: string;
  suggestedTag?: string;
}> = [
  {
    value: "business",
    title: "Business or service",
    description:
      "A business, studio, professional service or place people can use.",
    suggestedTag: "Business",
  },
  {
    value: "organization",
    title: "Nonprofit or organization",
    description:
      "A mission-led organization, nonprofit, civic group or project.",
    suggestedTag: "Nonprofit",
  },
  {
    value: "community",
    title: "Community or group",
    description:
      "People who gather around a shared interest, activity or purpose.",
  },
  {
    value: "resource",
    title: "Resource or place",
    description:
      "Useful information, a publication, a venue or another public resource.",
  },
];

const defaultValues: z.input<typeof submissionSchema> = {
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
};

export function EntryCreationWizard({
  onSave,
  pending,
  error,
  disabled = false,
}: {
  onSave: (data: Submission) => void;
  pending: boolean;
  error: Error | null;
  disabled?: boolean;
}) {
  const catalog = useQuery(queries.tags);
  const {
    register,
    control,
    getValues,
    setValue,
    handleSubmit,
    trigger,
    formState: { errors },
  } = useForm<z.input<typeof submissionSchema>, unknown, Submission>({
    resolver: zodResolver(submissionSchema),
    defaultValues,
    mode: "onBlur",
  });
  const connections = useFieldArray({
    control,
    name: "connections",
    keyName: "fieldKey",
  });
  const values = useWatch({ control });
  const access = useWatch({ control, name: "accessMode" });
  const [intent, setIntent] = useState<EntryIntent | null>(null);
  const [focus, setFocus] = useState<EntryFocus | null>(null);
  const [organizer, setOrganizer] = useState<"yes" | "no" | null>(null);
  const [newConnectionType, setNewConnectionType] =
    useState<ConnectionType>("website");
  const [step, setStep] = useState(0);
  const [choiceError, setChoiceError] = useState("");

  const steps = [
    "Start",
    "Type",
    ...(intent === "proposed" ? ["Organizer"] : []),
    "Basics",
    "Links",
    "Participation",
    "Review",
  ];
  const current = steps[step] ?? "Start";
  const isProposed = intent === "proposed";
  const selectedFocus = focusOptions.find((option) => option.value === focus);

  function chooseIntent(value: EntryIntent) {
    setIntent(value);
    setChoiceError("");
    setOrganizer(null);
    setValue("lifecycle", value === "proposed" ? "proposed" : "existing");
    setValue("seekingOrganizer", false);
  }

  function chooseFocus(value: EntryFocus) {
    setFocus(value);
    setChoiceError("");
    const suggested = focusOptions.find(
      (option) => option.value === value,
    )?.suggestedTag;
    if (suggested) {
      const definition = catalog.data?.items.find(
        (tag) => tag.name.toLowerCase() === suggested.toLowerCase(),
      );
      const currentTags = getValues("tags") ?? [];
      if (
        definition &&
        !currentTags.some(
          (tag) => tag.toLowerCase() === definition.name.toLowerCase(),
        )
      )
        setValue("tags", [...currentTags, definition.name], {
          shouldDirty: true,
        });
    }
  }

  async function next() {
    setChoiceError("");
    if (current === "Start" && !intent) {
      setChoiceError("Choose whether this is an existing entry or a new idea.");
      return;
    }
    if (current === "Type" && !focus) {
      setChoiceError("Choose the description that fits best.");
      return;
    }
    if (current === "Organizer" && !organizer) {
      setChoiceError("Choose whether you will organize this idea.");
      return;
    }
    if (current === "Organizer") {
      setValue("seekingOrganizer", organizer === "no");
      setValue("lifecycle", "proposed");
    }
    if (current === "Basics" && !(await trigger(["name", "summary"]))) return;
    if (current === "Links" && !(await trigger("connections"))) return;
    if (step < steps.length - 1) setStep((currentStep) => currentStep + 1);
  }

  function back() {
    setChoiceError("");
    if (step > 0) setStep((currentStep) => currentStep - 1);
  }

  function addConnection() {
    connections.append({
      id: crypto.randomUUID(),
      type: newConnectionType,
      url: "",
      label: "",
    });
  }

  const hasPublicContact = focus === "business" || focus === "organization";
  const invitationOnly = access === "invite_only" || access === "private";
  const detectedConnections = [
    ...new Set(
      (values.connections ?? [])
        .filter((connection) => connection?.url)
        .map((connection) => connectionLabels[connection?.type ?? "other"]),
    ),
  ];

  return (
    <Paper
      component="form"
      variant="outlined"
      sx={{ p: { xs: 2, md: 3 }, maxWidth: 800 }}
      onSubmit={handleSubmit((data) => onSave(data))}
      noValidate
    >
      <Stack spacing={3}>
        <Stepper activeStep={step} alternativeLabel>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        <Box>
          <Typography variant="h2">
            {current === "Start" && "What are you adding?"}
            {current === "Type" && "What best describes it?"}
            {current === "Organizer" && "Will you organize this idea?"}
            {current === "Basics" &&
              (isProposed ? "What would this idea do?" : "Tell us about it")}
            {current === "Links" && "Where can people find it?"}
            {current === "Participation" && "How can people participate?"}
            {current === "Review" && "Review before publishing"}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            {current === "Start" &&
              "A few short answers will help us show the right fields. You can leave unknown details blank."}
            {current === "Type" &&
              "This is a directory descriptor, not a legal or tax-status certification."}
            {current === "Organizer" &&
              "This helps people find ideas that need someone to get them started."}
            {current === "Basics" &&
              "Start with the purpose a visitor needs to understand. More details can be added later."}
            {current === "Links" &&
              "Choose what kind of link you have, then paste it. You can continue without a link if you do not have one yet."}
            {current === "Participation" &&
              "Tell visitors what they can expect. Unknown is a valid answer."}
            {current === "Review" &&
              "Everything shown here will be part of the public entry."}
          </Typography>
        </Box>

        {current === "Start" && (
          <RadioGroup
            value={intent ?? ""}
            onChange={(event) =>
              chooseIntent(event.target.value as EntryIntent)
            }
          >
            <Choice
              value="existing"
              selected={intent === "existing"}
              title="An existing community, business, organization or resource"
              description="It already exists and people can learn how to connect with it."
            />
            <Choice
              value="proposed"
              selected={intent === "proposed"}
              title="A new idea for a group or community"
              description="It may not exist yet, but the idea is useful to share."
            />
          </RadioGroup>
        )}

        {current === "Type" && (
          <Stack spacing={1.5}>
            {focusOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={focus === option.value ? "contained" : "outlined"}
                onClick={() => chooseFocus(option.value)}
                sx={{
                  justifyContent: "flex-start",
                  alignItems: "flex-start",
                  textAlign: "left",
                  p: 2,
                }}
              >
                <Stack>
                  <Typography sx={{ fontWeight: 600 }}>
                    {option.title}
                  </Typography>
                  <Typography variant="body2">{option.description}</Typography>
                </Stack>
              </Button>
            ))}
          </Stack>
        )}

        {current === "Organizer" && (
          <FormControl>
            <RadioGroup
              value={organizer ?? ""}
              onChange={(event) => {
                setOrganizer(event.target.value as "yes" | "no");
                setChoiceError("");
              }}
            >
              <Choice
                value="yes"
                selected={organizer === "yes"}
                title="Yes, I will organize it"
                description="The directory will still describe it as an idea until it is established."
              />
              <Choice
                value="no"
                selected={organizer === "no"}
                title="No, I am looking for an organizer"
                description="The entry will be discoverable through the Needs organizer filter."
              />
            </RadioGroup>
          </FormControl>
        )}

        {current === "Basics" && (
          <Stack spacing={2}>
            <TextField
              label="Name"
              required
              {...register("name")}
              error={!!errors.name}
              helperText={errors.name?.message}
              autoFocus
            />
            <TextField
              label={isProposed ? "What would it do?" : "What is it?"}
              required
              multiline
              minRows={2}
              {...register("summary")}
              error={!!errors.summary}
              helperText={errors.summary?.message ?? "10–280 characters"}
            />
            <TextField
              label="More details (optional)"
              multiline
              minRows={3}
              {...register("description")}
              error={!!errors.description}
              helperText={errors.description?.message}
            />
            <Controller
              name="location"
              control={control}
              render={({ field }) => (
                <LocationSelector
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={!!errors.location}
                  helperText={errors.location?.message}
                />
              )}
            />
          </Stack>
        )}

        {current === "Links" && (
          <Stack spacing={2}>
            {connections.fields.map((connection, index) => (
              <Paper key={connection.fieldKey} variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={2}>
                  <Controller
                    control={control}
                    name={`connections.${index}.type`}
                    render={({ field }) => (
                      <Stack spacing={1}>
                        <TextField {...field} select label="Link type">
                          {Object.entries(connectionLabels).map(
                            ([type, label]) => (
                              <MenuItem key={type} value={type}>
                                {label}
                              </MenuItem>
                            ),
                          )}
                        </TextField>
                        <LinkGuidance type={field.value ?? "other"} />
                      </Stack>
                    )}
                  />
                  <TextField
                    label={`Public link ${index + 1}`}
                    {...register(`connections.${index}.url`, {
                      onChange: (event) => {
                        const detected = classifyConnection(event.target.value);
                        const selected = getValues(`connections.${index}.type`);
                        if (selected === "website" || detected !== "website")
                          setValue(`connections.${index}.type`, detected, {
                            shouldDirty: true,
                          });
                      },
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
                    autoFocus={index === connections.fields.length - 1}
                  />
                  <TextField
                    label="Label (optional)"
                    {...register(`connections.${index}.label`)}
                    helperText="For example: Main chat or Public contact page."
                  />
                  <Button
                    type="button"
                    startIcon={<DeleteOutline />}
                    onClick={() => connections.remove(index)}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    Remove link
                  </Button>
                </Stack>
              </Paper>
            ))}
            {errors.connections?.root?.message && (
              <Alert severity="error">{errors.connections.root.message}</Alert>
            )}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="h3">
                    {connections.fields.length
                      ? "Add another link"
                      : "Do you have a public link?"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Start by choosing the link type. For a Signal group, choose
                    Signal, then paste the group link from Signal.
                  </Typography>
                </Box>
                <TextField
                  select
                  label="What kind of link?"
                  value={newConnectionType}
                  onChange={(event) =>
                    setNewConnectionType(event.target.value as ConnectionType)
                  }
                >
                  {Object.entries(connectionLabels).map(([type, label]) => (
                    <MenuItem key={type} value={type}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
                <LinkGuidance type={newConnectionType} />
                <Button
                  type="button"
                  startIcon={<AddLinkOutlined />}
                  onClick={addConnection}
                  sx={{ alignSelf: "flex-start" }}
                >
                  Add a public link
                </Button>
              </Stack>
            </Paper>
            {detectedConnections.length > 0 && (
              <Alert severity="info">
                Detected from your links: {detectedConnections.join(", ")}.
                These platform labels are automatic and cannot be selected as
                ordinary topics.
              </Alert>
            )}
          </Stack>
        )}

        {current === "Participation" && (
          <Stack spacing={2}>
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
                This listing and its invitation instructions are public. The
                lock describes access to the group, not privacy on this website.
                Prefer a group-managed request form or public contact page added
                under Connections. Do not enter private invite links or
                someone’s name, email or phone without their permission. Changes
                are retained in revision history.
              </Alert>
            )}
            <TextField
              label={
                invitationOnly
                  ? "How to request an invitation (public)"
                  : "How to participate (optional)"
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
                  value={field.value ?? []}
                  onChange={(_, value) => field.onChange(value)}
                  onBlur={field.onBlur}
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
                  renderInput={(props) => (
                    <TextField
                      {...props}
                      label="Topics or descriptors (optional)"
                      error={!!errors.tags}
                      helperText={
                        errors.tags?.message ??
                        "Choose existing topics. The selected directory descriptor can be removed here."
                      }
                    />
                  )}
                />
              )}
            />
            <TagSuggestionDialog listingName={values.name} />
            {hasPublicContact && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="h3">Public contact details</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Optional. Only include contact details intended for public
                      use. Do not add personal phone numbers or home addresses.
                    </Typography>
                  </Box>
                  <TextField
                    label="Public phone (optional)"
                    {...register("publicPhone")}
                    error={!!errors.publicPhone}
                    helperText={errors.publicPhone?.message}
                  />
                  <TextField
                    label="Public email (optional)"
                    {...register("publicEmail")}
                    error={!!errors.publicEmail}
                    helperText={errors.publicEmail?.message}
                  />
                  <TextField
                    label="Public address (optional)"
                    {...register("publicAddress")}
                    error={!!errors.publicAddress}
                    helperText={errors.publicAddress?.message}
                  />
                  <TextField
                    label="Opening hours (optional)"
                    multiline
                    {...register("openingHours")}
                    error={!!errors.openingHours}
                    helperText={errors.openingHours?.message}
                  />
                </Stack>
              </Paper>
            )}
          </Stack>
        )}

        {current === "Review" && (
          <Stack spacing={2}>
            <Alert severity="warning">
              This information will be public. Account ownership stays private.
              Anonymous submissions cannot be edited later.
            </Alert>
            <ReviewItem
              label="Entry type"
              value={selectedFocus?.title ?? "Entry"}
            />
            <ReviewItem
              label="Status"
              value={
                isProposed
                  ? organizer === "no"
                    ? "Idea seeking an organizer"
                    : "Idea with an organizer"
                  : "Existing entry"
              }
            />
            <ReviewItem label="Name" value={values.name || "Not provided"} />
            <ReviewItem
              label="Purpose"
              value={values.summary || "Not provided"}
            />
            <ReviewItem
              label="Location"
              value={values.location || "Not provided"}
            />
            <ReviewItem
              label="Links"
              value={
                (values.connections ?? []).filter(
                  (connection) => connection?.url,
                ).length
                  ? (values.connections ?? [])
                      .filter((connection) => connection?.url)
                      .map((connection) => connection?.url)
                      .join(", ")
                  : "Not provided"
              }
            />
            <ReviewItem
              label="Topics"
              value={
                values.tags?.length ? values.tags.join(", ") : "None selected"
              }
            />
            <Divider />
            <Typography variant="body2" color="text.secondary">
              You can edit the entry later if you are signed in. If you are
              submitting anonymously, save the public link after publishing;
              creating an account later will not automatically claim it.
            </Typography>
          </Stack>
        )}

        {choiceError && <Alert severity="error">{choiceError}</Alert>}
        {error && <Alert severity="error">{error.message}</Alert>}
        <Stack
          direction="row"
          spacing={1}
          sx={{ justifyContent: "space-between" }}
        >
          <Button type="button" onClick={back} disabled={step === 0 || pending}>
            Back
          </Button>
          {current === "Review" ? (
            <Button
              type="submit"
              variant="contained"
              disabled={pending || disabled}
            >
              {pending ? "Publishing…" : "Publish entry"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="contained"
              onClick={(event) => {
                event.preventDefault();
                void next();
              }}
              disabled={pending || disabled}
            >
              Continue
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

function LinkGuidance({ type }: { type: ConnectionType }) {
  if (type === "signal")
    return (
      <Alert severity="info">
        <strong>Signal group:</strong> If you are starting one, create a new
        group in Signal first. Then open the group, tap its name, choose{" "}
        <em>Group Link</em>, turn it on, and choose <em>Share</em>. You can
        require admin approval for new members.{" "}
        <MuiLink
          href="https://support.signal.org/hc/en-us/articles/360007319331-Group-chats"
          target="_blank"
          rel="noreferrer"
        >
          How to start a Signal group
        </MuiLink>{" "}
        ·{" "}
        <MuiLink
          href="https://support.signal.org/hc/en-us/articles/360051086971-Group-Link-or-QR-code"
          target="_blank"
          rel="noreferrer"
        >
          How to create the group link
        </MuiLink>
      </Alert>
    );
  const guidance: Partial<Record<ConnectionType, string>> = {
    website:
      "Use a public homepage, information page, signup form, or calendar.",
    telegram:
      "Use the public Telegram group or channel link people should open.",
    discord: "Use the public Discord invite link people should use to join.",
    facebook: "Use the public Facebook page or group link.",
    instagram: "Use the public Instagram profile link.",
    youtube: "Use the public YouTube channel or video link.",
    x: "Use the public profile or conversation link.",
    nostr: "Use the public Nostr profile or community link.",
    other: "Use another public link that helps people find or join it.",
  };
  return (
    <Typography variant="body2" color="text.secondary">
      {guidance[type] ?? "Use a public link that helps people find or join it."}
    </Typography>
  );
}

function Choice({
  value,
  selected,
  title,
  description,
}: {
  value: string;
  selected: boolean;
  title: string;
  description: string;
}) {
  return (
    <FormControlLabel
      value={value}
      control={<Radio />}
      sx={{
        alignItems: "flex-start",
        border: "1px solid",
        borderColor: selected ? "primary.main" : "divider",
        borderRadius: 1,
        m: 0,
        mb: 1.5,
        p: 1.5,
        width: "100%",
      }}
      label={
        <Stack>
          <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
          <Typography variant="body2">{description}</Typography>
        </Stack>
      }
    />
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ overflowWrap: "anywhere" }}>{value}</Typography>
    </Box>
  );
}
