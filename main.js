"use strict";

const { app, BrowserWindow, ipcMain, safeStorage, session } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { CredentialStore } = require("./src/main/credential-store");
const { loadCredentialEnvironment, resolveCredentialFilePath } = require("./src/main/env");
const { createSenderValidator, registerIpcHandlers } = require("./src/main/ipc");
const { createProviderService } = require("./src/main/provider-service");

const RENDERER_FILE = path.join(__dirname, "debater.html");
const RENDERER_URL = pathToFileURL(RENDERER_FILE).href;
const TIMING_TEST_MODE = process.argv.includes("--timing-test");
const TIMING_TEST_AUTO_START = TIMING_TEST_MODE && process.argv.includes("--auto-start");
const TIMING_TEST_LIMIT = TIMING_TEST_MODE
    ? Math.max(0, Math.min(50, Number.parseInt(
        process.argv.find((argument) => argument.startsWith("--timing-test-limit="))?.split("=")[1] || "0",
        10
    ) || 0))
    : 0;
const TIMING_TEST_LANGUAGE = TIMING_TEST_MODE
    ? process.argv.find((argument) => argument.startsWith("--lang="))?.split("=")[1]
    : "";
const ALLOWED_NAVIGATION_URLS = new Set([
    RENDERER_FILE,
    path.join(__dirname, "instructions.html")
].map((filePath) => pathToFileURL(filePath).href));
let mainWindow = null;
let removeIpcHandlers = null;

function isLocalFileOrigin(value) {
    if (!value || value === "null") return true;
    try { return new URL(value).protocol === "file:"; } catch { return false; }
}

function isTrustedWebContents(webContents) {
    if (!mainWindow || mainWindow.isDestroyed() || webContents !== mainWindow.webContents) return false;
    try {
        const current = new URL(webContents.getURL());
        current.hash = "";
        current.search = "";
        return current.href === RENDERER_URL;
    } catch {
        return false;
    }
}

function isAudioOnlyRequest(details) {
    const mediaTypes = details?.mediaTypes;
    return Array.isArray(mediaTypes) && mediaTypes.length > 0 && mediaTypes.every((type) => type === "audio");
}

function configureMediaPermissions(electronSession) {
    electronSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
        const allowed = permission === "media"
            && isTrustedWebContents(webContents)
            && isLocalFileOrigin(details?.securityOrigin)
            && isLocalFileOrigin(details?.requestingUrl)
            && isAudioOnlyRequest(details);
        callback(allowed);
    });

    electronSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        if (permission !== "media" || !isTrustedWebContents(webContents) || !isLocalFileOrigin(requestingOrigin)) return false;
        if (details?.mediaType && details.mediaType !== "audio") return false;
        return true;
    });
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1600,
        height: 1000,
        minWidth: 1200,
        minHeight: 800,
        autoHideMenuBar: true,
        title: "Ethics Bowl Match",
        icon: path.join(__dirname, "assets", "app-icon.png"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            webviewTag: false
        }
    });

    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event, targetUrl) => {
        let normalizedTarget = "";
        try {
            const target = new URL(targetUrl);
            target.hash = "";
            target.search = "";
            normalizedTarget = target.href;
        } catch {}
        if (!ALLOWED_NAVIGATION_URLS.has(normalizedTarget)) event.preventDefault();
    });
    win.webContents.on("will-attach-webview", (event) => event.preventDefault());
    if (TIMING_TEST_MODE) {
        win.webContents.on("console-message", (event) => {
            const message = String(event?.message || "");
            if (message.startsWith("[timing-test-result]")) console.log(message);
        });
    }
    win.on("closed", () => {
        if (mainWindow === win) mainWindow = null;
    });

    void win.loadFile(RENDERER_FILE, TIMING_TEST_MODE
        ? { query: {
            timingTest: "1",
            ...(TIMING_TEST_AUTO_START ? { autoStart: "1" } : {}),
            ...(TIMING_TEST_LIMIT ? { timingLimit: String(TIMING_TEST_LIMIT) } : {}),
            ...(/^fr(?:-|$)/i.test(TIMING_TEST_LANGUAGE || "") ? { lang: "fr-ca" } : {}),
            ...(/^en(?:-|$)/i.test(TIMING_TEST_LANGUAGE || "") ? { lang: "en" } : {})
        } }
        : undefined);
    return win;
}

app.whenReady().then(() => {
    const environment = loadCredentialEnvironment({
        filePath: resolveCredentialFilePath({
            isPackaged: app.isPackaged,
            appDirectory: __dirname,
            appImagePath: process.env.APPIMAGE
        }),
        environment: process.env
    });
    const credentialStore = new CredentialStore({
        userDataPath: app.getPath("userData"),
        safeStorage,
        environment
    });
    const providerService = createProviderService({ credentialStore });
    const isTrustedSender = createSenderValidator({
        getWindow: () => mainWindow,
        allowedFilePath: RENDERER_FILE
    });
    removeIpcHandlers = registerIpcHandlers({
        ipcMain,
        credentialStore,
        providerService,
        isTrustedSender
    });

    configureMediaPermissions(session.defaultSession);
    mainWindow = createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
});

app.on("before-quit", () => {
    if (removeIpcHandlers) {
        removeIpcHandlers();
        removeIpcHandlers = null;
    }
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
