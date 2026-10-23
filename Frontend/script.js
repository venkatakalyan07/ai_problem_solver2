const problemInput = document.getElementById("problem");
const languageInput = document.getElementById("language");
const solveButton = document.getElementById("solveBtn");
const solution = document.getElementById("solution");

solveButton.addEventListener("click", async function () {
    const problem = problemInput.value.trim();
    if (!problem) {
        solution.textContent = "Please enter a problem statement.";
        return;
    }

    solveButton.disabled = true;
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