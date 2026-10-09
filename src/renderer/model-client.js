(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["model-client"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": ["formatModelLabel", "getModelProvider", "hasCredential", "l", "openApiKeyDialog", "providerLabel", "refreshCredentialStatus"], "settings": ["DEFAULT_JUDGE_MODEL", "MODEL_CATALOG"], "ui": [], "platform": ["window"]});
    function create(context) {
        function getAiBridge() {
            const bridge = context.platform.window.ethicsApi?.ai;
            if (!bridge || typeof bridge.generate !== "function") {
                throw new Error(context.services.l("The desktop AI bridge is unavailable.", "Le pont IA de l’application de bureau n’est pas disponible."));
            }
            return bridge;
        }


        async function requireProviderCredential(provider, purpose = "") {
            await context.services.refreshCredentialStatus();
            if (context.services.hasCredential(provider)) return;
            context.services.openApiKeyDialog(provider);
            const providerName = context.services.providerLabel(provider);
            throw new Error(purpose
                ? context.services.l(`A ${providerName} API key is required for ${purpose}.`, `Une clé API ${providerName} est requise pour ${purpose}.`)
                : context.services.l(`A ${providerName} API key is required.`, `Une clé API ${providerName} est requise.`));
        }


        async function callAI({model=context.settings.DEFAULT_JUDGE_MODEL,systemPrompt="",userPrompt,maxTokens=800,requestTimeoutMs=null,reasoningEffort=null,jsonSchema=null,role="judge",recordContext=null}) {
            const runId=context.state.matchRunId;
            if (context.state.sessionClosed) throw Error("The match window is closed.");
            if(!["participant","judge"].includes(role))throw Error("Invalid generation role.");
            const resolvedModel=String(model||context.settings.DEFAULT_JUDGE_MODEL).trim();
            const provider=context.services.getModelProvider(resolvedModel);
            if(!provider)throw Error(context.services.l("The selected debate model is not supported.","Le modèle de débat sélectionné n’est pas pris en charge."));
            await requireProviderCredential(provider,context.services.formatModelLabel(resolvedModel,{includeProvider:false}));
            if (context.state.sessionClosed || runId !== context.state.matchRunId) throw Error("The match ended before the request started.");
            const effort=reasoningEffort??context.settings.MODEL_CATALOG.getReasoningEffort(resolvedModel,role);
            const result=await getAiBridge().generate({model:resolvedModel,systemPrompt:String(systemPrompt),userPrompt:String(userPrompt||""),maxTokens:context.settings.MODEL_CATALOG.getTextOutputBudget(maxTokens,effort),requestTimeoutMs:["high","medium"].includes(effort)?Math.max(requestTimeoutMs||0,180000):requestTimeoutMs,reasoningEffort:effort,jsonSchema,...(recordContext?{recordContext}:{})});
            if(result&&typeof result==="object")return result;
            const text=String(result||"").trim();if(!text)throw Error(context.services.l("The model returned no text.","Le modèle n’a renvoyé aucun texte."));return text;
        }


        function stripJsonFence(raw) {
            let text = String(raw || "").trim();
            text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
            return text;
        }


        function extractJsonObject(raw) {
            const text = stripJsonFence(raw);
            const first = text.indexOf("{");
            const last = text.lastIndexOf("}");
            if (first < 0 || last < 0 || last <= first) throw new Error(context.services.l("No JSON object found.", "Aucun objet JSON trouvé."));
            return JSON.parse(text.slice(first, last + 1));
        }
        return Object.freeze({getAiBridge,requireProviderCredential,callAI,stripJsonFence,extractJsonObject});
    }
    return Object.freeze({create,dependencies});
});
