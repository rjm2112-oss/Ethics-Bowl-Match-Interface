"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { CredentialStore, STORE_FILE_NAME } = require("../src/main/credential-store");

function fakeSafeStorage(available = true) {
    return {
        isEncryptionAvailable: () => available,
        encryptString: (value) => Buffer.from(`encrypted:${Buffer.from(value).toString("base64")}`),
        decryptString: (value) => Buffer.from(String(value).replace(/^encrypted:/, ""), "base64").toString("utf8")
    };
}

test("stored encrypted credentials override environment credentials and never appear in status", async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ethics-credentials-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const store = new CredentialStore({
        userDataPath: directory,
        safeStorage: fakeSafeStorage(),
        environment: { openai: "environment-openai", anthropic: "environment-anthropic" }
    });

    assert.deepEqual(await store.status(), [
        { provider: "openai", configured: true, source: "environment" },
        { provider: "anthropic", configured: true, source: "environment" }
    ]);

    await store.save("openai", "stored-openai-value");
    assert.equal(await store.get("openai"), "stored-openai-value");
    assert.deepEqual(await store.statusFor("openai"), {
        provider: "openai",
        configured: true,
        source: "stored"
    });

    const rawFile = await fs.readFile(path.join(directory, STORE_FILE_NAME), "utf8");
    assert.equal(rawFile.includes("stored-openai-value"), false);
    assert.equal(rawFile.includes("environment-openai"), false);

    await store.remove("openai");
    assert.equal(await store.get("openai"), "environment-openai");
    assert.deepEqual(await store.statusFor("openai"), {
        provider: "openai",
        configured: true,
        source: "environment"
    });
});

test("saving fails cleanly if secure storage is unavailable", async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ethics-credentials-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const store = new CredentialStore({ userDataPath: directory, safeStorage: fakeSafeStorage(false) });

    await assert.rejects(store.save("anthropic", "anthropic-test-value"), /Secure credential storage is unavailable/);
    assert.deepEqual(await store.statusFor("anthropic"), {
        provider: "anthropic",
        configured: false,
        source: "none"
    });
});

test("saving refuses Electron's insecure Linux basic_text backend", async (t) => {
    if (process.platform !== "linux") return;
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ethics-credentials-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const safeStorage = fakeSafeStorage(true);
    safeStorage.getSelectedStorageBackend = () => "basic_text";
    const store = new CredentialStore({ userDataPath: directory, safeStorage });

    await assert.rejects(store.save("openai", "openai-test-value"), /Secure credential storage is unavailable/);
});

test("credential file loading is single-flight", async () => {
    let readCount = 0;
    let releaseRead;
    const readGate = new Promise((resolve) => { releaseRead = resolve; });
    const store = new CredentialStore({
        userDataPath: "/virtual",
        safeStorage: fakeSafeStorage(),
        fsPromises: {
            readFile: async () => {
                readCount += 1;
                await readGate;
                throw Object.assign(new Error("missing"), { code: "ENOENT" });
            }
        }
    });
    const first = store.load();
    const second = store.load();
    releaseRead();
    assert.deepEqual(await Promise.all([first, second]), [
        { version: 1, credentials: {} },
        { version: 1, credentials: {} }
    ]);
    assert.equal(readCount, 1);
});

test("a corrupt stored value falls back to the environment", async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ethics-credentials-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    await fs.writeFile(path.join(directory, STORE_FILE_NAME), JSON.stringify({
        version: 1,
        credentials: { anthropic: "not-valid-encrypted-data" }
    }));
    const safeStorage = fakeSafeStorage();
    safeStorage.decryptString = () => { throw new Error("cannot decrypt"); };
    const store = new CredentialStore({
        userDataPath: directory,
        safeStorage,
        environment: { anthropic: "environment-anthropic" }
    });

    assert.equal(await store.get("anthropic"), "environment-anthropic");
    assert.equal((await store.statusFor("anthropic")).source, "environment");
});
