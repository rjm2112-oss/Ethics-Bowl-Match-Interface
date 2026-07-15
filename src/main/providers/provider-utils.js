"use strict";

function redactSecrets(value) {
    return String(value || "")
        .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
        .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted]");
}

function cleanMessage(value, maximumLength = 700) {
    return redactSecrets(value).replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maximumLength);
}

async function createApiError(response) {
    const status = Number(response?.status) || 0;
    let providerMessage = "";
    try {
        const raw = await response.text();
        try {
            const parsed = JSON.parse(raw);
            providerMessage = parsed?.error?.message || parsed?.message || "";
        } catch {
            providerMessage = raw;
        }
    } catch {}

    if (status === 401 || status === 403) return new Error("The AI provider rejected the configured API key.");
    if (status === 429) return new Error("The AI provider is rate-limiting requests. Try again shortly.");
    const cleaned = cleanMessage(providerMessage);
    if (cleaned) return new Error(`The AI provider rejected the request (HTTP ${status || "error"}): ${cleaned}`);
    if (status >= 500) return new Error("The AI provider is temporarily unavailable.");
    return new Error(`The AI provider request failed${status ? ` (HTTP ${status})` : ""}.`);
}

function isRetryableNetworkError(error) {
    if (!error || error.name === "AbortError") return false;
    if (error instanceof TypeError) return true;
    const message = String(error.message || "").toLowerCase();
    return message.includes("fetch") || message.includes("network") || message.includes("connection") || message.includes("socket");
}

function retryDelayMs(attempt, response) {
    const retryAfter = response?.headers?.get?.("retry-after");
    if (retryAfter) {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds) && seconds >= 0) return Math.min(5000, seconds * 1000);
        const date = Date.parse(retryAfter);
        if (Number.isFinite(date)) return Math.min(5000, Math.max(0, date - Date.now()));
    }
    return Math.min(1600, 350 * (2 ** Math.max(0, attempt - 1)));
}

async function fetchWithRetries({ fetchImpl, url, makeOptions, retryStatuses, sleep, maxAttempts = 3, requestTimeoutMs = 90000 }) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let response;
        let timedOut = false;
        let timeoutId = null;
        const controller = new AbortController();
        try {
            const options = makeOptions();
            timeoutId = setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, requestTimeoutMs);
            timeoutId.unref?.();
            response = await fetchImpl(url, { ...options, signal: controller.signal });
        } catch (error) {
            if (timedOut) throw new Error("The AI provider request timed out. Try again.");
            if (!isRetryableNetworkError(error) || attempt >= maxAttempts) {
                throw new Error("The AI provider could not be reached.");
            }
            await sleep(retryDelayMs(attempt));
            continue;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }

        if (!response || typeof response.ok !== "boolean") throw new Error("The AI provider returned an invalid response.");
        if (!response.ok && retryStatuses.has(Number(response.status)) && attempt < maxAttempts) {
            const delay = retryDelayMs(attempt, response);
            try { await response.arrayBuffer(); } catch {}
            await sleep(delay);
            continue;
        }
        return response;
    }
    throw new Error("The AI provider request failed.");
}

async function postJsonWithRetries({ fetchImpl, url, headers, body, retryStatuses, sleep, maxAttempts = 3, requestTimeoutMs }) {
    return fetchWithRetries({
        fetchImpl,
        url,
        makeOptions: () => ({
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify(body)
        }),
        retryStatuses,
        sleep,
        maxAttempts,
        requestTimeoutMs
    });
}

function stripJsonFence(raw) {
    return String(raw || "").trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
}

function tryParseJson(raw) {
    const text = stripJsonFence(raw);
    if (!text) return null;
    try { return JSON.parse(text); } catch {}
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) {
        try { return JSON.parse(text.slice(first, last + 1)); } catch {}
    }
    return null;
}

const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

module.exports = {
    cleanMessage,
    createApiError,
    defaultSleep,
    fetchWithRetries,
    postJsonWithRetries,
    tryParseJson
};
