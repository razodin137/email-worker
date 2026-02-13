// Email Triage Worker — enriches forwarded email with AI triage report
import { EmailMessage } from "cloudflare:email";

const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct";

const TRIAGE_SYSTEM_PROMPT = `You are an executive assistant AI. You will receive a raw email below.
Your ONLY job is to analyze it and produce a triage report. Do NOT ask for more information.
Do NOT say "I'm ready" or "please provide". The email is ALREADY in the user message.
Produce the report IMMEDIATELY using this exact format:

# Triage Report

## Summary
(One-sentence summary of what this email is about)

## Action Items
| # | Task | Deadline | Urgency | Importance |
|---|------|----------|---------|------------|
(List every actionable item. Use "None" for deadline if not specified.
Urgency: 🔴 Urgent / 🟡 Soon / 🟢 Low
Importance: 🔴 Critical / 🟡 Moderate / 🟢 Minor)

## Recommendation
(One short sentence: what should the recipient do first?)

If the email contains NO actionable items (e.g. newsletters, promotions, notifications),
simply respond with:
# Triage Report
## Summary
(summary)
## Action Items
None — this is an informational/promotional email.
## Recommendation
Archive or delete.`;

const FORWARD_TO = "jcamnorman@gmail.com";

export default {
    async email(message, env, ctx) {
        const subject = message.headers.get("subject") || "No Subject";
        const sender = message.from;
        const recipient = message.to;
        const rawBody = await new Response(message.body).text();

        console.log(`[Email Received] From: ${sender} | Subject: ${subject}`);

        try {
            // 1. Run AI triage
            const result = await env.AI.run(MODEL_ID, {
                messages: [
                    { role: "system", content: TRIAGE_SYSTEM_PROMPT },
                    {
                        role: "user",
                        content: `ANALYZE THIS EMAIL NOW:\n\nFrom: ${sender}\nSubject: ${subject}\n\n---BEGIN EMAIL BODY---\n${rawBody}\n---END EMAIL BODY---`
                    }
                ],
                stream: false,
                max_tokens: 1024
            });

            const triageReport = result.response;
            console.log("[AI Triage] Report generated successfully");

            // 2. Build enriched email manually (bypassing node dependencies)
            const enrichedBody = [
                "━━━━━━━━ AI TRIAGE ━━━━━━━━",
                "",
                triageReport,
                "",
                "━━━━━━━━ ORIGINAL EMAIL ━━━━━━━━",
                `From: ${sender}`,
                `Subject: ${subject}`,
                "",
                rawBody
            ].join("\n");

            const rawEmail = constructRawEmail({
                to: FORWARD_TO,
                from: recipient, // Sent "from" the original recipient address to the final destination
                subject: `📋 ${subject}`,
                body: enrichedBody,
                inReplyTo: message.headers.get("message-id")
            });

            await env.SEND_EMAIL.send(
                new EmailMessage(recipient, FORWARD_TO, rawEmail)
            );

            console.log(`[Done] Enriched email sent for: ${subject}`);

        } catch (error) {
            console.error("Error:", error.message);
            // Fallback: forward as-is so nothing gets lost
            try {
                await message.forward(FORWARD_TO);
                console.log("[Fallback] Forwarded without triage.");
            } catch (fwdError) {
                console.error("Forward Error:", fwdError.message);
            }
        }
    },

    async fetch(request, env) {
        return new Response("Triage Worker active.", { status: 200 });
    }
};

/**
 * Constructs a raw MIME email string manually.
 * Avoids using 'mimetext' or other libraries that depend on Node.js built-ins.
 */
function constructRawEmail({ to, from, subject, body, inReplyTo }) {
    const boundary = "boundary_" + Date.now().toString(36);

    let raw = `MIME-Version: 1.0\r\n`;
    raw += `To: ${to}\r\n`;
    raw += `From: "Triage AI" <${from}>\r\n`;
    raw += `Subject: ${subject}\r\n`;

    if (inReplyTo) {
        raw += `In-Reply-To: ${inReplyTo}\r\n`;
        raw += `References: ${inReplyTo}\r\n`;
    }

    raw += `Content-Type: text/plain; charset=UTF-8\r\n`;
    raw += `\r\n`;
    raw += body;

    return raw;
}