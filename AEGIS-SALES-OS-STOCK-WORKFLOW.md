# AEGIS Sales OS Stock Workflow

Forklift Pro stock should be managed from AEGIS, not by editing website cards by hand.

## What AEGIS Owns

The `Postcodes worked (database)` AEGIS Sales OS workbook now supports two extra tabs:

```text
Forklift Stock
Forklift Media
```

The live AEGIS Google Sheet has been prepared with these tabs and the stock headers/dropdowns:

```text
https://docs.google.com/spreadsheets/d/1gdL5hFBBuuAu_J_5rspcL-OfxC6DCj-5v7snztSbzrc/edit#gid=2026052201
```

The Apps Script actions added to `google-sheets-webhook.gs` are:

```text
?action=stockManager
?action=setupForkliftStock
?action=forkliftStock
POST action=forkliftStockItem
```

The Apps Script UI lives in:

```text
apps-script/index.html
```

In Apps Script, add that file as `index.html`. Make sure `google-sheets-webhook.gs` uses the `Postcodes worked (database)` spreadsheet ID:

```text
1gdL5hFBBuuAu_J_5rspcL-OfxC6DCj-5v7snztSbzrc
```

Then deploy the script as a web app and open it with:

```text
<apps-script-web-app-url>?action=stockManager
```

## Truck Details

Use `Forklift Stock` for:

- truck ID
- category
- status
- brand
- model
- power type
- capacity
- year
- hours
- price
- description
- image paths

Use `draft` as the status when a truck should not be shown publicly yet.

## Photos

Start the AEGIS Sales OS media upload area:

```bash
node tools/aegis-sales-os-stock-server.mjs
```

Then open:

```text
http://127.0.0.1:4195
```

This is now the local stock manager. It can add/edit trucks, upload photos, and update the Forklift Pro website inventory JSON.

Photos are saved into the Forklift Pro website media folder:

```text
Forklift Pro Solutions/assets/uploads/trucks/<truck-id>/
```

The upload page gives you a path like:

```text
assets/uploads/trucks/toyota-8fbe20u/main.jpg
```

Paste that path into the `Image Main` or `Gallery Images` columns in `Forklift Stock`.

To also push stock saves from the local manager into the Google Sheet automatically, start it with the deployed Apps Script web app URL:

```bash
AEGIS_STOCK_WEB_APP_URL="<apps-script-web-app-url>" node tools/aegis-sales-os-stock-server.mjs
```

## Website Sync

When the Sheet is ready, publish the `Forklift Stock` tab as CSV and run:

```bash
node tools/sync-forklift-stock-from-sheet.mjs "<published-csv-url>"
```

This updates:

```text
Forklift Pro Solutions/data/inventory.json
```

The Forklift Pro stock pages now read from this JSON automatically:

- `electric-pallet-trucks/index.html` shows `category = pallet-truck`
- `used-forklifts/index.html` shows `category = forklift-truck`
- hardcoded page cards remain as a fallback if the JSON cannot be loaded

After syncing, deploy the Forklift Pro site to publish the latest stock:

```bash
cd "Forklift Pro Solutions"
vercel --prod
```

For instant no-redeploy updates later, connect the website to a live Apps Script stock endpoint or a Vercel API proxy that reads the Sheet directly.
