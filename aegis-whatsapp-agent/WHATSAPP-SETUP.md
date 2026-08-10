# WhatsApp Setup

For the first working version, use the Twilio WhatsApp Sandbox.

## What We Need

You already have:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`

For WhatsApp, we still need:

- `OWNER_WHATSAPP_TO` - your personal WhatsApp number, for example `whatsapp:+447000000000`
- Twilio WhatsApp Sandbox joined from that phone
- later, a production WhatsApp sender if you want clients using it properly

## Important

`TWILIO_PHONE_NUMBER` is usually a normal Twilio voice/SMS number. It is not automatically a WhatsApp sender.

For sandbox testing, use:

```text
TWILIO_WHATSAPP_FROM=whatsapp:+1XXXXXXXXXX
```

Your phone must join the sandbox in Twilio first.

## Join The Sandbox

In Twilio Console:

1. Go to **Messaging**
2. Go to **Try it out**
3. Choose **Send a WhatsApp message**
4. Twilio will show a code like:

```text
join example-word
```

5. Send that exact message from your WhatsApp to:

```text
+1 XXX XXX XXXX
```

After that, Twilio can send WhatsApp messages to your phone from the sandbox.

## Environment Values

Create `aegis-whatsapp-agent/.env`.

Use the keys you pasted for:

```text
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
```

Then add:

```text
TWILIO_WHATSAPP_FROM=whatsapp:+1XXXXXXXXXX
OWNER_WHATSAPP_TO=whatsapp:+44XXXXXXXXXX
```

Do not use the Twilio phone number as `OWNER_WHATSAPP_TO` unless that is genuinely the phone you personally use on WhatsApp.

## Still Needed For Gmail

The WhatsApp part is only half of the agent. To read and reply to Gmail, we still need:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8787/auth/google/callback
```

Those come from Google Cloud OAuth setup.

## Security Note

The keys pasted into chat should be treated as exposed. They are fine for local testing, but before production you should rotate/regenerate:

- OpenAI API key
- Twilio auth token
- Supabase service role key

Never put `.env` in GitHub.
