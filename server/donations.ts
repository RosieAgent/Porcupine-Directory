import { address as bitcoinAddress, networks } from "bitcoinjs-lib";
import { bech32 } from "bech32";
import type { z } from "zod";
import type { donationsResponse } from "../shared/donations.js";

export interface LightningAddress {
  username: string;
  domain: string;
  address: string;
}

export function parseLightningAddress(
  value: string | undefined,
): LightningAddress | null {
  const address = value?.trim();
  if (!address || address.length > 320) return null;
  const match =
    /^([a-zA-Z0-9._-]{1,64})@([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+)$/.exec(
      address,
    );
  if (!match || match[2].endsWith(".local") || /^\d+(\.\d+){3}$/.test(match[2]))
    return null;
  return {
    username: match[1],
    domain: match[2].toLowerCase(),
    address,
  };
}

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
  const lightning = parseLightningAddress(env.DONATION_LIGHTNING_ADDRESS);
  if (lightning) {
    const endpoint = `https://${lightning.domain}/.well-known/lnurlp/${lightning.username}`;
    const lnurl = bech32.encode(
      "lnurl",
      bech32.toWords(Buffer.from(endpoint)),
      2000,
    );
    result.lightning = {
      address: lightning.address,
      uri: `lightning:${lnurl}`,
    };
  }
  return result;
}
