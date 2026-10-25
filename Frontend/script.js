const problemInput = document.getElementById("problem");
const languageInput = document.getElementById("language");
const solveButton = document.getElementById("solveBtn");
const solution = document.getElementById("solution");
const copyCodeButton = document.getElementById("copyCodeBtn");
const copyStatus = document.getElementById("copyStatus");

function extractCode(text) {
    const codeBlocks = [...text.matchAll(/```[^\r\n]*\r?\n([\s\S]*?)```|~~~[^\r\n]*\r?\n([\s\S]*?)~~~/g)]
        .map((match) => match[1] ?? match[2]);

    return codeBlocks.length ? codeBlocks.join("\n\n") : text;
}

copyCodeButton.addEventListener("click", async function () {
    try {
        await navigator.clipboard.writeText(extractCode(solution.textContent));
        copyStatus.textContent = "Code copied.";
    } catch (error) {
        console.error("Error copying solution code:", error);
        copyStatus.textContent = "Could not copy code. Please try again.";
    }
});

solveButton.addEventListener("click", async function () {
    const problem = problemInput.value.trim();
    if (!problem) {
        solution.textContent = "Please enter a problem statement.";
        copyCodeButton.disabled = true;
        copyStatus.textContent = "";
        return;
    }

    solveButton.disabled = true;
    copyCodeButton.disabled = true;
    copyStatus.textContent = "";
    solution.textContent = "Generating solution...";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 250_000);

    try {
        const response = await fetch("/api/solve", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                problem,
                language: languageInput.value
            }),
            signal: controller.signal
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "The server could not solve this problem.");
        }

        solution.textContent = data.solution;
        copyCodeButton.disabled = false;
    } catch (error) {
        console.error("Error:", error);
        solution.textContent = error.name === "AbortError"
            ? "Error: The request took too long. Please try again."
            : `Error: ${error.message}`;
    } finally {
        clearTimeout(timeoutId);
        solveButton.disabled = false;
    }
});