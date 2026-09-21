import { Box, Chip, IconButton, Stack, Tooltip } from "@mui/material";
import { Link as RouterLink } from "react-router";
import { tagIconKey } from "../../shared/tag-icons";
import { useQuery } from "@tanstack/react-query";
import { queries } from "../lib/api";
import { tagIconComponents } from "./tagIconCatalog";

export function TagIcon({ name }: { name: string }) {
  const catalog = useQuery(queries.tags);
  const normalized = name.trim().toLowerCase();
  const definition = catalog.data?.items.find((tag) =>
    [tag.name, ...tag.aliases].some(
      (label) => label.toLowerCase() === normalized,
    ),
  );
  const iconKey = definition?.icon ?? tagIconKey(name);
  const Icon = tagIconComponents[iconKey];
  return <Icon fontSize="small" data-tag-icon={iconKey} />;
}

// Named presentation for search options; symbols alone cannot teach their meaning.
export function TagLabel({ name }: { name: string }) {
  return (
    <Box
      component="span"
      sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}
    >
      <TagIcon name={name} />
      {name}
    </Box>
  );
}

export function TopicTags({
  tags,
  compact = false,
}: {
  tags: string[];
  compact?: boolean;
}) {
  if (!tags.length) return null;
  return (
    <Stack
      direction="row"
      useFlexGap
      role="group"
      aria-label="Topics"
      sx={{ flexWrap: "wrap", gap: compact ? 0.5 : 1, minWidth: 0 }}
    >
      {/* Show every tag; wrap instead of silently dropping overflow topics. */}
      {tags.map((tag) =>
        compact ? (
          <Tooltip key={tag} title={tag} describeChild enterTouchDelay={350}>
            <IconButton
              component={RouterLink}
              to={"/?tag=" + encodeURIComponent(tag)}
              aria-label={"Filter by topic: " + tag}
              sx={{
                width: 24,
                height: 24,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                color: "text.secondary",
                p: 0,
              }}
            >
              <TagIcon name={tag} />
            </IconButton>
          </Tooltip>
        ) : (
          <Chip
            key={tag}
            size="small"
            icon={<TagIcon name={tag} />}
            label={tag}
            component={RouterLink}
            to={"/?tag=" + encodeURIComponent(tag)}
            clickable
            sx={{
              maxWidth: "100%",
              minHeight: 24,
              pl: 0.5,
              "& .MuiChip-icon": { ml: 0, mr: 0 },
              "& .MuiChip-label": { pl: 0.5, pr: 0.75 },
            }}
          />
        ),
      )}
    </Stack>
  );
}
