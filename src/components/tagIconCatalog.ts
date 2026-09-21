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
import type { TagIconKey } from "../../shared/tag-icons";

export const tagIconComponents = {
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

export const tagIconSearchTerms: Partial<Record<TagIconKey, string>> = {
  home: "house housing",
  book: "learning education school",
  people: "group community people social",
  place: "location local area",
  meeting: "gathering meetup event",
  business: "company service shop organization",
  work: "job employment career",
  tools: "skills building infrastructure",
  money: "finance funding wallet assets",
  exchange: "trade trading barter swap",
  migration: "moving migration relocation",
  invitation: "invite membership recruitment",
  calendar: "calendar events organizing",
  ballot: "politics voting activism civic",
  organization: "nonprofit institution organization",
  thought: "thinking philosophy ideas",
  discussion: "discussion forum conversation",
  justice: "justice law legal",
  family: "family children parenting",
  art: "arts creative culture",
  nature: "nature outdoors animals environment",
  food: "food drink farming cooking",
  sports: "sports games fitness",
  health: "health wellness medical",
  belief: "belief religion faith",
  safety: "safety security protection",
  boat: "boat water sailing",
  tech: "technology computer software",
  media: "media podcast audio",
  web: "website internet browser",
  chat: "chat messaging signal telegram discord slack",
  social: "social network connection",
  video: "video youtube film",
  tag: "tag topic label other",
};
