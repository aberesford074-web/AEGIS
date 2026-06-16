import express from "express";
import twilio from "twilio";
import { rewriteReply } from "../ai.js";
import { archiveMessage, createDraftReply, createGmailClient, sendReply } from "../gmail.js";
import { parseWhatsAppCommand, validateTwilioRequest } from "../whatsapp.js";

function twimlMessage(body) {
  const response = new twilio.twiml.MessagingResponse();
  response.message(body);
  return response.toString();
}

export function createTwilioRouter(config, store) {
  const router = express.Router();

  router.post("/whatsapp", async (req, res, next) => {
    try {
      if (process.env.NODE_ENV === "production" && !validateTwilioRequest(config, req)) {
        res.status(403).send("Forbidden");
        return;
      }

      const parsed = parseWhatsAppCommand(req.body.Body);
      if (!parsed.isCommand) {
        res.type("text/xml").send(twimlMessage(parsed.help));
        return;
      }

      const action = await store.getEmailAction(parsed.shortId);
      if (!action) {
        res.type("text/xml").send(twimlMessage(`I could not find email ID ${parsed.shortId}.`));
        return;
      }

      const tokens = await store.getGoogleTokens();
      if (!tokens) {
        res.type("text/xml").send(twimlMessage("Gmail is not connected yet."));
        return;
      }

      const gmail = createGmailClient(config, tokens);

      if (parsed.command === "1") {
        const draft = await createDraftReply(gmail, action, action.suggestedReply);
        await store.saveEmailAction({ ...action, status: "draft_created", draftId: draft.id });
        res.type("text/xml").send(twimlMessage(`Draft created for ${action.from}.`));
        return;
      }

      if (parsed.command === "2") {
        if (action.riskLevel !== "normal") {
          res.type("text/xml").send(twimlMessage("This email is marked sensitive. I created a draft instead of sending."));
          const draft = await createDraftReply(gmail, action, action.suggestedReply);
          await store.saveEmailAction({ ...action, status: "draft_created_sensitive", draftId: draft.id });
          return;
        }

        const sent = await sendReply(gmail, action, action.suggestedReply);
        await store.saveEmailAction({ ...action, status: "sent", sentMessageId: sent.id });
        res.type("text/xml").send(twimlMessage(`Sent reply to ${action.from}.`));
        return;
      }

      if (parsed.command === "3") {
        await archiveMessage(gmail, action.messageId);
        await store.saveEmailAction({ ...action, status: "archived" });
        res.type("text/xml").send(twimlMessage(`Archived email from ${action.from}.`));
        return;
      }

      if (parsed.command === "4") {
        const rewritten = await rewriteReply(config, action, parsed.instruction);
        const nextAction = { ...action, suggestedReply: rewritten, status: "rewritten_waiting_for_approval" };
        await store.saveEmailAction(nextAction);
        res.type("text/xml").send(twimlMessage([
          `Rewritten reply for ${action.shortId}:`,
          "",
          rewritten,
          "",
          `Reply 1 ${action.shortId} to draft or 2 ${action.shortId} to send.`,
        ].join("\n")));
      }
    } catch (error) {
      next(error);
    }
  });

  router.post("/status", (req, res) => {
    console.log("Twilio status", {
      sid: req.body.MessageSid,
      status: req.body.MessageStatus,
      errorCode: req.body.ErrorCode,
      errorMessage: req.body.ErrorMessage,
    });
    res.sendStatus(204);
  });

  return router;
}
