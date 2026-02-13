// src/index.ts — Email Triage Worker
const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct";

// Assertive system prompt: forces the model to process immediately, no preamble
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

export default {
    /**
     * Handler for incoming emails via Cloudflare Email Routing
     */
    async email(message, env, ctx) {
        const subject = message.headers.get("subject") || "No Subject";
        const sender = message.from;
        const recipient = message.to;

        // 1. Extract the body text from the email
        const rawBody = await new Response(message.body).text();

        console.log(`[Email Received] From: ${sender} | Subject: ${subject}`);

        try {
            // 2. Run the Triage through Llama — assertive prompt with data inline
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

            console.log("--- AI TRIAGE REPORT START ---");
            console.log(triageReport);
            console.log("--- AI TRIAGE REPORT END ---");

            // 3. Forward the original email with the triage report prepended
            //    This sends the report back to the original recipient's inbox
            //    so they see the AI analysis alongside the original message.
            const reportHeader = new Map(message.headers);

            // Create a new email body with the triage report prepended
            const enhancedBody = [
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
                "📋 AI TRIAGE REPORT",
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
                "",
                triageReport,
                "",
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
                "📨 ORIGINAL EMAIL BELOW",
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
                "",
                rawBody
            ].join("\n");

            // Forward to yourself with the triage analysis
            // Change this address to wherever you want reports delivered
            await message.forward("jcamnorman@gmail.com", reportHeader);

            console.log(`[Triage Complete] Report forwarded for: ${subject}`);

        } catch (error) {
            console.error("Inference Error:", error.message);
            // Still forward the email even if AI fails, so nothing gets lost
            try {
                await message.forward("jcamnorman@gmail.com");
                console.log("[Fallback] Email forwarded without triage report.");
            } catch (fwdError) {
                console.error("Forward Error:", fwdError.message);
            }
        }
    },

    /**
     * Health check endpoint
     */
    async fetch(request, env) {
        return new Response("Triage Worker is active. Send emails to trigger.", { status: 200 });
    }
};