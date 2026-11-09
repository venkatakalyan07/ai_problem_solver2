const problemInput = document.getElementById("problem");
const languageInput = document.getElementById("language");
const solveForm = document.getElementById("solveForm");
const solveButton = document.getElementById("solveBtn");
const newChatButton = document.getElementById("newChatBtn");
const problemError = document.getElementById("problemError");
const appError = document.getElementById("appError");
const historyStatus = document.getElementById("historyStatus");
const historyList = document.getElementById("historyList");
const conversationList = document.getElementById("conversationList");
const conversationDescription = document.getElementById("conversationDescription");

let activeConversationId = null;
let isSubmitting = false;
let conversationLoadVersion = 0;

// Extract fenced code blocks so they can be displayed or copied separately.
function getCodeBlocks(text) {
    return [...text.matchAll(/```([^\r\n]*)\r?\n([\s\S]*?)```|~~~([^\r\n]*)\r?\n([\s\S]*?)~~~/g)]
        .map((match) => ({
            language: (match[1] ?? match[3]).trim(),
            code: match[2] ?? match[4]
        }));
}

// Render plain-text sections and fenced code blocks as separate readable elements.
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

async function requestJson(url, options) {
    const response = await fetch(url, options);
    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error("The server returned an invalid response.");
    }
    if (!response.ok) {
        const error = new Error(data.error || "The request could not be completed.");
        error.responseData = data;
        throw error;
    }
    return data;
}

