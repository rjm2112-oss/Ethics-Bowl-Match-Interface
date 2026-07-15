"use strict";

const { pathToFileURL } = require("node:url");
const { validateCredentialKey, validateProvider } = require("./validation");

const CHANNELS = Object.freeze({
    credentialStatus: "credentials:status",
    credentialSave: "credentials:save",
    credentialRemove: "credentials:remove",
    aiGenerate: "ai:generate",
    audioSpeech: "audio:speech",
    audioTranscribe: "audio:transcribe"
});

function normalizedUrl(value) {
    try {
        const url = new URL(String(value || ""));
        url.hash = "";
        url.search = "";
        return url.href;
    } catch {
        return "";
    }
}

function createSenderValidator({ getWindow, allowedFilePath }) {
    const allowedUrl = normalizedUrl(pathToFileURL(allowedFilePath).href);
    return (event) => {
        const window = getWindow();
        const contents = window?.webContents;
        if (!contents || contents.isDestroyed?.()) return false;
        if (event?.sender !== contents) return false;
        if (event?.senderFrame?.parent) return false;
        const senderUrl = event?.senderFrame?.url || contents.getURL?.() || "";
        return normalizedUrl(senderUrl) === allowedUrl;
    };
}

function publicError(error) {
    let message = typeof error?.message === "string" ? error.message : "The request failed.";
    message = message
        .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
        .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
        .replace(/[\u0000-\u001F\u007F]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 800);
    return new Error(message || "The request failed.");
}

function registerIpcHandlers({ ipcMain, credentialStore, providerService, isTrustedSender }) {
    if (!ipcMain?.handle || !ipcMain?.removeHandler) throw new Error("IPC registration is unavailable.");
    if (!credentialStore || !providerService || typeof isTrustedSender !== "function") throw new Error("IPC dependencies are incomplete.");

    const secure = (handler) => async (event, payload) => {
        if (!isTrustedSender(event)) throw new Error("This request is not allowed.");
        try {
            return await handler(payload);
        } catch (error) {
            throw publicError(error);
        }
    };

    ipcMain.handle(CHANNELS.credentialStatus, secure(async (payload) => {
        if (payload != null) throw new Error("Credential status does not accept a request body.");
        return credentialStore.status();
    }));
    ipcMain.handle(CHANNELS.credentialSave, secure(async (payload) => {
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Credential request must be an object.");
        return credentialStore.save(validateProvider(payload.provider), validateCredentialKey(payload.key));
    }));
    ipcMain.handle(CHANNELS.credentialRemove, secure(async (payload) => {
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Credential request must be an object.");
        return credentialStore.remove(validateProvider(payload.provider));
    }));
    ipcMain.handle(CHANNELS.aiGenerate, secure((payload) => providerService.generate(payload)));
    ipcMain.handle(CHANNELS.audioSpeech, secure((payload) => providerService.speech(payload)));
    ipcMain.handle(CHANNELS.audioTranscribe, secure((payload) => providerService.transcribe(payload)));

    return () => {
        for (const channel of Object.values(CHANNELS)) ipcMain.removeHandler(channel);
    };
}

module.exports = {
    CHANNELS,
    createSenderValidator,
    publicError,
    registerIpcHandlers
};
