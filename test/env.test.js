"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
    loadCredentialEnvironment,
    parseEnvFile,
    resolveCredentialFilePath
} = require("../src/main/env");

test("parseEnvFile reads only supported credentials without evaluating content", () => {
    const parsed = parseEnvFile([
        "OPENAI_API_KEY='openai-test-value'",
        "export ANTHROPIC_API_KEY=anthropic-test-value # local",
        "UNRELATED=do-not-load",
        "BROKEN LINE"
    ].join("\n"));

    assert.deepEqual(parsed, {
        OPENAI_API_KEY: "openai-test-value",
        ANTHROPIC_API_KEY: "anthropic-test-value"
    });
});

test("process environment credentials override the development file", () => {
    const result = loadCredentialEnvironment({
        filePath: "/fake/.env.local",
        environment: { OPENAI_API_KEY: "process-openai" },
        readFileSync: () => "OPENAI_API_KEY=file-openai\nANTHROPIC_API_KEY=file-anthropic\n"
    });

    assert.deepEqual(result, { openai: "process-openai", anthropic: "file-anthropic" });
});

test("a missing development credential file is harmless", () => {
    const result = loadCredentialEnvironment({
        filePath: "/missing/.env.local",
        environment: {},
        readFileSync: () => {
            const error = new Error("missing");
            error.code = "ENOENT";
            throw error;
        }
    });
    assert.deepEqual(result, { openai: "", anthropic: "" });
});

test("a packaged AppImage uses a .env file beside the AppImage", () => {
    const appsDirectory = path.resolve("/home/user/apps");
    const appImagePath = path.join(appsDirectory, "Ethics Bowl Match.AppImage");
    assert.equal(resolveCredentialFilePath({
        isPackaged: true,
        appDirectory: path.resolve("/packaged/app"),
        appImagePath: `  ${appImagePath}  `
    }), path.join(appsDirectory, ".env"));
});

test("credential file resolution preserves safe development and packaged defaults", () => {
    const appDirectory = path.resolve("/development/app");
    assert.equal(resolveCredentialFilePath({
        isPackaged: false,
        appDirectory,
        appImagePath: ""
    }), path.join(appDirectory, ".env.local"));
    assert.equal(resolveCredentialFilePath({
        isPackaged: true,
        appDirectory: "/packaged/app",
        appImagePath: ""
    }), null);
});
