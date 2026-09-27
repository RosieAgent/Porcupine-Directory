import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIosNew from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIos from "@mui/icons-material/ArrowForwardIos";
import DeleteOutline from "@mui/icons-material/DeleteOutlined";
import HelpOutline from "@mui/icons-material/HelpOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import Star from "@mui/icons-material/Star";
import { z } from "zod";
import type { EntryImage } from "../../shared/contracts";
import { entryImageSchema } from "../../shared/contracts";
import { mutate, uploadImage } from "../lib/api";
import { imageAltFromFile, prepareImage } from "../lib/images";

const imageResponse = entryImageSchema;

export function ImageCommunityUseNotice() {
  return (
    <Alert severity="info">
      Images uploaded here become part of this entry and are available for
      Porcupine Directory to display when the entry is published; this is not
      private image storage. By uploading an image, you confirm that you have
      permission to share it. Please use appropriate images only: do not upload
      adult or sexually explicit images, or pictures of identifiable people
      without their consent. Selecting “Use as a community card image” lets us
      feature that one image on listing cards and as the featured image on the
      entry details page.
    </Alert>
  );
}

function CommunityCardLabel() {
  return (
    <Box
      component="span"
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
    >
      Use as a community card image
      <Tooltip title="Only one image per entry can be selected. This image appears on listing cards and is featured first on the entry details page.">
        <Box
          component="span"
          tabIndex={0}
          aria-label="What does use as a community card image mean?"
          sx={{ display: "inline-flex", alignItems: "center" }}
        >
          <HelpOutline fontSize="small" />
        </Box>
      </Tooltip>
    </Box>
  );
}

