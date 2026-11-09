const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// Load environment variables from this backend folder (for example, NVIDIA_API_KEY).
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
// Parse JSON request bodies and serve the frontend files from the sibling folder.
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "Frontend")));

// NVIDIA's OpenAI-compatible chat-completions endpoint and model configuration.
const nvidiaUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
const model = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
const supportedLanguages = ["Python", "JavaScript", "Java", "C++", "C#", "Go", "Rust"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function isElevatedSupabaseKey(key) {
    if (key.startsWith("sb_secret_")) {
        return true;
    }

    try {
        const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
        return payload.role === "service_role";
    } catch {
        return false;
    }
}

let supabase = null;
if (supabaseUrl && supabaseKey && isElevatedSupabaseKey(supabaseKey)) {
    console.error("Supabase configuration rejected: use a publishable key, not an elevated key.");
} else if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
}

function requireSupabase(res) {
    if (supabase) {
        return true;
    }

    console.error("Supabase is not configured with a URL and publishable key.");
    res.status(503).json({ error: "Conversation history is not configured." });
    return false;
}

function logDatabaseError(operation, error) {
    const code = typeof error?.code === "string" ? error.code : "unknown";
    console.error(`Supabase ${operation} failed (code ${code}).`);
}

function sendDatabaseError(res, operation, error, conversationId) {
    logDatabaseError(operation, error);
    const response = { error: "Conversation history could not be saved or loaded." };
    if (conversationId) {
        response.conversationId = conversationId;
    }
    return res.status(500).json(response);
}

function makeConversationTitle(problem) {
    const normalized = problem.replace(/\s+/g, " ").trim();
    return normalized.length > 72 ? `${normalized.slice(0, 69).trimEnd()}...` : normalized;
}

async function createConversation(title) {
    const { data, error } = await supabase
        .from("conversations")
        .insert({ title, updated_at: new Date().toISOString() })
        .select("id, title, created_at, updated_at")
        .single();
    return { data, error };
}

async function addMessage(conversationId, role, content, language) {
    const { error: messageError } = await supabase
        .from("messages")
        .insert({ conversation_id: conversationId, role, content, language });
    if (messageError) {
        return { error: messageError };
    }

    const { error: updateError } = await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    return { error: updateError };
}

async function getConversation(conversationId) {
    // Prototype mode has no authenticated owner; this checks existence only.
    return supabase
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .maybeSingle();
}

// Return saved conversations newest-first.
app.get("/api/conversations", async (req, res) => {
    if (!requireSupabase(res)) return;

    try {
        const { data, error } = await supabase
            .from("conversations")
            .select("id, title, created_at, updated_at")
            .order("updated_at", { ascending: false });
        if (error) {
            return sendDatabaseError(res, "list conversations", error);
        }
        return res.json({ conversations: data });
    } catch (error) {
        return sendDatabaseError(res, "list conversations", error);
    }
});

// Create an empty conversation when explicitly requested by an API client.
app.post("/api/conversations", async (req, res) => {
    if (!requireSupabase(res)) return;

    const title =
        typeof req.body?.title === "string" && req.body.title.trim()
            ? req.body.title.trim().slice(0, 72)
            : "New conversation";
    try {
        const { data, error } = await createConversation(title);
        if (error) {
            return sendDatabaseError(res, "create conversation", error);
        }
        return res.status(201).json({ conversation: data });
    } catch (error) {
        return sendDatabaseError(res, "create conversation", error);
    }
});

// Return a conversation's messages in chronological order.
app.get("/api/conversations/:id/messages", async (req, res) => {
    if (!requireSupabase(res)) return;
    const { id } = req.params;
    if (!uuidPattern.test(id)) {
        return res.status(400).json({ error: "Invalid conversation ID." });
    }

    try {
        const { data: conversation, error: conversationError } = await getConversation(id);
        if (conversationError) {
            return sendDatabaseError(res, "find conversation", conversationError);
        }
        if (!conversation) {
            return res.status(404).json({ error: "Conversation not found." });
        }

        const { data, error } = await supabase
            .from("messages")
            .select("id, conversation_id, role, content, language, created_at")
            .eq("conversation_id", id)
            .order("created_at", { ascending: true });
        if (error) {
            return sendDatabaseError(res, "list messages", error);
        }
        return res.json({ messages: data });
    } catch (error) {
        return sendDatabaseError(res, "list messages", error);
    }
});

