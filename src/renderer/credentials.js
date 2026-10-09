(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer.credentials=api;}})(typeof globalThis==="object"?globalThis:this,function(){
    "use strict";
    const dependencies=Object.freeze({
    "services": [
        "l",
        "refreshControls",
        "sanitizeText",
        "setStatus",
        "startMatch",
        "titleCase"
    ],
    "settings": [
        "AVAILABLE_MATCH_MODELS",
        "CREDENTIAL_STATUS_TIMEOUT_MS",
        "DEFAULT_PARTICIPANT_MODEL",
        "MODEL_CATALOG",
        "TIMING_TEST_AUTO_START",
        "credentialState",
        "initialCredentialDialogShown"
    ],
    "ui": [
        "apiKeyDialogCloseBtnEl",
        "apiKeyDialogCopyEl",
        "apiKeyDialogEl",
        "apiKeyDialogEyebrowEl",
        "apiKeyDialogTitleEl",
        "apiKeyStatusBadgeEl",
        "credentialUiByProvider",
        "instructionsBadgeEl",
        "instructionsLinkEl",
        "localeToggleBtnEl",
        "manageApiKeysBtnEl",
        "modelSelectEl",
        "participantOneModelSelectEl",
        "statusLineEl"
    ],
    "platform": [
        "document",
        "localStorage",
        "window"
    ]
});
    function create(context) {
        function ensureApiKeyUi() {
            context.ui.manageApiKeysBtnEl = context.platform.document.getElementById("manageApiKeysBtn");
            if (!context.ui.manageApiKeysBtnEl) {
                const host = context.ui.localeToggleBtnEl?.parentElement || context.ui.instructionsLinkEl?.parentElement;
                if (host) {
                    context.ui.manageApiKeysBtnEl = context.platform.document.createElement("button");
                    context.ui.manageApiKeysBtnEl.type = "button";
                    context.ui.manageApiKeysBtnEl.id = "manageApiKeysBtn";
                    context.ui.manageApiKeysBtnEl.className = "nav-btn";
                    if (context.ui.localeToggleBtnEl?.parentElement === host) host.insertBefore(context.ui.manageApiKeysBtnEl, context.ui.localeToggleBtnEl);
                    else host.appendChild(context.ui.manageApiKeysBtnEl);
                }
            }

            context.ui.apiKeyStatusBadgeEl = context.platform.document.getElementById("apiKeyStatusBadge");
            if (!context.ui.apiKeyStatusBadgeEl) {
                const badge = context.platform.document.createElement("span");
                badge.id = "apiKeyStatusBadge";
                badge.className = "status-chip inactive";
                if (context.ui.instructionsBadgeEl?.parentElement) context.ui.instructionsBadgeEl.insertAdjacentElement("afterend", badge);
                else if (context.ui.statusLineEl?.parentElement) context.ui.statusLineEl.parentElement.insertBefore(badge, context.ui.statusLineEl);
                context.ui.apiKeyStatusBadgeEl = badge;
            }

            context.ui.apiKeyDialogEl = context.platform.document.getElementById("apiKeyDialog");
            if (!context.ui.apiKeyDialogEl) {
                const dialog = context.platform.document.createElement("dialog");
                dialog.id = "apiKeyDialog";
                dialog.className = "local-api-key-dialog";
                dialog.innerHTML = `
                <div class="local-api-key-dialog-card">
                  <div class="local-api-key-dialog-head">
                    <div>
                      <div id="apiKeyDialogEyebrow" class="eyebrow"></div>
                      <h2 id="apiKeyDialogTitle"></h2>
                      <p id="apiKeyDialogCopy" class="hero-copy"></p>
                    </div>
                    <button type="button" id="apiKeyDialogCloseBtn" class="ghost-btn"></button>
                  </div>
                  <div class="credential-provider-grid">
                    ${["openai", "anthropic"].map((provider) => `
                      <section class="local-api-key-section credential-provider-card" data-credential-provider="${provider}">
                        <div class="credential-provider-head">
                          <div class="phase-title" data-credential-name></div>
                          <div class="status-chip inactive" data-credential-status></div>
                        </div>
                        <div class="small-note" data-credential-source></div>
                        <label class="credential-input-label" for="${provider}CredentialInput" data-credential-input-label></label>
                        <input id="${provider}CredentialInput" data-credential-input type="password" autocomplete="new-password" spellcheck="false" />
                        <div class="button-cluster">
                          <button type="button" class="primary-btn" data-credential-save></button>
                          <button type="button" class="ghost-btn" data-credential-remove></button>
                        </div>
                      </section>
                    `).join("")}
                  </div>
                </div>
                `;
                context.platform.document.body.appendChild(dialog);
                context.ui.apiKeyDialogEl = dialog;
            }

            context.ui.apiKeyDialogEyebrowEl = context.platform.document.getElementById("apiKeyDialogEyebrow");
            context.ui.apiKeyDialogTitleEl = context.platform.document.getElementById("apiKeyDialogTitle");
            context.ui.apiKeyDialogCopyEl = context.platform.document.getElementById("apiKeyDialogCopy");
            context.ui.apiKeyDialogCloseBtnEl = context.platform.document.getElementById("apiKeyDialogCloseBtn");

            context.ui.apiKeyDialogEl.querySelectorAll("[data-credential-provider]").forEach((card) => {
                const provider = card.dataset.credentialProvider;
                const refs = {
                    card,
                    name: card.querySelector("[data-credential-name]"),
                    status: card.querySelector("[data-credential-status]"),
                    source: card.querySelector("[data-credential-source]"),
                    inputLabel: card.querySelector("[data-credential-input-label]"),
                    input: card.querySelector("[data-credential-input]"),
                    save: card.querySelector("[data-credential-save]"),
                    remove: card.querySelector("[data-credential-remove]")
                };
                context.ui.credentialUiByProvider[provider] = refs;
                if (refs.save && refs.save.dataset.bound !== "1") {
                    refs.save.dataset.bound = "1";
                    refs.save.addEventListener("click", () => { void saveProviderCredential(provider); });
                }
                if (refs.remove && refs.remove.dataset.bound !== "1") {
                    refs.remove.dataset.bound = "1";
                    refs.remove.addEventListener("click", () => { void removeProviderCredential(provider); });
                }
                if (refs.input && refs.input.dataset.bound !== "1") {
                    refs.input.dataset.bound = "1";
                    refs.input.addEventListener("keydown", (event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        void saveProviderCredential(provider);
                    });
                }
            });

            if (context.ui.manageApiKeysBtnEl && context.ui.manageApiKeysBtnEl.dataset.bound !== "1") {
                context.ui.manageApiKeysBtnEl.dataset.bound = "1";
                context.ui.manageApiKeysBtnEl.addEventListener("click", () => openApiKeyDialog());
            }

            if (context.ui.apiKeyDialogCloseBtnEl && context.ui.apiKeyDialogCloseBtnEl.dataset.bound !== "1") {
                context.ui.apiKeyDialogCloseBtnEl.dataset.bound = "1";
                context.ui.apiKeyDialogCloseBtnEl.addEventListener("click", () => {
                    closeApiKeyDialog();
                    context.services.refreshControls();
                });
            }

            if (context.ui.apiKeyDialogEl && context.ui.apiKeyDialogEl.dataset.bound !== "1") {
                context.ui.apiKeyDialogEl.dataset.bound = "1";
                context.ui.apiKeyDialogEl.addEventListener("cancel", () => {
                    context.services.refreshControls();
                });
            }
        }

        function updateApiKeyUiText() {
            if (context.ui.manageApiKeysBtnEl) context.ui.manageApiKeysBtnEl.textContent = context.services.l("AI Credentials", "Identifiants IA");
            if (context.ui.apiKeyDialogEyebrowEl) context.ui.apiKeyDialogEyebrowEl.textContent = context.services.l("Local provider setup", "Configuration locale des fournisseurs");
            if (context.ui.apiKeyDialogTitleEl) context.ui.apiKeyDialogTitleEl.textContent = context.services.l("AI provider credentials", "Identifiants des fournisseurs IA");
            if (context.ui.apiKeyDialogCopyEl) {
                context.ui.apiKeyDialogCopyEl.textContent = context.services.l(
                    "Keys are stored by the desktop app and are never shown here. Enter a key only when you want to save or replace it.",
                    "Les clés sont conservées par l’application de bureau et ne sont jamais affichées ici. Entrez une clé seulement pour l’enregistrer ou la remplacer."
                );
            }
            if (context.ui.apiKeyDialogCloseBtnEl) context.ui.apiKeyDialogCloseBtnEl.textContent = context.services.l("Close", "Fermer");
        }

        function providerLabel(provider) {
            return context.settings.MODEL_CATALOG.getProvider(provider)?.label || context.services.titleCase(provider);
        }

        function hasCredential(provider) {
            return !!context.settings.credentialState.byProvider[provider]?.configured;
        }

        function hasDesktopBridge() {
            return typeof context.platform.window.ethicsApi?.credentials?.status === "function"
                && typeof context.platform.window.ethicsApi?.ai?.generate === "function"
                && typeof context.platform.window.ethicsApi?.audio?.transcribe === "function";
        }

        function desktopLaunchMessage() {
            return context.services.l(
                "Open the Ethics Bowl desktop app; this raw HTML page cannot securely access provider credentials.",
                "Ouvrez l’application de bureau de la Coupe éthique; cette page HTML brute ne peut pas accéder aux identifiants de façon sécurisée."
            );
        }

        function getCredentialsBridge() {
            const bridge = context.platform.window.ethicsApi?.credentials;
            if (!bridge || typeof bridge.status !== "function" || typeof bridge.save !== "function" || typeof bridge.remove !== "function") {
                throw new Error(context.services.l("The desktop credential bridge is unavailable.", "Le pont d’identifiants de l’application de bureau n’est pas disponible."));
            }
            return bridge;
        }

        async function refreshCredentialStatus({ force = false } = {}) {
            if (context.settings.credentialState.loadingPromise) return context.settings.credentialState.loadingPromise;
            if (context.settings.credentialState.loaded && !force) return context.settings.credentialState.byProvider;
            let trackedPromise = null;
            trackedPromise = (async () => {
                try {
                    const rows = await Promise.race([
                        getCredentialsBridge().status(),
                        new Promise((_, reject) => context.platform.window.setTimeout(
                            () => reject(new Error(context.services.l("Credential status timed out.", "La vérification des identifiants a expiré."))),
                            context.settings.CREDENTIAL_STATUS_TIMEOUT_MS
                        ))
                    ]);
                    for (const provider of ["openai", "anthropic"]) {
                        const row = Array.isArray(rows) ? rows.find((item) => item?.provider === provider) : null;
                        context.settings.credentialState.byProvider[provider] = {
                            configured: !!row?.configured,
                            source: context.services.sanitizeText(row?.source || "")
                        };
                    }
                    context.settings.credentialState.lastError = "";
                    return context.settings.credentialState.byProvider;
                } catch (error) {
                    for (const provider of ["openai", "anthropic"]) {
                        context.settings.credentialState.byProvider[provider] = { configured: false, source: "" };
                    }
                    context.settings.credentialState.lastError = safeBridgeErrorMessage(error) || context.services.l("Credential status is unavailable.", "L’état des identifiants n’est pas disponible.");
                    throw error;
                } finally {
                    context.settings.credentialState.loaded = true;
                    updateApiKeyUi();
                }
            })().finally(() => {
                if (context.settings.credentialState.loadingPromise === trackedPromise) context.settings.credentialState.loadingPromise = null;
            });
            context.settings.credentialState.loadingPromise = trackedPromise;
            updateApiKeyUi();
            return trackedPromise;
        }

        function safeBridgeErrorMessage(error) {
            return context.services.sanitizeText(error?.message || "")
                .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
                .slice(0, 500);
        }

        function credentialSourceLabel(source) {
            if (source === "environment") return context.services.l("Local environment", "Environnement local");
            if (source === "stored") return context.services.l("Desktop credential storage", "Stockage d’identifiants de l’application");
            return context.services.sanitizeText(source);
        }

        function updateProviderCredentialCards() {
            for (const provider of ["openai", "anthropic"]) {
                const refs = context.ui.credentialUiByProvider[provider];
                if (!refs) continue;
                const label = providerLabel(provider);
                const record = context.settings.credentialState.byProvider[provider];
                const pending = context.settings.credentialState.pendingProvider === provider;
                const environmentBacked = record.source === "environment";
                const bridgeAvailable = hasDesktopBridge();
                if (refs.name) refs.name.textContent = label;
                if (refs.status) {
                    refs.status.textContent = !context.settings.credentialState.loaded
                        ? context.services.l("Checking", "Vérification")
                        : record.configured
                        ? context.services.l("Configured", "Configuré")
                        : context.services.l("Not configured", "Non configuré");
                    refs.status.className = `status-chip ${record.configured ? "active" : "inactive"}`;
                }
                if (refs.source) {
                    refs.source.textContent = !bridgeAvailable
                        ? desktopLaunchMessage()
                        : record.configured
                        ? record.source
                            ? context.services.l(`Credential source: ${credentialSourceLabel(record.source)}`, `Source de l’identifiant : ${credentialSourceLabel(record.source)}`)
                            : context.services.l("A credential is configured.", "Un identifiant est configuré.")
                        : context.services.l(`Add a ${label} API key to use ${label} models.`, `Ajoutez une clé API ${label} pour utiliser les modèles ${label}.`);
                }
                if (refs.inputLabel) refs.inputLabel.textContent = record.configured
                    ? context.services.l(`Replace ${label} API key`, `Remplacer la clé API ${label}`)
                    : context.services.l(`${label} API key`, `Clé API ${label}`);
                if (refs.input) {
                    refs.input.placeholder = context.services.l(`Enter ${label} API key`, `Entrez la clé API ${label}`);
                    refs.input.disabled = pending || !bridgeAvailable;
                }
                if (refs.save) {
                    refs.save.textContent = pending
                        ? context.services.l("Saving...", "Enregistrement...")
                        : record.configured
                        ? context.services.l("Replace key", "Remplacer la clé")
                        : context.services.l("Save key", "Enregistrer la clé");
                    refs.save.disabled = pending || !bridgeAvailable;
                }
                if (refs.remove) {
                    refs.remove.textContent = context.services.l("Remove", "Supprimer");
                    refs.remove.hidden = environmentBacked;
                    refs.remove.disabled = pending || !record.configured || environmentBacked || !bridgeAvailable;
                }
            }
        }

        function updateApiKeyStatusUi() {
            if (!context.ui.apiKeyStatusBadgeEl) return;
            if (!hasDesktopBridge()) {
                context.ui.apiKeyStatusBadgeEl.textContent = context.services.l("Desktop app required", "Application de bureau requise");
                context.ui.apiKeyStatusBadgeEl.className = "status-chip inactive";
                context.ui.apiKeyStatusBadgeEl.title = desktopLaunchMessage();
                return;
            }
            if (!context.settings.credentialState.loaded) {
                context.ui.apiKeyStatusBadgeEl.textContent = context.services.l("Checking AI credentials", "Vérification des identifiants IA");
                context.ui.apiKeyStatusBadgeEl.className = "status-chip subtle";
                return;
            }
            if (context.settings.credentialState.lastError) {
                context.ui.apiKeyStatusBadgeEl.textContent = context.services.l("Credential check failed", "Échec de la vérification des identifiants");
                context.ui.apiKeyStatusBadgeEl.className = "status-chip inactive";
                context.ui.apiKeyStatusBadgeEl.title = context.settings.credentialState.lastError;
                return;
            }
            const configured = ["openai", "anthropic"].filter(hasCredential);
            if (configured.length === 2) {
                context.ui.apiKeyStatusBadgeEl.textContent = context.services.l("OpenAI & Anthropic configured", "OpenAI et Anthropic configurés");
                context.ui.apiKeyStatusBadgeEl.className = "status-chip active";
            } else if (configured.length === 1) {
                const ready = providerLabel(configured[0]);
                const missing = providerLabel(configured[0] === "openai" ? "anthropic" : "openai");
                context.ui.apiKeyStatusBadgeEl.textContent = context.services.l(`${ready} configured • ${missing} not configured`, `${ready} configuré • ${missing} non configuré`);
                context.ui.apiKeyStatusBadgeEl.className = "status-chip subtle";
            } else {
                context.ui.apiKeyStatusBadgeEl.textContent = context.services.l("No AI providers configured", "Aucun fournisseur d’IA configuré");
                context.ui.apiKeyStatusBadgeEl.className = "status-chip inactive";
            }
            context.ui.apiKeyStatusBadgeEl.title = context.services.l("Open the credential panel to save, replace, or remove provider keys.", "Ouvrez le panneau d’identifiants pour enregistrer, remplacer ou supprimer les clés des fournisseurs.");
        }

        function updateApiKeyUi() {
            ensureApiKeyUi();
            updateApiKeyUiText();
            updateProviderCredentialCards();
            updateApiKeyStatusUi();
        }

        function openApiKeyDialog(focusProvider = "") {
            updateApiKeyUi();
            if (!context.ui.apiKeyDialogEl) return;

            if (typeof context.ui.apiKeyDialogEl.showModal === "function") {
                if (!context.ui.apiKeyDialogEl.open) context.ui.apiKeyDialogEl.showModal();
            } else {
                context.ui.apiKeyDialogEl.setAttribute("open", "open");
            }

            void refreshCredentialStatus({ force: true }).then(() => {
                updateApiKeyUi();
                context.services.refreshControls();
            }).catch(() => {
                context.services.setStatus(context.services.l("Could not refresh provider credential status.", "Impossible d’actualiser l’état des identifiants des fournisseurs."), true);
            });

            context.platform.window.setTimeout(() => {
                const preferred = context.ui.credentialUiByProvider[focusProvider]?.input;
                (preferred || context.ui.credentialUiByProvider.openai?.input || context.ui.credentialUiByProvider.anthropic?.input)?.focus();
            }, 0);
        }

        function closeApiKeyDialog() {
            if (!context.ui.apiKeyDialogEl) return;
            if (typeof context.ui.apiKeyDialogEl.close === "function") {
                if (context.ui.apiKeyDialogEl.open) context.ui.apiKeyDialogEl.close();
            } else {
                context.ui.apiKeyDialogEl.removeAttribute("open");
            }
        }

        async function saveProviderCredential(provider) {
            const refs = context.ui.credentialUiByProvider[provider];
            const key = context.services.sanitizeText(refs?.input?.value || "");
            if (!key) {
                context.services.setStatus(context.services.l(`Enter a ${providerLabel(provider)} API key first.`, `Entrez d’abord une clé API ${providerLabel(provider)}.`), true);
                refs?.input?.focus();
                return;
            }
            context.settings.credentialState.pendingProvider = provider;
            updateApiKeyUi();
            try {
                await getCredentialsBridge().save(provider, key);
                if (refs?.input) refs.input.value = "";
                context.settings.credentialState.loaded = false;
                context.settings.credentialState.lastError = "";
                await refreshCredentialStatus({ force: true });
                updateApiKeyUi();
                context.services.refreshControls();
                context.services.setStatus(context.services.l(`${providerLabel(provider)} credential saved.`, `Identifiant ${providerLabel(provider)} enregistré.`));
            } catch (error) {
                const detail = safeBridgeErrorMessage(error);
                context.services.setStatus(context.services.l(
                    `Could not save the ${providerLabel(provider)} credential${detail ? `: ${detail}` : "."}`,
                    `Impossible d’enregistrer l’identifiant ${providerLabel(provider)}${detail ? ` : ${detail}` : "."}`
                ), true);
            } finally {
                context.settings.credentialState.pendingProvider = "";
                updateApiKeyUi();
            }
        }

        async function removeProviderCredential(provider) {
            context.settings.credentialState.pendingProvider = provider;
            updateApiKeyUi();
            try {
                await getCredentialsBridge().remove(provider);
                context.settings.credentialState.loaded = false;
                context.settings.credentialState.lastError = "";
                await refreshCredentialStatus({ force: true });
                context.services.refreshControls();
                context.services.setStatus(context.services.l(`${providerLabel(provider)} credential removed.`, `Identifiant ${providerLabel(provider)} supprimé.`));
            } catch (error) {
                const detail = safeBridgeErrorMessage(error);
                context.services.setStatus(context.services.l(
                    `Could not remove the ${providerLabel(provider)} credential${detail ? `: ${detail}` : "."}`,
                    `Impossible de supprimer l’identifiant ${providerLabel(provider)}${detail ? ` : ${detail}` : "."}`
                ), true);
            } finally {
                context.settings.credentialState.pendingProvider = "";
                updateApiKeyUi();
            }
        }

        async function maybeShowInitialApiKeyDialog() {
            if (context.settings.credentialState.initialDialogShown) return;
            context.settings.credentialState.initialDialogShown = true;
            try {
                await refreshCredentialStatus();
            } catch {
                return;
            }
            if (!hasCredential("openai") && !hasCredential("anthropic")) openApiKeyDialog();
        }

        function normalizeMatchModel(value) {
            const normalized = String(value || "").trim();
            return context.settings.MODEL_CATALOG.isSupportedModel(normalized)
            ? normalized
            : context.settings.DEFAULT_PARTICIPANT_MODEL;
        }

        function getMatchModel(modelId) {
            return context.settings.MODEL_CATALOG.getModel(normalizeMatchModel(modelId));
        }

        function getModelProvider(modelId) {
            return context.settings.MODEL_CATALOG.getProviderForModel(String(modelId || "").trim());
        }

        function formatModelLabel(modelId, { includeProvider = true } = {}) {
            const model = getMatchModel(modelId);
            if (!model) return String(modelId || "");
            return includeProvider ? `${model.label} (${providerLabel(model.provider)})` : model.label;
        }

        function populateMatchModelSelect(selectEl, selectedValue = context.settings.DEFAULT_PARTICIPANT_MODEL) {
            if (!selectEl) return;
            const finalValue = normalizeMatchModel(selectedValue || selectEl.value || context.settings.DEFAULT_PARTICIPANT_MODEL);
            selectEl.innerHTML = "";
            for (const provider of ["openai", "anthropic"]) {
                const group = context.platform.document.createElement("optgroup");
                group.label = providerLabel(provider);
                context.settings.AVAILABLE_MATCH_MODELS.filter((model) => model.provider === provider).forEach((model) => {
                    const option = context.platform.document.createElement("option");
                    option.value = model.id;
                    option.textContent = model.label;
                    group.appendChild(option);
                });
                selectEl.appendChild(group);
            }
            selectEl.value = finalValue;
        }

        function populateAllMatchModelSelects() {
            populateMatchModelSelect(context.ui.participantOneModelSelectEl, context.ui.participantOneModelSelectEl?.value || context.settings.DEFAULT_PARTICIPANT_MODEL);
            populateMatchModelSelect(context.ui.modelSelectEl, context.ui.modelSelectEl?.value || context.settings.DEFAULT_PARTICIPANT_MODEL);
        }

        function getStoredText(key) {
            return context.services.sanitizeText(context.platform.localStorage.getItem(key) || "");
        }

        async function initializeCredentialState() {
            if (!hasDesktopBridge()) {
                context.settings.credentialState.loaded = true;
                context.settings.credentialState.lastError = desktopLaunchMessage();
                updateApiKeyUi();
                context.services.setStatus(desktopLaunchMessage(), true);
                context.services.refreshControls();
                return;
            }
            try {
                await refreshCredentialStatus({ force: true });
                const credentialLoadingStatus = context.services.l(
                    "Checking AI provider credentials...",
                    "Vérification des identifiants des fournisseurs IA..."
                );
                if (
                    !context.state.liveScreenActive
                    && !context.state.started
                    && !context.state.completed
                    && context.services.sanitizeText(context.ui.statusLineEl.textContent) === credentialLoadingStatus
                ) {
                    context.services.setStatus(context.services.l("Ready.", "Prêt."));
                }
                context.services.refreshControls();
                await maybeShowInitialApiKeyDialog();
                if (
                    context.settings.TIMING_TEST_AUTO_START
                    && !context.state.liveScreenActive
                    && !context.state.started
                    && !context.state.completed
                ) {
                    await context.services.startMatch();
                }
            } catch (error) {
                const detail = safeBridgeErrorMessage(error);
                context.services.setStatus(context.services.l(
                    `Could not load provider credentials${detail ? `: ${detail}` : "."}`,
                    `Impossible de charger les identifiants des fournisseurs${detail ? ` : ${detail}` : "."}`
                ), true);
                context.services.refreshControls();
            }
        }
        return Object.freeze({ensureApiKeyUi,updateApiKeyUiText,providerLabel,hasCredential,hasDesktopBridge,desktopLaunchMessage,getCredentialsBridge,refreshCredentialStatus,safeBridgeErrorMessage,credentialSourceLabel,updateProviderCredentialCards,updateApiKeyStatusUi,updateApiKeyUi,openApiKeyDialog,closeApiKeyDialog,saveProviderCredential,removeProviderCredential,maybeShowInitialApiKeyDialog,normalizeMatchModel,getMatchModel,getModelProvider,formatModelLabel,populateMatchModelSelect,populateAllMatchModelSelects,getStoredText,initializeCredentialState});
    }
    return Object.freeze({create,dependencies});
});