export function EntryImageGallery({
  images,
  title,
}: {
  images: EntryImage[];
  title: string;
}) {
  const [active, setActive] = useState(
    Math.max(
      0,
      images.findIndex((image) => image.isLead),
    ),
  );
  if (!images.length) return null;
  const safeActive = Math.min(active, images.length - 1);
  const image = images[safeActive];
  const move = (direction: -1 | 1) =>
    setActive(
      (current) => (current + direction + images.length) % images.length,
    );
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 } }}>
      <Stack spacing={1.5}>
        <Typography variant="h2">Entry images</Typography>
        <Box
          sx={{
            position: "relative",
            display: "flex",
            minHeight: { xs: 220, sm: 360 },
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            borderRadius: 1,
            bgcolor: "grey.100",
          }}
        >
          <Box
            component="img"
            src={image.url}
            alt={image.altText || `${title} community image`}
            sx={{ maxWidth: "100%", maxHeight: 460, objectFit: "contain" }}
          />
          {images.length > 1 && (
            <>
              <IconButton
                aria-label="Previous entry image"
                onClick={() => move(-1)}
                sx={{
                  position: "absolute",
                  left: 8,
                  bgcolor: "background.paper",
                }}
              >
                <ArrowBackIosNew fontSize="small" />
              </IconButton>
              <IconButton
                aria-label="Next entry image"
                onClick={() => move(1)}
                sx={{
                  position: "absolute",
                  right: 8,
                  bgcolor: "background.paper",
                }}
              >
                <ArrowForwardIos fontSize="small" />
              </IconButton>
            </>
          )}
        </Box>
        <Stack
          direction="row"
          spacing={1}
          sx={{ overflowX: "auto", pb: 0.5 }}
          aria-label="Entry image thumbnails"
        >
          {images.map((item, index) => (
            <Box
              key={item.id}
              component="button"
              type="button"
              aria-label={`Show entry image ${index + 1}${item.isLead ? ", community card image" : ""}`}
              aria-pressed={index === safeActive}
              onClick={() => setActive(index)}
              sx={{
                position: "relative",
                flex: "0 0 auto",
                p: 0,
                width: 64,
                height: 64,
                border: "2px solid",
                borderColor: index === safeActive ? "primary.main" : "divider",
                borderRadius: 1,
                overflow: "hidden",
                bgcolor: "background.paper",
                cursor: "pointer",
              }}
            >
              <Box
                component="img"
                src={item.url}
                alt=""
                sx={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              {item.isLead && (
                <Star
                  aria-label="Community card image"
                  sx={{
                    position: "absolute",
                    right: 3,
                    bottom: 3,
                    color: "warning.main",
                    filter: "drop-shadow(0 0 2px white)",
                  }}
                />
              )}
            </Box>
          ))}
        </Stack>
        {image.caption && (
          <Typography color="text.secondary">{image.caption}</Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          {safeActive + 1} of {images.length}
        </Typography>
      </Stack>
    </Paper>
  );
}

export function CardImage({ image, alt }: { image?: EntryImage; alt: string }) {
  if (!image) return null;
  return (
    <Box
      component="img"
      src={image.url}
      alt={image.altText || alt}
      sx={{
        width: "100%",
        height: 150,
        objectFit: "cover",
        borderRadius: 1,
        mb: 1.5,
      }}
    />
  );
}

export type PendingImage = {
  id: string;
  file: File;
  preview: string;
  altText: string;
  caption: string;
  shareable: boolean;
};

export type ListingImagesEditorHandle = {
  saveChanges: (reason: string) => Promise<void>;
};

type SavedImageDraft = {
  altText: string;
  caption: string;
  shareable: boolean;
};

type ListingImagesEditorProps = {
  listingId: string;
  images: EntryImage[];
  onDirtyChange?: (dirty: boolean) => void;
};

export const ListingImagesEditor = forwardRef<
  ListingImagesEditorHandle,
  ListingImagesEditorProps
>(function ListingImagesEditor({ listingId, images, onDirtyChange }, ref) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [savedDrafts, setSavedDrafts] = useState<
    Record<string, SavedImageDraft>
  >({});
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeImageId, setActiveImageId] = useState<string | null>(
    () => images.find((image) => image.isLead)?.id ?? images[0]?.id ?? null,
  );
  const pendingRef = useRef(pending);

  function originalDraft(image: EntryImage): SavedImageDraft {
    return {
      altText: image.altText,
      caption: image.caption,
      shareable: image.shareable,
    };
  }

  function draftFor(image: EntryImage): SavedImageDraft {
    return savedDrafts[image.id] ?? originalDraft(image);
  }

  function sameDraft(left: SavedImageDraft, right: SavedImageDraft) {
    return (
      left.altText === right.altText &&
      left.caption === right.caption &&
      left.shareable === right.shareable
    );
  }

  const dirty =
    pending.length > 0 ||
    Object.keys(savedDrafts).length > 0 ||
    removedImageIds.length > 0;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const carouselItems = [
    ...images
      .filter((image) => !removedImageIds.includes(image.id))
      .map((image) => ({
        id: image.id,
        url: image.url,
        altText: image.altText,
        kind: "saved" as const,
        image,
      })),
    ...pending.map((image) => ({
      id: image.id,
      url: image.preview,
      altText: image.altText,
      kind: "pending" as const,
      image,
    })),
  ];
  const activeIndex = Math.max(
    0,
    carouselItems.findIndex((item) => item.id === activeImageId),
  );
  const activeItem = carouselItems[activeIndex];

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    return () =>
      pendingRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
  }, []);

  function chooseFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    const remaining = Math.max(0, 12 - images.length - pending.length);
    const chosen = Array.from(files)
      .slice(0, remaining)
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        altText: imageAltFromFile(file),
        caption: "",
        shareable: false,
      }));
    setPending((current) => [...current, ...chosen]);
    if (chosen.length) setActiveImageId(chosen[chosen.length - 1].id);
    if (files.length > remaining)
      setError("An entry can have up to 12 active images.");
  }

  function updateSavedImage(
    image: EntryImage,
    changes: Partial<SavedImageDraft>,
  ) {
    setSavedDrafts((current) => {
      const nextDraft = {
        ...(current[image.id] ?? originalDraft(image)),
        ...changes,
      };
      const next = { ...current };
      if (sameDraft(nextDraft, originalDraft(image))) delete next[image.id];
      else next[image.id] = nextDraft;
      return next;
    });
  }

  function setCommunityCard(imageId: string, selected: boolean) {
    setSavedDrafts((current) => {
      const next = { ...current };
      for (const image of images) {
        const base = originalDraft(image);
        const draft = { ...(current[image.id] ?? base) };
        if (selected) draft.shareable = image.id === imageId;
        else if (image.id === imageId) draft.shareable = false;
        if (sameDraft(draft, base)) delete next[image.id];
        else next[image.id] = draft;
      }
      return next;
    });
    setPending((current) =>
      current.map((image) => ({
        ...image,
        shareable: selected
          ? image.id === imageId
          : image.id === imageId
            ? false
            : image.shareable,
      })),
    );
  }

  function updatePendingImage(
    image: PendingImage,
    changes: Partial<PendingImage>,
  ) {
    if (changes.shareable) {
      setCommunityCard(image.id, true);
      return;
    }
    setPending((current) =>
      current.map((item) =>
        item.id === image.id ? { ...item, ...changes } : item,
      ),
    );
  }

  function removeSavedImage(image: EntryImage) {
    if (
      !window.confirm(
        "Remove this image from the entry when you save these changes?",
      )
    )
      return;
    setRemovedImageIds((current) =>
      current.includes(image.id) ? current : [...current, image.id],
    );
    setSavedDrafts((current) => {
      const next = { ...current };
      delete next[image.id];
      return next;
    });
  }

  async function saveChanges(reason: string) {
    if (!dirty) return;
    setBusy(true);
    setError(null);
    try {
      const changedSavedImages = images.filter(
        (image) => savedDrafts[image.id] && !removedImageIds.includes(image.id),
      );
      for (const image of changedSavedImages.filter(
        (item) => !savedDrafts[item.id].shareable,
      )) {
        const draft = savedDrafts[image.id];
        await mutate(
          `/listings/${listingId}/images/${image.id}`,
          imageResponse,
          { ...draft, reason },
          "PATCH",
        );
      }
      for (const image of changedSavedImages.filter(
        (item) => savedDrafts[item.id].shareable,
      )) {
        const draft = savedDrafts[image.id];
        await mutate(
          `/listings/${listingId}/images/${image.id}`,
          imageResponse,
          { ...draft, reason },
          "PATCH",
        );
      }
      for (const imageId of removedImageIds) {
        await mutate(
          `/listings/${listingId}/images/${imageId}`,
          z.object({ ok: z.literal(true) }),
          { reason },
          "DELETE",
        );
      }
      for (const item of pending) {
        const prepared = await prepareImage(item.file);
        await uploadImage(
          `/listings/${listingId}/images`,
          prepared,
          {
            altText: item.altText,
            caption: item.caption,
            shareable: item.shareable,
            reason,
          },
          imageResponse,
        );
        URL.revokeObjectURL(item.preview);
        setPending((current) =>
          current.filter((pendingItem) => pendingItem.id !== item.id),
        );
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Image upload failed.",
      );
      throw uploadError;
    } finally {
      setBusy(false);
    }
  }

  useImperativeHandle(ref, () => ({ saveChanges }));

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="body2" color="text.secondary">
          Images are part of this entry and appear in its gallery when the entry
          is published. Select “Use as a community card image” only when you
          want to choose the one image used on listing cards and featured first
          on the entry details page. Images are resized in your browser before
          upload.
        </Typography>
        <ImageCommunityUseNotice />
        <Typography variant="body2" color="text.secondary">
          Choose images here, then select “Save changes” at the bottom of the
          page to add them with the rest of your edits.
        </Typography>
      </Box>
      {activeItem && (
        <>
          <Box
            sx={{
              position: "relative",
              display: "flex",
              minHeight: { xs: 220, sm: 360 },
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              borderRadius: 1,
              bgcolor: "grey.100",
            }}
          >
            <Box
              component="img"
              src={activeItem.url}
              alt={activeItem.altText || "Entry image"}
              sx={{ maxWidth: "100%", maxHeight: 460, objectFit: "contain" }}
            />
            {carouselItems.length > 1 && (
              <>
                <IconButton
                  aria-label="Previous entry image"
                  onClick={() =>
                    setActiveImageId(
                      carouselItems[
                        (activeIndex - 1 + carouselItems.length) %
                          carouselItems.length
                      ].id,
                    )
                  }
                  sx={{
                    position: "absolute",
                    left: 8,
                    bgcolor: "background.paper",
                  }}
                >
                  <ArrowBackIosNew fontSize="small" />
                </IconButton>
                <IconButton
                  aria-label="Next entry image"
                  onClick={() =>
                    setActiveImageId(
                      carouselItems[(activeIndex + 1) % carouselItems.length]
                        .id,
                    )
                  }
                  sx={{
                    position: "absolute",
                    right: 8,
                    bgcolor: "background.paper",
                  }}
                >
                  <ArrowForwardIos fontSize="small" />
                </IconButton>
              </>
            )}
          </Box>
          <Stack
            direction="row"
            spacing={1}
            sx={{ overflowX: "auto", pb: 0.5 }}
            aria-label="Entry image thumbnails"
          >
            {carouselItems.map((item, index) => {
              const isCommunityCard =
                item.kind === "saved"
                  ? draftFor(item.image).shareable
                  : item.image.shareable;
              return (
                <Box
                  key={item.id}
                  component="button"
                  type="button"
                  aria-label={`Show entry image ${index + 1}${isCommunityCard ? ", community card image" : ""}`}
                  aria-pressed={index === activeIndex}
                  onClick={() => setActiveImageId(item.id)}
                  sx={{
                    position: "relative",
                    flex: "0 0 auto",
                    p: 0,
                    width: 72,
                    height: 72,
                    border: "2px solid",
                    borderColor:
                      index === activeIndex ? "primary.main" : "divider",
                    borderRadius: 1,
                    overflow: "hidden",
                    bgcolor: "background.paper",
                    cursor: "pointer",
                  }}
                >
                  <Box
                    component="img"
                    src={item.url}
                    alt=""
                    sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  {isCommunityCard && (
                    <Star
                      aria-label="Community card image"
                      sx={{
                        position: "absolute",
                        right: 3,
                        bottom: 3,
                        color: "warning.main",
                        filter: "drop-shadow(0 0 2px white)",
                      }}
                    />
                  )}
                </Box>
              );
            })}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {activeIndex + 1} of {carouselItems.length}
          </Typography>
          {activeItem.kind === "saved" ? (
            <SavedImage
              key={activeItem.id}
              image={activeItem.image}
              value={draftFor(activeItem.image)}
              busy={busy}
              onChange={(changes) =>
                updateSavedImage(activeItem.image, changes)
              }
              onCommunityCardChange={(selected) =>
                setCommunityCard(activeItem.image.id, selected)
              }
              onRemove={() => removeSavedImage(activeItem.image)}
              showPreview={false}
            />
          ) : (
            <PendingImageCard
              key={activeItem.id}
              image={activeItem.image}
              showPreview={false}
              onChange={(changes) =>
                updatePendingImage(activeItem.image, changes)
              }
              onRemove={() => {
                URL.revokeObjectURL(activeItem.image.preview);
                setPending((current) =>
                  current.filter((item) => item.id !== activeItem.id),
                );
              }}
            />
          )}
        </>
      )}
      <input
        ref={input}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(event) => {
          chooseFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Button
          variant="outlined"
          startIcon={<ImageOutlined />}
          disabled={
            images.length - removedImageIds.length + pending.length >= 12 ||
            busy
          }
          onClick={() => input.current?.click()}
        >
          Choose images
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
});

