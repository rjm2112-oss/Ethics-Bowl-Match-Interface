"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ENVIRONMENT_KEYS = Object.freeze({
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY"
});

function decodeQuotedValue(rawValue) {
    const raw = String(rawValue || "").trim();
    if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
        return raw.slice(1, -1);
    }
    if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
        return raw.slice(1, -1)
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\t/g, "\t")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\");
    }
    return raw.replace(/\s+#.*$/, "").trim();
}

function parseEnvFile(contents) {
    const parsed = {};
    const lines = String(contents || "").replace(/^\uFEFF/, "").split(/\r?\n/);
    for (const line of lines) {
        const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!match) continue;
        if (!Object.values(ENVIRONMENT_KEYS).includes(match[1])) continue;
        parsed[match[1]] = decodeQuotedValue(match[2]);
    }
    return parsed;
}

function readLocalEnv(filePath, readFileSync = fs.readFileSync) {
    if (!filePath) return {};
    try {
        return parseEnvFile(readFileSync(filePath, "utf8"));
    } catch (error) {
        if (error?.code === "ENOENT") return {};
        throw new Error("The local credential file could not be read.");
    }
}

function cleanCredential(value) {
    return typeof value === "string" ? value.trim() : "";
}

function resolveCredentialFilePath({ isPackaged = false, appDirectory = "", appImagePath = "" } = {}) {
    if (!isPackaged) return path.join(appDirectory, ".env.local");
    const cleanAppImagePath = cleanCredential(appImagePath);
    return cleanAppImagePath ? path.join(path.dirname(cleanAppImagePath), ".env") : null;
}

function loadCredentialEnvironment({ filePath = null, environment = process.env, readFileSync } = {}) {
    const fileValues = readLocalEnv(filePath, readFileSync);
    const result = {};
    for (const [provider, environmentKey] of Object.entries(ENVIRONMENT_KEYS)) {
        const processValue = cleanCredential(environment?.[environmentKey]);
        const fileValue = cleanCredential(fileValues[environmentKey]);
        result[provider] = processValue || fileValue;
    }
    return result;
}

module.exports = {
    ENVIRONMENT_KEYS,
    loadCredentialEnvironment,
    parseEnvFile,
    resolveCredentialFilePath
};