// Build one user or assistant chat entry, including success/error-specific content.
function createMessage(role, text, status, language) {
    const message = document.createElement("article");
    message.className = `chat-message ${role}-message`;

    const label = document.createElement("h3");
    label.className = "message-label";
    label.textContent = role === "user"
        ? language ? `You · ${language}` : "You"
        : "AI assistant";
    message.appendChild(label);

    const body = document.createElement("div");
    body.className = "message-body";

    if (role === "assistant" && status === "success") {
        appendFormattedResponse(body, text);
    } else {
        const paragraph = document.createElement("p");
        paragraph.className =
            status === "error" ? "response-text error-text" : "response-text";
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

function renderEmptyConversation(message) {
    conversationList.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "conversation-empty";
    empty.textContent = message;
    conversationList.appendChild(empty);
}

function renderMessages(messages) {
    conversationList.replaceChildren();
    if (!messages.length) {
        renderEmptyConversation("This conversation has no messages yet.");
        return;
    }

    for (const message of messages) {
        if (
            (message.role !== "user" && message.role !== "assistant") ||
            typeof message.content !== "string"
        ) {
            continue;
        }
        conversationList.appendChild(
            createMessage(message.role, message.content, "success", message.language)
        );
    }
    scrollToLatestMessage();
}

function scrollToLatestMessage() {
    conversationList.scrollTop = conversationList.scrollHeight;
}

function formatUpdatedAt(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderHistory(conversations) {
    historyList.replaceChildren();
    for (const conversation of conversations) {
        const entry = document.createElement("li");
        entry.className = "history-entry";

        const selectButton = document.createElement("button");
        selectButton.type = "button";
        selectButton.className = "history-select";
        selectButton.textContent = `${conversation.title || "Untitled conversation"}${formatUpdatedAt(conversation.updated_at) ? ` · ${formatUpdatedAt(conversation.updated_at)}` : ""}`;
        selectButton.setAttribute("data-conversation-id", conversation.id);
        selectButton.setAttribute(
            "aria-current",
            conversation.id === activeConversationId ? "true" : "false"
        );
        selectButton.disabled = isSubmitting;
        selectButton.addEventListener("click", () => selectConversation(conversation));

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "history-delete";
        deleteButton.textContent = "Delete";
        deleteButton.setAttribute(
            "aria-label",
            `Delete ${conversation.title || "conversation"}`
        );
        deleteButton.disabled = isSubmitting;
        deleteButton.addEventListener("click", () => deleteConversation(conversation));

        entry.append(selectButton, deleteButton);
        historyList.appendChild(entry);
    }
}

async function refreshHistory() {
    historyStatus.textContent = "Loading saved conversations...";
    try {
        const data = await requestJson("/api/conversations");
        const conversations = Array.isArray(data.conversations) ? data.conversations : [];
        renderHistory(conversations);
        historyStatus.textContent = conversations.length
            ? ""
            : "No saved conversations yet.";
    } catch (error) {
        console.error("Error loading conversation history:", error);
        historyStatus.textContent =
            "Conversation history could not be loaded. Check the server and database settings.";
    }
}

async function selectConversation(conversation) {
    if (isSubmitting) return;
    activeConversationId = conversation.id;
    conversationLoadVersion += 1;
    const loadVersion = conversationLoadVersion;
    appError.textContent = "";
    conversationDescription.textContent = conversation.title || "Saved conversation";
    renderEmptyConversation("Loading messages...");
    renderHistoryForActiveConversation();

    try {
        const data = await requestJson(
            `/api/conversations/${encodeURIComponent(conversation.id)}/messages`
        );
        if (
            loadVersion !== conversationLoadVersion ||
            activeConversationId !== conversation.id
        ) {
            return;
        }
        renderMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (error) {
        if (loadVersion !== conversationLoadVersion) return;
        console.error("Error loading conversation messages:", error);
        renderEmptyConversation("Messages could not be loaded.");
        appError.textContent = error.message;
    }
}

function renderHistoryForActiveConversation() {
    for (const entry of historyList.children) {
        const button = entry.querySelector(".history-select");
        const deleteButton = entry.querySelector(".history-delete");
        const conversationId = button?.getAttribute("data-conversation-id");
        if (button) {
            button.setAttribute(
                "aria-current",
                conversationId === activeConversationId ? "true" : "false"
            );
        }
        if (deleteButton) {
            deleteButton.disabled = isSubmitting;
        }
    }
}

function clearActiveConversation() {
    activeConversationId = null;
    conversationLoadVersion += 1;
    conversationDescription.textContent = "Your questions and solutions will appear here.";
    appError.textContent = "";
    problemError.textContent = "";
    problemInput.value = "";
    renderEmptyConversation("Ask a programming question to start a conversation.");
    renderHistoryForActiveConversation();
}

async function deleteConversation(conversation) {
    if (isSubmitting) return;
    const title = conversation.title || "this conversation";
    if (!window.confirm(`Delete "${title}" and all of its messages? This cannot be undone.`)) {
        return;
    }

    appError.textContent = "";
    try {
        await requestJson(`/api/conversations/${encodeURIComponent(conversation.id)}`, {
            method: "DELETE"
        });
        if (activeConversationId === conversation.id) {
            clearActiveConversation();
        }
        await refreshHistory();
    } catch (error) {
        console.error("Error deleting conversation:", error);
        appError.textContent = error.message;
    }
}

function setBusy(busy) {
    isSubmitting = busy;
    solveButton.disabled = busy;
    newChatButton.disabled = busy;
    problemInput.disabled = busy;
    languageInput.disabled = busy;
    for (const entry of historyList.children) {
        for (const button of entry.querySelectorAll("button")) {
            button.disabled = busy;
        }
    }
}

newChatButton.addEventListener("click", clearActiveConversation);

solveForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (isSubmitting) return;

    const problem = problemInput.value.trim();
    if (!problem) {
        problemError.textContent = "Please enter a problem statement.";
        return;
    }

    problemError.textContent = "";
    appError.textContent = "";
    setBusy(true);

    const userMessage = createMessage("user", problem, "success", languageInput.value);
    if (conversationList.querySelector(".conversation-empty")) {
        conversationList.replaceChildren();
    }
    conversationList.appendChild(userMessage);

    const loadingMessage = createMessage("assistant", "Generating solution...", "loading");
    conversationList.appendChild(loadingMessage);
    scrollToLatestMessage();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 250_000);
    try {
        const data = await requestJson("/api/solve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                problem,
                language: languageInput.value,
                conversationId: activeConversationId
            }),
            signal: controller.signal
        });

        if (typeof data.solution !== "string" || typeof data.conversationId !== "string") {
            throw new Error("The server returned an incomplete solution response.");
        }
        activeConversationId = data.conversationId;
        conversationDescription.textContent = "Saved conversation";
        loadingMessage.replaceWith(createMessage("assistant", data.solution, "success"));
        renderHistoryForActiveConversation();
        scrollToLatestMessage();
        await refreshHistory();

        try {
            const messagesData = await requestJson(
                `/api/conversations/${encodeURIComponent(activeConversationId)}/messages`
            );
            renderMessages(Array.isArray(messagesData.messages) ? messagesData.messages : []);
        } catch (error) {
            console.error("Error refreshing saved messages:", error);
            appError.textContent =
                "The solution was saved, but the conversation could not be refreshed.";
        }
    } catch (error) {
        console.error("Error solving problem:", error);
        const responseData = error.responseData;
        if (typeof responseData?.conversationId === "string") {
            activeConversationId = responseData.conversationId;
        }
        const friendlyMessage = error.name === "AbortError"
            ? "The request took too long. Please try again."
            : error.message;
        appError.textContent = friendlyMessage;
        loadingMessage.replaceWith(
            createMessage("assistant", friendlyMessage, "error")
        );
        renderHistoryForActiveConversation();

        if (activeConversationId) {
            await refreshHistory();
            try {
                const messagesData = await requestJson(
                    `/api/conversations/${encodeURIComponent(activeConversationId)}/messages`
                );
                renderMessages(Array.isArray(messagesData.messages) ? messagesData.messages : []);
            } catch (refreshError) {
                console.error("Error refreshing saved messages:", refreshError);
            }
        }
    } finally {
        clearTimeout(timeoutId);
        setBusy(false);
        scrollToLatestMessage();
    }
});

problemInput.addEventListener("input", function () {
    problemError.textContent = "";
});

refreshHistory();
