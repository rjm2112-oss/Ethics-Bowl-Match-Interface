"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
    CHANNELS,
    createSenderValidator,
    publicError,
    registerIpcHandlers
} = require("../src/main/ipc");

function fakeIpcMain() {
    const handlers = new Map();
    return {
        handlers,
        handle: (channel, handler) => handlers.set(channel, handler),
        removeHandler: (channel) => handlers.delete(channel)
    };
}

test("sender validation requires the expected window, top frame, and renderer file", () => {
    const rendererPath = path.join(process.cwd(), "debater.html");
    const mainFrame = { url: `${pathToFileURL(rendererPath).href}?locale=fr#top` };
    const webContents = {
        mainFrame,
        isDestroyed: () => false,
        getURL: () => mainFrame.url
    };
    const window = { webContents };
    const validate = createSenderValidator({ getWindow: () => window, allowedFilePath: rendererPath });

    assert.equal(validate({ sender: webContents, senderFrame: mainFrame }), true);
    assert.equal(validate({ sender: webContents, senderFrame: { url: mainFrame.url, parent: null } }), true);
    assert.equal(validate({ sender: webContents, senderFrame: { url: mainFrame.url, parent: {} } }), false);
    assert.equal(validate({ sender: {}, senderFrame: mainFrame }), false);
    mainFrame.url = pathToFileURL(path.join(process.cwd(), "instructions.html")).href;
    assert.equal(validate({ sender: webContents, senderFrame: mainFrame }), false);
});

test("IPC exposes only fixed handlers, rejects untrusted calls, and validates credential payloads", async () => {
    const ipcMain = fakeIpcMain();
    const calls = [];
    const credentialStore = {
        status: async () => [{ provider: "openai", configured: false, source: "none" }],
        save: async (provider) => ({ provider, configured: true, source: "stored" }),
        remove: async (provider) => ({ provider, configured: false, source: "none" })
    };
    const providerService = {
        generate: async (payload) => { calls.push(["generate", payload]); return "text"; },
        speech: async (payload) => { calls.push(["speech", payload]); return { bytes: new Uint8Array([1]), mimeType: "audio/mpeg" }; },
        transcribe: async (payload) => { calls.push(["transcribe", payload]); return { text: "spoken" }; }
    };
    const dispose = registerIpcHandlers({
        ipcMain,
        credentialStore,
        providerService,
        isTrustedSender: (event) => event?.trusted === true
    });

    assert.deepEqual([...ipcMain.handlers.keys()].sort(), Object.values(CHANNELS).sort());
    await assert.rejects(ipcMain.handlers.get(CHANNELS.aiGenerate)({ trusted: false }, {}), /not allowed/);
    assert.equal(await ipcMain.handlers.get(CHANNELS.aiGenerate)({ trusted: true }, { model: "test" }), "text");
    await assert.rejects(
        ipcMain.handlers.get(CHANNELS.credentialSave)({ trusted: true }, { provider: "openai", key: "short" }),
        /not valid/
    );
    assert.deepEqual(await ipcMain.handlers.get(CHANNELS.credentialRemove)({ trusted: true }, { provider: "anthropic" }), {
        provider: "anthropic",
        configured: false,
        source: "none"
    });
    assert.deepEqual(calls, [["generate", { model: "test" }]]);

    dispose();
    assert.equal(ipcMain.handlers.size, 0);
});

test("public IPC errors redact credential-shaped text", () => {
    const sanitized = publicError(new Error("Bearer secret-token and sk-example_secret_123456 were rejected"));
    assert.equal(sanitized.message.includes("secret-token"), false);
    assert.equal(sanitized.message.includes("sk-example"), false);
});
