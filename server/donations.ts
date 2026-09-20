import { address as bitcoinAddress, networks } from "bitcoinjs-lib";
import { bech32 } from "bech32";
import type { z } from "zod";
import type { donationsResponse } from "../shared/donations.js";

export function donationSettings(
  env: NodeJS.ProcessEnv = process.env,
): z.infer<typeof donationsResponse> {
  const result: z.infer<typeof donationsResponse> = {
    bitcoin: null,
    lightning: null,
  };
  const bitcoin = env.DONATION_BITCOIN_ADDRESS?.trim();
  if (bitcoin && bitcoin.length <= 100) {
    try {
      bitcoinAddress.toOutputScript(bitcoin, networks.bitcoin); // checksum + mainnet
      result.bitcoin = { address: bitcoin, uri: `bitcoin:${bitcoin}` };
    } catch {
      /* Fail closed; never expose malformed destinations or secrets. */
    }
  }
  const lightning = env.DONATION_LIGHTNING_ADDRESS?.trim();
  if (lightning && lightning.length <= 320) {
    // Lightning Address (LUD-16), not an email-recovery address. Case is retained
    // for the account name; only the DNS name is case-insensitive.
    const match =
      /^([a-zA-Z0-9._-]{1,64})@([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+)$/.exec(
        lightning,
      );
    if (
      match &&
      !match[2].endsWith(".local") &&
      !/^\d+(\.\d+){3}$/.test(match[2])
    ) {
      const endpoint = `https://${match[2].toLowerCase()}/.well-known/lnurlp/${match[1]}`;
      const lnurl = bech32.encode(
        "lnurl",
        bech32.toWords(Buffer.from(endpoint)),
        2000,
      );
      result.lightning = { address: lightning, uri: `lightning:${lnurl}` };
    }
  }
  return result;
}
