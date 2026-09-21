# Community entry design

Status: research-first creation-flow design, September 2026

This document defines the first creation experience for Porcupine Directory. It
is intentionally narrower than a community-management product: the directory
helps people find a useful path into a community, business, organization,
resource or idea. It does not certify legal status, establish leadership, or
replace the community's own governance.

## Research findings

The [Community Canvas](https://community-canvas.org/) describes community
design through identity, experience and structure, and emphasizes that the
framework should help people ask the right questions rather than prescribe one
answer. The [Wenger-Trayner communities-of-practice framework](https://www.wenger-trayner.com/communities-of-practice/)
separates domain, community and practice: a shared focus, the people involved,
and what they do together.

The [UK Government community development framework](https://www.gov.uk/guidance/community-development-framework)
groups practical questions into people, programme and platforms. It asks who
belongs, who is responsible, what the community does, how often people
interact, and where that interaction happens.

The [GOV.UK form guidance](https://www.gov.uk/service-manual/design/form-structure)
recommends a question protocol, branching questions, and one decision at a
time. It says to ask only for information that is needed, explain why it is
needed, and let users answer “I do not know” when that is valid.

Business and nonprofit are useful directory descriptors, but they are not
proofs of legal status. The [IRS explains](https://www.irs.gov/charities-non-profits/stay-exempt/understanding-key-topics)
that “nonprofit,” “tax-exempt,” and “charitable” are different concepts. The
directory should therefore use plain-language descriptors and avoid implying
incorporation, tax exemption, licensing, endorsement or certification.

## What an entry needs to make participation possible

The first form should gather only information that helps a visitor understand
and approach the entry:

1. **Purpose** — what is this and why might someone care?
2. **People** — who is it for, or who might participate?
3. **Activity** — what does it offer, discuss, organize or provide?
4. **Platform or place** — website, Signal, another online space, a location,
   or an explicit “not known yet.”
5. **Participation** — open, public/moderated, invite-only, private, or
   unknown, plus public joining instructions when known.
6. **Stewardship** — whether this is an existing entry or a proposed idea, and
   whether an organizer is being sought.

Business, nonprofit, organization, group and resource are overlapping
descriptors. A business can host a community. A nonprofit can run a Signal
channel. A group can use a business as its meeting place. A Signal channel is a
connection point, not proof that a separate community exists or that the link is
active.

## Creation questions and mapping

The creation wizard asks these questions in order:

| Question                                              | Why it is needed                                                   | Existing data model                     |
| ----------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------- |
| What are you adding: an existing entry or a new idea? | Separates operating entries from proposals without guessing        | `lifecycle`                             |
| What best describes it?                               | Offers useful language and suggests a descriptor                   | curated `tags`                          |
| If it is a new idea, will you organize it?            | Makes organizer need explicit                                      | `seekingOrganizer`                      |
| What is its name and short purpose?                   | Gives visitors an understandable starting point                    | `name`, `summary`                       |
| Where is it based or relevant?                        | Supports local discovery without collecting private residence data | `location`                              |
| How can people connect?                               | Starts with link type, then preserves a useful public pathway      | typed `connections`                     |
| How can people participate?                           | Prevents visitors from guessing access rules                       | `accessMode`, `accessInstructions`      |
| What optional public details help?                    | Supports businesses and organizations without requiring them       | public contact fields and `description` |

The “what best describes it” answer is a suggestion, not a legal or tax
classification. For example, choosing “Business or service” preselects the
existing Business tag; the contributor can remove or change that suggestion
before review.

## Metadata boundaries

Keep three concepts separate:

- **Connection-derived platforms** such as Signal, Website, Slack or Facebook
  come from supplied typed links. They are not manually editable tags.
- **Curated descriptors** such as Business, Arts or Housing are selected by a
  contributor from the controlled catalog. Wizard answers may suggest them.
- **Tag suggestions** fill gaps in the controlled catalog without letting a
  public form create definitions directly. A contributor can explain a missing
  descriptor such as Animal; an authorized monitor or administrator approves or
  rejects it with a review note, and approval creates the normal audited tag
  definition.
- **Workflow state** such as proposed or seeking an organizer stays in
  structured fields, not ordinary tags. `Needs organizer` is a browseable
  workflow filter, not a topic.

The first implementation may preserve existing stored platform tag values for
compatibility. New code should treat connection-derived platform information as
derived metadata and should never infer activity, trust, ownership or admission
from a link alone.

The creation wizard starts each link with a plain-language type choice before
asking for the URL. A Signal group is represented by its public group link;
the wizard explains that Signal calls this a group link and points to Signal's
[group-chat guide](https://support.signal.org/hc/en-us/articles/360007319331-Group-chats)
and [official group-link instructions](https://support.signal.org/hc/en-us/articles/360051086971-Group-Link-or-QR-code).
People can continue without a link when they do not have one yet. A typed
Signal link remains a connection facet, not a user-created `Signal` topic.

When a published submission succeeds, the contributor goes directly to the
public entry. The edit surface keeps the full field set for maintainers, but
puts the required change reason next to the save controls and explains that
accuracy confirmation and monitor review are separate actions.

## UX decision

Creation uses a branching wizard. Editing keeps the existing full form for now,
because maintainers need access to every field and revision-sensitive control.
The wizard ends with a public review screen that shows the fields that will be
published and repeats the anonymous-submission rule: an anonymous creator cannot
edit the entry later.

The first acceptance journeys are:

- A business owner creates a business with a website, optional Signal channel,
  public contact details and a useful participation path.
- A community member adds an existing Signal group with a name, purpose, link,
  access model and optional location.
- A person proposes a new group, chooses whether they will organize it, and
  produces a useful `Needs organizer` entry without inventing a website or
  contact detail.

Ownership transfer remains a separate, private, audited, recipient-accepted
workflow. The wizard must not imply that submitting or selecting a tag grants
ownership or leadership.
