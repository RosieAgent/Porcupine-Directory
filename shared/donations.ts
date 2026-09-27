import { z } from "zod";
export const donationsResponse = z.object({
  bitcoin: z
    .object({ address: z.string(), uri: z.string().startsWith("bitcoin:") })
    .nullable(),
  bitcoinCheckoutUrl: z
    .string()
    .url()
    .startsWith("https://")
    .nullable()
    .optional(),
  lightning: z
    .object({ address: z.string(), uri: z.string().startsWith("lightning:") })
    .nullable(),
});
