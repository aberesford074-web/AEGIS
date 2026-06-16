# AEGIS Marketplace Connections

AEGIS Sales OS now treats marketplaces as a channel hub rather than a separate stock system.

## What works now

- Stock remains in the `Forklift Stock` sheet.
- Marketplace status remains in the `Forklift Listings` sheet.
- The Marketplace page can prepare eBay and Facebook listing copy from the selected truck.
- The Marketplace page can export CSV feeds for eBay-style bulk upload and Facebook/Meta catalog workflows.
- Once credentials are configured, AEGIS can publish approved stock to eBay and save the live eBay URL back into the listing tracker.
- Once LinkedIn credentials are configured, AEGIS can publish approved Content Schedule posts or stock announcement posts and save the live LinkedIn URL.
- After a listing is published manually, paste the live URL back into AEGIS and set the channel to `Live`.
- Marketplace enquiries can be logged from Website, eBay, Facebook, LinkedIn, Google Business, Gumtree, or WhatsApp.

## eBay

eBay has a proper seller API path, but it needs OAuth and seller business policy setup before AEGIS can publish live listings automatically.

Do not store an eBay account password in AEGIS. The seller account signs in once through eBay OAuth, then AEGIS stores the refresh token and seller policy IDs in Apps Script properties.

Required Apps Script properties for future direct publish:

- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_REFRESH_TOKEN`
- `EBAY_MERCHANT_LOCATION_KEY`
- `EBAY_PAYMENT_POLICY_ID`
- `EBAY_FULFILLMENT_POLICY_ID`
- `EBAY_RETURN_POLICY_ID`
- `EBAY_CATEGORY_ID`
- Optional: `EBAY_MARKETPLACE_ID`, default `EBAY_GB`
- Optional: `EBAY_ENVIRONMENT`, use `sandbox` for eBay sandbox testing

OAuth setup helper:

```bash
# 1. Create the eBay seller consent URL
node tools/setup-aegis-ebay-oauth.mjs auth-url \
  --client-id "<EBAY_CLIENT_ID>" \
  --ru-name "<EBAY_RUNAME>"

# 2. Sign in to eBay in the browser and approve access.
# Copy the code query parameter from the return URL.

# 3. Exchange the code for a refresh token
node tools/setup-aegis-ebay-oauth.mjs exchange \
  --client-id "<EBAY_CLIENT_ID>" \
  --client-secret "<EBAY_CLIENT_SECRET>" \
  --ru-name "<EBAY_RUNAME>" \
  --code "<CODE_FROM_EBAY_RETURN_URL>"

# 4. Inspect seller policy and location IDs
node tools/setup-aegis-ebay-oauth.mjs inspect \
  --client-id "<EBAY_CLIENT_ID>" \
  --client-secret "<EBAY_CLIENT_SECRET>" \
  --refresh-token "<EBAY_REFRESH_TOKEN>"
```

After the helper returns the refresh token and policy/location IDs, add them in Apps Script Project Settings > Script Properties. Then `Publish eBay Live` can create the inventory item, create the offer, publish it, and save the live listing URL back to AEGIS.

When those are configured, use `Publish eBay Live` in Marketplace Control or ask the AEGIS GPT to publish an approved stock item to eBay. Until then, use `Prepare eBay`, copy the listing, publish in eBay, then paste the live eBay URL back into AEGIS.

## LinkedIn

LinkedIn is split into two useful workflows:

- Content Schedule posts from Industry Radar or manual drafts.
- Stock announcement posts from Marketplace Control.

Required Apps Script properties for direct LinkedIn publishing:

- `LINKEDIN_ACCESS_TOKEN`
- `LINKEDIN_AUTHOR_URN`

Optional refresh-token properties:

- `LINKEDIN_REFRESH_TOKEN`
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `LINKEDIN_VISIBILITY`, default `PUBLIC`

Use `LINKEDIN_AUTHOR_URN` for the profile or organisation that should publish the post, for example `urn:li:person:...` or `urn:li:organization:...`.

Fast setup from Sales OS:

1. In the LinkedIn Developer app, add the `Share on LinkedIn` product so the app has `w_member_social`.
2. Add `Sign In with LinkedIn using OpenID Connect` as well so Sales OS can resolve the Person URN automatically.
3. In Sales OS > Content Schedule, click `Set LinkedIn App` and paste the Client ID and Client Secret.
4. Copy the Authorized Redirect URL shown by Sales OS into the LinkedIn app Auth tab.
5. Back in Sales OS, click `Connect LinkedIn` and approve the LinkedIn permission screen.

## Facebook Marketplace

Facebook Marketplace does not work like eBay for direct automated personal Marketplace listing creation. AEGIS therefore supports:

- Prepared Marketplace copy for manual posting.
- CSV/catalog export for Meta Commerce catalog or Shop workflows.
- URL/status tracking after the listing is live.

Use `Prepare Facebook`, publish manually in Marketplace, then paste the live URL back into AEGIS.

## Public stock page

Meta catalog exports need a product URL. AEGIS defaults to:

`https://www.forkliftprosolutions.co.uk/used-forklifts/`

To override this later, set Apps Script property:

`AEGIS_PUBLIC_STOCK_URL`
