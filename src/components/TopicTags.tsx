import { Box, Chip, IconButton, Stack, Tooltip } from "@mui/material";
import HomeOutlined from "@mui/icons-material/HomeOutlined";
import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import HistoryEduOutlined from "@mui/icons-material/HistoryEduOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import HandshakeOutlined from "@mui/icons-material/HandshakeOutlined";
import StorefrontOutlined from "@mui/icons-material/StorefrontOutlined";
import WorkOutline from "@mui/icons-material/WorkOutlined";
import BuildOutlined from "@mui/icons-material/BuildOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import SwapHorizOutlined from "@mui/icons-material/SwapHorizOutlined";
import MovingOutlined from "@mui/icons-material/MovingOutlined";
import PersonAddAltOutlined from "@mui/icons-material/PersonAddAltOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import HowToVoteOutlined from "@mui/icons-material/HowToVoteOutlined";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import PsychologyOutlined from "@mui/icons-material/PsychologyOutlined";
import ForumOutlined from "@mui/icons-material/ForumOutlined";
import BalanceOutlined from "@mui/icons-material/BalanceOutlined";
import FamilyRestroomOutlined from "@mui/icons-material/FamilyRestroomOutlined";
import PaletteOutlined from "@mui/icons-material/PaletteOutlined";
import ParkOutlined from "@mui/icons-material/ParkOutlined";
import RestaurantOutlined from "@mui/icons-material/RestaurantOutlined";
import SportsBasketballOutlined from "@mui/icons-material/SportsBasketballOutlined";
import HealthAndSafetyOutlined from "@mui/icons-material/HealthAndSafetyOutlined";
import Diversity2Outlined from "@mui/icons-material/Diversity2Outlined";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import SailingOutlined from "@mui/icons-material/SailingOutlined";
import ComputerOutlined from "@mui/icons-material/ComputerOutlined";
import PodcastsOutlined from "@mui/icons-material/PodcastsOutlined";
import LanguageOutlined from "@mui/icons-material/LanguageOutlined";
import ChatBubbleOutline from "@mui/icons-material/ChatBubbleOutlined";
import ConnectWithoutContactOutlined from "@mui/icons-material/ConnectWithoutContactOutlined";
import VideocamOutlined from "@mui/icons-material/VideocamOutlined";
import LocalOfferOutlined from "@mui/icons-material/LocalOfferOutlined";
import { Link as RouterLink } from "react-router";
import { tagIconKey } from "../../shared/tag-icons";
import type { TagIconKey } from "../../shared/tag-icons";
import { useQuery } from "@tanstack/react-query";
import { queries } from "../lib/api";

const icons = {
  home: HomeOutlined,
  book: MenuBookOutlined,
  history: HistoryEduOutlined,
  people: GroupsOutlined,
  place: PlaceOutlined,
  meeting: HandshakeOutlined,
  business: StorefrontOutlined,
  work: WorkOutline,
  tools: BuildOutlined,
  money: AccountBalanceWalletOutlined,
  exchange: SwapHorizOutlined,
  migration: MovingOutlined,
  invitation: PersonAddAltOutlined,
  calendar: EventOutlined,
  ballot: HowToVoteOutlined,
  organization: AccountBalanceOutlined,
  thought: PsychologyOutlined,
  discussion: ForumOutlined,
  justice: BalanceOutlined,
  family: FamilyRestroomOutlined,
  art: PaletteOutlined,
  nature: ParkOutlined,
  food: RestaurantOutlined,
  sports: SportsBasketballOutlined,
  health: HealthAndSafetyOutlined,
  belief: Diversity2Outlined,
  safety: ShieldOutlined,
  boat: SailingOutlined,
  tech: ComputerOutlined,
  media: PodcastsOutlined,
  web: LanguageOutlined,
  chat: ChatBubbleOutline,
  social: ConnectWithoutContactOutlined,
  video: VideocamOutlined,
  tag: LocalOfferOutlined,
} satisfies Record<TagIconKey, typeof HomeOutlined>;

export function TagIcon({ name }: { name: string }) {
  const catalog = useQuery(queries.tags);
  const normalized = name.trim().toLowerCase();
  const definition = catalog.data?.items.find((tag) =>
    [tag.name, ...tag.aliases].some(
      (label) => label.toLowerCase() === normalized,
    ),
  );
  const iconKey = definition?.icon ?? tagIconKey(name);
  const Icon = icons[iconKey];
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
              to={"/directory?tag=" + encodeURIComponent(tag)}
              aria-label={"Filter by topic: " + tag}
              sx={{
                width: 44,
                height: 44,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
                color: "text.secondary",
              }}
            >
              <TagIcon name={tag} />
            </IconButton>
          </Tooltip>
        ) : (
          <Chip
            key={tag}
            icon={<TagIcon name={tag} />}
            label={tag}
            component={RouterLink}
            to={"/directory?tag=" + encodeURIComponent(tag)}
            clickable
            sx={{
              maxWidth: "100%",
              minHeight: 44,
              pl: 1.25,
              "& .MuiChip-icon": { ml: 0, mr: 0 },
              "& .MuiChip-label": { pl: 1, pr: 1.5 },
            }}
          />
        ),
      )}
    </Stack>
  );
}
