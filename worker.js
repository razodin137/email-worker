// src/index.ts
const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct";

const TRIAGE_SYSTEM_PROMPT = `
You are an elite Executive Assistant. Analyze the incoming email thread:
1. Identify specific tasks and deadlines.
2. Categorize items by Urgency and Importance (Eisenhower Matrix).
3. Ignore signatures, headers, and legal noise.
Output the report in clean Markdown format.
`;

export default {
    /**
     * Handler for incoming emails via Cloudflare Email Routing
     */
    async email(message, env, ctx) {
        const subject = message.headers.get("subject") || "No Subject";
        const sender = message.from;

        // 1. Extract the body text from the email
        const rawBody = await new Response(message.body).text();

        console.log(`[Email Received] From: ${sender} | Subject: ${subject}`);

        try {
            // 2. Run the Triage through Llama
            const result = await env.AI.run(MODEL_ID, {
                messages: [
                    { role: "system", content: TRIAGE_SYSTEM_PROMPT },
                    { role: "user", content: `EMAIL CONTENT:\n${rawBody}` }
                ],
                stream: false
            });

            const triageReport = result.response;

            // 3. For now, we log the output to verify it's working.
            // You will see this in your terminal when you run 'wrangler tail'
            console.log("--- AI TRIAGE REPORT START ---");
            console.log(triageReport);
            console.log("--- AI TRIAGE REPORT END ---");

            // NOTE: We are NOT calling message.reply() or message.forward() yet.
            // This worker currently just "eats" the email and logs the intelligence.

        } catch (error) {
            console.error("Inference Error:", error.message);
        }
    },

    /**
     * Optional: Keep a basic health check for the API endpoint
     */
    async fetch(request, env) {
        return new Response("Triage Worker is active. Send emails to trigger.", { status: 200 });
    }
};