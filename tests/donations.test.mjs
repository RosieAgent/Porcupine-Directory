import test from "node:test";
import assert from "node:assert/strict";
import { bech32 } from "bech32";
import { donationSettings } from "../dist-server/server/donations.js";

test("donations fail closed without verified-format receiving details", () => {
  assert.deepEqual(donationSettings({}), { bitcoin: null, lightning: null });
  for (const value of [
    "private key",
    "bitcoin:1test?amount=1",
    "xpub-not-an-address",
    "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb",
  ]) {
    assert.equal(
      donationSettings({ DONATION_BITCOIN_ADDRESS: value }).bitcoin,
      null,
    );
  }
  for (const value of [
    "alice@localhost",
    "alice@127.0.0.1",
    "a@host.local",
    "a@evil.example/path",
    "lnbc123",
    "a@user:pass@example.org",
  ]) {
    assert.equal(
      donationSettings({ DONATION_LIGHTNING_ADDRESS: value }).lightning,
      null,
    );
  }
});
test("Bitcoin checksums and Lightning URI encoding use standard libraries", () => {
  // Well-known genesis address is a validation fixture ONLY, never deployment config.
  const config = donationSettings({
    DONATION_BITCOIN_ADDRESS: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    DONATION_LIGHTNING_ADDRESS: "Donations@EXAMPLE.org",
  });
  assert.equal(
    config.bitcoin.uri,
    "bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  );
  const decoded = bech32.decode(config.lightning.uri.slice(10), 2000);
  assert.equal(decoded.prefix, "lnurl");
  assert.equal(
    Buffer.from(bech32.fromWords(decoded.words)).toString(),
    "https://example.org/.well-known/lnurlp/Donations",
  );
});
