import { z } from "zod";
export const donationsResponse = z.object({
  bitcoin: z
    .object({ address: z.string(), uri: z.string().startsWith("bitcoin:") })
    .nullable(),
  lightning: z
    .object({ address: z.string(), uri: z.string().startsWith("lightning:") })
    .nullable(),
});
