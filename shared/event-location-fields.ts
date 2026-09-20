import { z } from "zod";

// Spread into the public event contract. Defaults also support older fixtures.
export const eventLocationFields = {
  address: z.string().nullable().default(null),
  state: z.string().nullable().default(null),
  postalCode: z.string().nullable().default(null),
  country: z.string().nullable().default(null),
  locationType: z
    .enum(["physical", "online", "undisclosed", "unknown"])
    .default("unknown"),
};
export const eventLocationSchema = z.object({
  venue: z.string().nullable(),
  city: z.string().nullable(),
  ...eventLocationFields,
});
export type PublicEventLocation = z.infer<typeof eventLocationSchema>;
