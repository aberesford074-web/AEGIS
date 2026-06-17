# AEGIS GPT Proxy

Private Vercel function used by the AEGIS Sales OS Custom GPT.

ChatGPT authenticates to this proxy with a saved bearer token. The proxy injects the real AEGIS Sales OS web app access key server-side, then forwards the action to the Google Apps Script app.

Required Vercel environment variables:

- `AEGIS_WEB_APP_URL`
- `AEGIS_WEB_ACCESS_KEY`
- `AEGIS_GPT_PROXY_TOKEN`
- `EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN`

The GPT action should call:

`POST /api/aegis-sales-os`

Read actions use `action: "getState"`. Write actions require `confirmed: true`.

eBay marketplace account deletion notifications use:

`GET/POST /api/ebay/account-deletion`

eBay OAuth sign-in returns to:

`GET /api/ebay/oauth/callback`
