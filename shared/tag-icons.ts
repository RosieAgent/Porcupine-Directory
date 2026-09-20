// Presentation-only mapping: legacy names and shared filter URLs remain unchanged.
// Unknown/imported tags get a neutral fallback, never an external image URL.
const definitions = {
  home: ["Housing", "Clubhouses", "IRL - Quill"],
  book: ["Learning", "Learning (Adult)"],
  history: ["History"],
  people: ["Social Groups", "Socializing", "Community Groups", "Fan Clubs"],
  place: [
    "Regional Groups",
    "Manchester",
    "20 Old Granite St",
    "Homeland Segment",
  ],
  meeting: ["IRL", "InPerson", "in person", "Volunteer"],
  business: ["Business", "Businesses/Services", "Services"],
  work: ["Jobs"],
  tools: ["Skills", "Infrastructure", "Homeland Improvements"],
  money: ["Assets", "Money"],
  exchange: ["Trading"],
  migration: ["Migration", "Accelerating Migration"],
  invitation: ["Recruitment", "Membership"],
  calendar: ["Organizing Events", "Event Communication"],
  ballot: [
    "Politics",
    "Activism",
    "Single Issue",
    "Political Activism",
    "Political - Single Issue",
  ],
  organization: [
    "Political Organizations",
    "Free State Project Inc Teams",
    "local and state teams",
  ],
  thought: ["Thinking", "Political Philosophy"],
  discussion: ["Discourse"],
  justice: ["Justice"],
  family: ["Children/Parenting"],
  art: ["Arts"],
  nature: ["Outdoors", "Hobbies/Gardening", "Farming"],
  food: ["Food, Farming, & Drink Discussion", "Food/Drink"],
  sports: ["Games/Sports"],
  health: ["Self-Improvement/Health"],
  belief: ["Religion"],
  safety: ["Guns (Shooting/2A)"],
  boat: ["Shipboard"],
  tech: ["Tech"],
  media: ["Blogs/vLogs/Podcasts", "Spotify"],
  web: ["Internet", "Web", "Website", "website"],
  chat: [
    "Signal",
    "Telegram",
    "Discord",
    "Slack",
    "Telegram @BarterTowne",
    "Telegram @ManchPorcs",
    "Telegram @ShireSociety",
  ],
  social: [
    "FB",
    "Facebook",
    "X",
    "Both on facebook and Telegram more updates on Facebook",
  ],
  video: ["YouTube", "Zoom"],
  tag: ["Misc"],
} as const;

export type TagIconKey = keyof typeof definitions;
const byName = new Map<string, TagIconKey>(
  Object.entries(definitions).flatMap(([icon, names]) =>
    names.map((name) => [name.toLocaleLowerCase("en-US"), icon as TagIconKey]),
  ),
);

export function tagIconKey(name: string): TagIconKey {
  return byName.get(name.trim().toLocaleLowerCase("en-US")) ?? "tag";
}
