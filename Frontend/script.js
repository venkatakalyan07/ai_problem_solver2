const problemInput = document.getElementById("problem");
const languageInput = document.getElementById("language");
const solveButton = document.getElementById("solveBtn");
const problemError = document.getElementById("problemError");
const conversationList = document.getElementById("conversationList");
const conversationHistory = [];

function getCodeBlocks(text) {
    return [...text.matchAll(/```([^\r\n]*)\r?\n([\s\S]*?)```|~~~([^\r\n]*)\r?\n([\s\S]*?)~~~/g)]
        .map((match) => ({
            language: (match[1] ?? match[3]).trim(),
            code: match[2] ?? match[4]
        }));
}

function appendFormattedResponse(container, text) {
    const fencePattern = /```[^\r\n]*\r?\n[\s\S]*?```|~~~[^\r\n]*\r?\n[\s\S]*?~~~/g;
    let cursor = 0;

    for (const match of text.matchAll(fencePattern)) {
        const beforeCode = text.slice(cursor, match.index).trim();
        if (beforeCode) {
            const paragraph = document.createElement("p");
            paragraph.className = "response-text";
            paragraph.textContent = beforeCode;
            container.appendChild(paragraph);
        }

        const codeBlock = getCodeBlocks(match[0])[0];
        const codeContainer = document.createElement("div");
        codeContainer.className = "code-block";

        if (codeBlock.language) {
            const languageLabel = document.createElement("span");
            languageLabel.className = "code-language";
            languageLabel.textContent = codeBlock.language;
            codeContainer.appendChild(languageLabel);
        }

        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = codeBlock.code;
        pre.appendChild(code);
        codeContainer.appendChild(pre);
        container.appendChild(codeContainer);
        cursor = match.index + match[0].length;
    }

    const remainingText = text.slice(cursor).trim();
    if (remainingText) {
        const paragraph = document.createElement("p");
        paragraph.className = "response-text";
        paragraph.textContent = remainingText;
        container.appendChild(paragraph);
    }
}

function createMessage(role, text, status) {
    const message = document.createElement("article");
    message.className = `chat-message ${role}-message`;

    const label = document.createElement("h3");
    label.className = "message-label";
    label.textContent = role === "user" ? "You" : "AI assistant";
    message.appendChild(label);

    const body = document.createElement("div");
    body.className = "message-body";

    if (role === "assistant" && status === "success") {
        appendFormattedResponse(body, text);
    } else {
        const paragraph = document.createElement("p");
        paragraph.className = status === "error" ? "response-text error-text" : "response-text";
        paragraph.textContent = text;
        body.appendChild(paragraph);
    }
    message.appendChild(body);

    if (role === "assistant" && status === "success") {
        const actions = document.createElement("div");
        actions.className = "message-actions";

        const copyStatus = document.createElement("span");
        copyStatus.className = "copy-status";
        copyStatus.setAttribute("aria-live", "polite");

        const copyButton = document.createElement("button");
        copyButton.className = "copy-button";
        copyButton.type = "button";
        copyButton.textContent = "Copy code";
        copyButton.addEventListener("click", async function () {
            const codeBlocks = getCodeBlocks(text);
            const code = codeBlocks.length
                ? codeBlocks.map((block) => block.code).join("\n\n")
                : text;
            try {
                await navigator.clipboard.writeText(code);
                copyStatus.textContent = "Code copied.";
            } catch (error) {
                console.error("Error copying solution code:", error);
                copyStatus.textContent = "Could not copy code. Please try again.";
            }
        });

        actions.append(copyStatus, copyButton);
        message.appendChild(actions);
    }

    return message;
}

function scrollToLatestMessage() {
    conversationList.scrollTop = conversationList.scrollHeight;
}

solveButton.addEventListener("click", async function () {
    const problem = problemInput.value.trim();
    if (!problem) {
        problemError.textContent = "Please enter a problem statement.";
        return;
    }

    problemError.textContent = "";
    solveButton.disabled = true;
    document.getElementById("conversationEmpty")?.remove();

    const entry = {
        question: problem,
        answer: "",
        status: "loading"
    };
    conversationHistory.push(entry);
    conversationList.appendChild(createMessage("user", entry.question));

    const loadingMessage = createMessage("assistant", "Generating solution...", "loading");
    conversationList.appendChild(loadingMessage);
    scrollToLatestMessage();

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

        entry.answer = data.solution;
        entry.status = "success";
        loadingMessage.replaceWith(createMessage("assistant", entry.answer, entry.status));
    } catch (error) {
        console.error("Error:", error);
        entry.answer = error.name === "AbortError"
            ? "Error: The request took too long. Please try again."
            : `Error: ${error.message}`;
        entry.status = "error";
        loadingMessage.replaceWith(createMessage("assistant", entry.answer, entry.status));
    } finally {
        clearTimeout(timeoutId);
        solveButton.disabled = false;
        scrollToLatestMessage();
    }
});

problemInput.addEventListener("input", function () {
    problemError.textContent = "";
});