export function PendingImageCard({
  image,
  onChange,
  onRemove,
  showPreview = true,
}: {
  image: PendingImage;
  onChange: (changes: Partial<PendingImage>) => void;
  onRemove: () => void;
  showPreview?: boolean;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack
        direction={showPreview ? { xs: "column", sm: "row" } : "column"}
        spacing={2}
      >
        {showPreview && (
          <Box
            component="img"
            src={image.preview}
            alt=""
            sx={{
              width: { xs: "100%", sm: 150 },
              height: 120,
              objectFit: "cover",
              borderRadius: 1,
            }}
          />
        )}
        <Stack spacing={1} sx={{ flex: 1 }}>
          <TextField
            label="Image description"
            value={image.altText}
            onChange={(event) => onChange({ altText: event.target.value })}
            helperText="Describe what the image shows. Required for a community card image."
          />
          <TextField
            label="Caption (optional)"
            value={image.caption}
            onChange={(event) => onChange({ caption: event.target.value })}
          />
          <Stack direction={{ xs: "column", sm: "row" }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={image.shareable}
                  onChange={(_, value) => onChange({ shareable: value })}
                />
              }
              label={<CommunityCardLabel />}
            />
          </Stack>
          <Button
            color="error"
            startIcon={<DeleteOutline />}
            onClick={onRemove}
            sx={{ alignSelf: "flex-start" }}
          >
            Remove before upload
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

export function ImageDraftPicker({
  images,
  onChange,
}: {
  images: PendingImage[];
  onChange: (images: PendingImage[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  function chooseFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    const remaining = Math.max(0, 12 - images.length);
    const chosen = Array.from(files)
      .slice(0, remaining)
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        altText: imageAltFromFile(file),
        caption: "",
        shareable: false,
      }));
    onChange([...images, ...chosen]);
    if (files.length > remaining)
      setError("An entry can have up to 12 active images.");
  }
  return (
    <Stack spacing={2}>
      <Typography variant="h3">Entry images (optional)</Typography>
      <Typography variant="body2" color="text.secondary">
        Add images to this entry if you are signed in. Select “Use as a
        community card image” only when you give Porcupine Directory permission
        to use the image on listing cards and as the featured image on the entry
        details page.
      </Typography>
      <ImageCommunityUseNotice />
      {images.map((image) => (
        <PendingImageCard
          key={image.id}
          image={image}
          onChange={(changes) =>
            onChange(
              images.map((item) =>
                item.id === image.id
                  ? { ...item, ...changes }
                  : changes.shareable
                    ? { ...item, shareable: false }
                    : item,
              ),
            )
          }
          onRemove={() => {
            URL.revokeObjectURL(image.preview);
            onChange(images.filter((item) => item.id !== image.id));
          }}
        />
      ))}
      <input
        ref={input}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(event) => {
          chooseFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <Button
        variant="outlined"
        startIcon={<ImageOutlined />}
        disabled={images.length >= 12}
        onClick={() => input.current?.click()}
        sx={{ alignSelf: "flex-start" }}
      >
        Choose images
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

function SavedImage({
  image,
  busy,
  value,
  onChange,
  onCommunityCardChange,
  onRemove,
  showPreview = true,
}: {
  image: EntryImage;
  busy: boolean;
  value: SavedImageDraft;
  onChange: (changes: Partial<SavedImageDraft>) => void;
  onCommunityCardChange: (selected: boolean) => void;
  onRemove: () => void;
  showPreview?: boolean;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack
        direction={showPreview ? { xs: "column", sm: "row" } : "column"}
        spacing={2}
      >
        {showPreview && (
          <Box
            component="img"
            src={image.url}
            alt={image.altText || "Saved entry image"}
            sx={{
              width: { xs: "100%", sm: 150 },
              height: 120,
              objectFit: "cover",
              borderRadius: 1,
            }}
          />
        )}
        <Stack spacing={1} sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {value.shareable ? "Community card image" : "Entry image"}
          </Typography>
          <TextField
            label="Image description"
            value={value.altText}
            onChange={(event) => onChange({ altText: event.target.value })}
          />
          <TextField
            label="Caption (optional)"
            value={value.caption}
            onChange={(event) => onChange({ caption: event.target.value })}
          />
          <Stack direction={{ xs: "column", sm: "row" }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={value.shareable}
                  disabled={busy}
                  onChange={(_, selected) => onCommunityCardChange(selected)}
                />
              }
              label={<CommunityCardLabel />}
            />
          </Stack>
          <Button
            color="error"
            startIcon={<DeleteOutline />}
            disabled={busy}
            onClick={onRemove}
            sx={{ alignSelf: "flex-start" }}
          >
            Remove image
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
