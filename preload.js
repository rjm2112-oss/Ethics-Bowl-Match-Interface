"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const api = Object.freeze({
    credentials: Object.freeze({
        status: () => ipcRenderer.invoke("credentials:status"),
        save: (provider, key) => ipcRenderer.invoke("credentials:save", { provider, key }),
        remove: (provider) => ipcRenderer.invoke("credentials:remove", { provider })
    }),
    ai: Object.freeze({
        generate: (request) => ipcRenderer.invoke("ai:generate", request)
    }),
    audio: Object.freeze({
        speech: (request) => ipcRenderer.invoke("audio:speech", request),
        transcribe: (request) => ipcRenderer.invoke("audio:transcribe", request)
    })
});

contextBridge.exposeInMainWorld("ethicsApi", api);
