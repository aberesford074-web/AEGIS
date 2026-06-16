const SYSTEM_PROMPT = `
You are Aegis Agent, an approval-based AI executive assistant for email.
Your job is to summarise incoming emails, classify urgency, and draft a concise reply.

Rules:
- Never pretend an action has happened.
- Never send legal, financial, medical, HR, security, or highly sensitive replies without human review.
- Keep summaries short and operational.
- Draft replies in a professional, plain-English tone.
- If the email is spam, newsletter, or low value, say so.
- Only notify the user for emails that likely need attention, review, a reply, a decision, or awareness.
- Do not notify for generic promotions, newsletters, automated marketing, social updates, routine receipts, or low-value notices unless there is a clear action or risk.
`;

const schema = {
  name: "email_action",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "summary",
      "intent",
      "urgency",
      "risk_level",
      "category",
      "should_notify",
      "safe_to_send",
      "suggested_reply",
      "recommended_action",
      "reason",
    ],
    properties: {
      summary: { type: "string" },
      intent: { type: "string" },
      urgency: { type: "string", enum: ["low", "medium", "high"] },
      risk_level: { type: "string", enum: ["normal", "sensitive", "do_not_auto_send"] },
      category: {
        type: "string",
        enum: ["actionable", "customer", "security", "financial", "receipt", "newsletter", "promotion", "spam", "other"],
      },
      should_notify: { type: "boolean" },
      safe_to_send: { type: "boolean" },
      suggested_reply: { type: "string" },
      recommended_action: { type: "string", enum: ["draft", "send_with_approval", "ignore", "manual_review"] },
      reason: { type: "string" },
    },
  },
  strict: true,
};

function extractJsonFromResponse(data) {
  if (data.output_text) return JSON.parse(data.output_text);

  const output = data.output || [];
  for (const item of output) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        return JSON.parse(content.text);
      }
    }
  }

  throw new Error("OpenAI response did not include JSON output.");
}

export async function analyzeEmail(config, email) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openai.model,
      input: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            "Analyze this email and return the JSON object only.",
            "If it is low-value, set should_notify=false and recommended_action=ignore.",
            "Set safe_to_send=false for legal, financial, medical, HR, security, account access, threats, disputes, refunds, contracts, or anything that could cause harm if wrong.",
            "",
            `From: ${email.from}`,
            `Subject: ${email.subject}`,
            `Snippet: ${email.snippet}`,
            "",
            email.body,
          ].join("\n"),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          ...schema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  }

  return extractJsonFromResponse(await response.json());
}

export async function rewriteReply(config, action, instruction) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openai.model,
      input: [
        {
          role: "system",
          content: "Rewrite the email reply using the user's instruction. Return only the rewritten email body.",
        },
        {
          role: "user",
          content: [
            `Instruction: ${instruction || "Make it clearer and more concise."}`,
            "",
            "Original email:",
            action.emailBody || action.summary,
            "",
            "Original suggested reply:",
            action.suggestedReply,
          ].join("\n"),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI rewrite failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.output_text || action.suggestedReply;
}

export async function regenerateReply(config, action) {
  return rewriteReply(config, action, "Regenerate a fresh reply with a helpful, professional tone. Keep it concise.");
}
