"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { validateCredentialKey, validateProvider } = require("./validation");

const STORE_FILE_NAME = "provider-credentials.json";

function emptyStore() {
    return { version: 1, credentials: {} };
}

function normalizeStore(parsed) {
    if (!parsed || parsed.version !== 1 || !parsed.credentials || typeof parsed.credentials !== "object") {
        return emptyStore();
    }
    const credentials = {};
    for (const provider of ["openai", "anthropic"]) {
        const encrypted = parsed.credentials[provider];
        if (typeof encrypted === "string" && encrypted) credentials[provider] = encrypted;
    }
    return { version: 1, credentials };
}

class CredentialStore {
    constructor({ userDataPath, safeStorage, environment = {}, fsPromises = fs.promises } = {}) {
        if (!userDataPath || typeof userDataPath !== "string") throw new Error("A user data path is required.");
        if (!safeStorage) throw new Error("Secure storage is required.");
        this.filePath = path.join(userDataPath, STORE_FILE_NAME);
        this.safeStorage = safeStorage;
        this.environment = {
            openai: typeof environment.openai === "string" ? environment.openai.trim() : "",
            anthropic: typeof environment.anthropic === "string" ? environment.anthropic.trim() : ""
        };
        this.fs = fsPromises;
        this.cache = null;
        this.loadPromise = null;
        this.mutation = Promise.resolve();
    }

    encryptionAvailable() {
        try {
            if (process.platform === "linux"
                && typeof this.safeStorage.getSelectedStorageBackend === "function"
                && this.safeStorage.getSelectedStorageBackend() === "basic_text") {
                return false;
            }
            return this.safeStorage.isEncryptionAvailable() === true;
        } catch {
            return false;
        }
    }

    async load() {
        if (this.cache) return this.cache;
        if (this.loadPromise) return this.loadPromise;
        let pending = null;
        pending = (async () => {
            try {
                const raw = await this.fs.readFile(this.filePath, "utf8");
                this.cache = normalizeStore(JSON.parse(raw));
            } catch {
                this.cache = emptyStore();
            }
            return this.cache;
        })().finally(() => {
            if (this.loadPromise === pending) this.loadPromise = null;
        });
        this.loadPromise = pending;
        return pending;
    }

    decrypt(encoded) {
        if (!encoded || !this.encryptionAvailable()) return "";
        try {
            const encrypted = Buffer.from(encoded, "base64");
            if (!encrypted.length) return "";
            return validateCredentialKey(this.safeStorage.decryptString(encrypted));
        } catch {
            return "";
        }
    }

    async resolve(provider) {
        const cleanProvider = validateProvider(provider);
        await this.mutation;
        const store = await this.load();
        const stored = this.decrypt(store.credentials[cleanProvider]);
        if (stored) return { key: stored, source: "stored" };
        const fallback = this.environment[cleanProvider];
        if (fallback) return { key: fallback, source: "environment" };
        return { key: "", source: "none" };
    }

    async get(provider) {
        return (await this.resolve(provider)).key;
    }

    async statusFor(provider) {
        const cleanProvider = validateProvider(provider);
        const resolved = await this.resolve(cleanProvider);
        return { provider: cleanProvider, configured: !!resolved.key, source: resolved.source };
    }

    async status() {
        return Promise.all(["openai", "anthropic"].map((provider) => this.statusFor(provider)));
    }

    async write(store) {
        const directory = path.dirname(this.filePath);
        const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
        await this.fs.mkdir(directory, { recursive: true, mode: 0o700 });
        try {
            await this.fs.writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
            await this.fs.rename(temporaryPath, this.filePath);
            try { await this.fs.chmod(this.filePath, 0o600); } catch {}
        } catch (error) {
            try { await this.fs.unlink(temporaryPath); } catch {}
            throw error;
        }
    }

    mutate(operation) {
        const run = this.mutation.then(operation, operation);
        this.mutation = run.catch(() => {});
        return run;
    }

    async save(provider, key) {
        const cleanProvider = validateProvider(provider);
        const cleanKey = validateCredentialKey(key);
        return this.mutate(async () => {
            if (!this.encryptionAvailable()) throw new Error("Secure credential storage is unavailable on this system.");
            let encrypted;
            try {
                encrypted = this.safeStorage.encryptString(cleanKey);
            } catch {
                throw new Error("The API key could not be encrypted.");
            }
            if (!encrypted || !Buffer.from(encrypted).length) throw new Error("The API key could not be encrypted.");
            const current = await this.load();
            const store = {
                version: 1,
                credentials: {
                    ...current.credentials,
                    [cleanProvider]: Buffer.from(encrypted).toString("base64")
                }
            };
            await this.write(store);
            this.cache = store;
            return { provider: cleanProvider, configured: true, source: "stored" };
        });
    }

    async remove(provider) {
        const cleanProvider = validateProvider(provider);
        return this.mutate(async () => {
            const current = await this.load();
            if (current.credentials[cleanProvider]) {
                const credentials = { ...current.credentials };
                delete credentials[cleanProvider];
                const store = { version: 1, credentials };
                await this.write(store);
                this.cache = store;
            }
            const fallback = this.environment[cleanProvider];
            return {
                provider: cleanProvider,
                configured: !!fallback,
                source: fallback ? "environment" : "none"
            };
        });
    }
}

module.exports = {
    CredentialStore,
    STORE_FILE_NAME
};
