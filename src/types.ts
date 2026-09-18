export type ListingKind = "group" | "channel" | "business" | "resource";
export type AccessMode = "open" | "public" | "invite_only" | "private" | "unknown";

export type Listing = {
  id: string;
  kind: ListingKind;
  name: string;
  summary: string;
  description: string;
  url: string | null;
  contactUrl: string | null;
  location: string | null;
  tags: string[];
  accessMode: AccessMode;
  accessInstructions: string;
  sourceName: string;
  sourceUrl: string | null;
  lastConfirmedAt: string | null;
};

export type DirectoryEvent = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  venue: string | null;
  city: string | null;
  url: string | null;
  sourceKey: string;
};

export const kindLabels: Record<ListingKind, string> = {
  group: "Groups",
  channel: "Channels",
  business: "Businesses",
  resource: "Resources"
};

export const accessLabels: Record<AccessMode, string> = {
  open: "Open to all",
  public: "Public / moderated",
  invite_only: "Invite only",
  private: "Private",
  unknown: "Access not confirmed"
};