// Delete a conversation; its messages are removed by the configured FK cascade.
app.delete("/api/conversations/:id", async (req, res) => {
    if (!requireSupabase(res)) return;
    const { id } = req.params;
    if (!uuidPattern.test(id)) {
        return res.status(400).json({ error: "Invalid conversation ID." });
    }

    try {
        const { data: conversation, error: conversationError } = await getConversation(id);
        if (conversationError) {
            return sendDatabaseError(res, "find conversation", conversationError);
        }
        if (!conversation) {
            return res.status(404).json({ error: "Conversation not found." });
        }

        const { error } = await supabase.from("conversations").delete().eq("id", id);
        if (error) {
            return sendDatabaseError(res, "delete conversation", error, id);
        }
        return res.json({ success: true, conversationId: id });
    } catch (error) {
        return sendDatabaseError(res, "delete conversation", error, id);
    }
});

// Accept a problem and language, persist both messages, and return the solution.
app.post("/api/solve", async (req, res) => {
    const problem =
        typeof req.body?.problem === "string" ? req.body.problem.trim() : "";
    const language =
        typeof req.body?.language === "string" ? req.body.language : "Python";
    const requestedConversationId = req.body?.conversationId;

    if (!problem) {
        return res.status(400).json({ error: "Problem statement is required." });
    }
    if (!supportedLanguages.includes(language)) {
        return res.status(400).json({ error: "Please select a supported programming language." });
    }
    if (
        requestedConversationId !== undefined &&
        requestedConversationId !== null &&
        (typeof requestedConversationId !== "string" ||
            !uuidPattern.test(requestedConversationId))
    ) {
        return res.status(400).json({ error: "Invalid conversation ID." });
    }
    if (!process.env.NVIDIA_API_KEY) {
        console.error("NVIDIA_API_KEY is not configured.");
        return res.status(503).json({ error: "The solution service is not configured." });
    }
    if (!requireSupabase(res)) return;

    let conversationId = requestedConversationId || null;
    try {
        if (conversationId) {
            const { data: conversation, error } = await getConversation(conversationId);
            if (error) {
                return sendDatabaseError(res, "find conversation", error, conversationId);
            }
            if (!conversation) {
                return res.status(404).json({ error: "Conversation not found." });
            }
        } else {
            const { data: conversation, error } = await createConversation(
                makeConversationTitle(problem)
            );
            if (error) {
                return sendDatabaseError(res, "create conversation", error);
            }
            conversationId = conversation.id;
        }

        const userMessage = await addMessage(conversationId, "user", problem, language);
        if (userMessage.error) {
            return sendDatabaseError(res, "save user message", userMessage.error, conversationId);
        }
    } catch (error) {
        return sendDatabaseError(res, "save user message", error, conversationId);
    }

    // Keep the existing prompt format and send only this request's problem to NVIDIA.
    const prompt = `You are a programming problem solver.

Solve the following programming problem in ${language}. Provide:

1. Problem understanding
2. Approach
3. Complete, readable solution code in ${language}, inside one fenced code block labeled ${language}
4. Time complexity
5. Space complexity

Problem statement:
${problem}`;

    try {
        const response = await fetch(nvidiaUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.2,
                max_tokens: 4096
            }),
            signal: AbortSignal.timeout(240_000)
        });

        if (!response.ok) {
            console.error(`NVIDIA API request failed with status ${response.status}.`);
            return res.status(502).json({
                error: "The AI service could not generate a solution. Please try again later.",
                conversationId
            });
        }

        const data = await response.json();
        const generatedSolution = data?.choices?.[0]?.message?.content;
        if (typeof generatedSolution !== "string" || !generatedSolution.trim()) {
            console.error("NVIDIA API returned an empty or invalid response.");
            return res.status(502).json({
                error: "The AI service returned an empty solution. Please try again.",
                conversationId
            });
        }

        const assistantMessage = await addMessage(
            conversationId,
            "assistant",
            generatedSolution,
            language
        );
        if (assistantMessage.error) {
            return sendDatabaseError(
                res,
                "save assistant message",
                assistantMessage.error,
                conversationId
            );
        }

        return res.json({ solution: generatedSolution, conversationId });
    } catch (error) {
        const timedOut =
            error?.name === "TimeoutError" || error?.name === "AbortError";
        console.error(
            `Error solving problem with NVIDIA API (${timedOut ? "timeout" : "request failure"}).`
        );
        return res.status(timedOut ? 504 : 502).json({
            error: timedOut
                ? "The AI service took too long to respond. Please try again."
                : "Unable to reach the AI service. Please try again later.",
            conversationId
        });
    }
});

// Use the deployment-provided port when available; otherwise run locally on port 3000.
const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});