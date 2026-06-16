import express from "express";
import { analyzeEmail } from "../ai.js";
import { createGmailClient, extractReplyAddress, getMessage, listUnreadMessages } from "../gmail.js";
import { buildEmailActionMessage, sendWhatsApp } from "../whatsapp.js";

function makeShortId(messageId) {
  return messageId.slice(0, 7).toLowerCase();
}

export function createJobsRouter(config, store) {
  const router = express.Router();

  router.post("/check-inbox", async (_req, res, next) => {
    try {
      const tokens = await store.getGoogleTokens();
      if (!tokens) {
        res.status(400).json({ ok: false, error: "Gmail is not connected. Visit /auth/google first." });
        return;
      }

      const gmail = createGmailClient(config, tokens);
      const unread = await listUnreadMessages(gmail, config.app.maxEmailsPerCheck);
      const results = [];

      for (const item of unread) {
        if (await store.hasProcessedMessage(item.id)) {
          continue;
        }

        const email = await getMessage(gmail, item.id);
        const analysis = await analyzeEmail(config, email);
        const shortId = makeShortId(email.id);
        const action = {
          shortId,
          messageId: email.id,
          threadId: email.threadId,
          from: email.from,
          replyTo: extractReplyAddress(email.from),
          subject: email.subject,
          summary: analysis.summary,
          intent: analysis.intent,
          urgency: analysis.urgency,
          riskLevel: analysis.risk_level,
          recommendedAction: analysis.recommended_action,
          reason: analysis.reason,
          suggestedReply: analysis.suggested_reply,
          status: "waiting_for_whatsapp_approval",
          createdAt: new Date().toISOString(),
        };

        await store.saveEmailAction(action);
        await store.markProcessedMessage(email.id);
        const whatsappMessage = await sendWhatsApp(config, buildEmailActionMessage(action));

        results.push({
          shortId,
          messageId: email.id,
          whatsappSid: whatsappMessage.sid,
          summary: analysis.summary,
        });
      }

      res.json({ ok: true, scanned: unread.length, sentToWhatsApp: results.length, results });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
