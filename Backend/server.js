const express = require("express");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "Frontend")));

const nvidiaUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
const model = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
const supportedLanguages = ["Python", "JavaScript", "Java", "C++", "C#", "Go", "Rust"];

app.post("/api/solve", async (req, res) => {
    const problem =
        typeof req.body?.problem === "string" ? req.body.problem.trim() : "";
    const language =
        typeof req.body?.language === "string" ? req.body.language : "Python";

    if (!problem) {
        return res.status(400).json({ error: "Problem statement is required." });
    }
    if (!supportedLanguages.includes(language)) {
        return res.status(400).json({ error: "Please select a supported programming language." });
    }
    if (!process.env.NVIDIA_API_KEY) {
        console.error("NVIDIA_API_KEY is not configured.");
        return res.status(503).json({ error: "The solution service is not configured." });
    }

    const prompt = `You are a programming problem solver.

Solve the following programming problem in ${language}. Provide:

1. Problem understanding
2. Approach
3. Complete, readable solution code in ${language}
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
                error: "The AI service could not generate a solution. Please try again later."
            });
        }

        const data = await response.json();
        const generatedSolution = data?.choices?.[0]?.message?.content;
        if (typeof generatedSolution !== "string" || !generatedSolution.trim()) {
            console.error("NVIDIA API returned an empty or invalid response.");
            return res.status(502).json({
                error: "The AI service returned an empty solution. Please try again."
            });
        }

        return res.json({ solution: generatedSolution });
    } catch (error) {
        const timedOut =
            error?.name === "TimeoutError" || error?.name === "AbortError";
        console.error(
            `Error solving problem with NVIDIA API (${timedOut ? "timeout" : "request failure"}).`
        );
        return res.status(timedOut ? 504 : 502).json({
            error: timedOut
                ? "The AI service took too long to respond. Please try again."
                : "Unable to reach the AI service. Please try again later."
        });
    }
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
console.log(`Server running on http://localhost:${port}`);
});