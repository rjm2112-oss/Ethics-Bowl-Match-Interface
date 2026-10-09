(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["speech-callbacks"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": [], "settings": ["SPEECH_DELIVERY"], "ui": [], "platform": ["console", "window"]});
    function create(context) {
        function registerSpeechCompletionCallback(transcriptIndex, callback) {
            if (!Number.isInteger(transcriptIndex) || transcriptIndex < 0 || typeof callback !== "function") return;
            const existing = context.state.speechCompletionCallbacks.get(transcriptIndex) || [];
            existing.push(callback);
            context.state.speechCompletionCallbacks.set(transcriptIndex, existing);
        }


        function registerSpeechStartCallback(transcriptIndex, callback) {
            if (!Number.isInteger(transcriptIndex) || transcriptIndex < 0 || typeof callback !== "function") return;
            const existing = context.state.speechStartCallbacks.get(transcriptIndex) || [];
            existing.push(callback);
            context.state.speechStartCallbacks.set(transcriptIndex, existing);
        }


        function invokeSpeechStartCallbacks(transcriptIndex) {
            if (!Number.isInteger(transcriptIndex) || transcriptIndex < 0) return;
            const callbacks = context.state.speechStartCallbacks.get(transcriptIndex) || [];
            context.state.speechStartCallbacks.delete(transcriptIndex);
            callbacks.forEach((callback) => {
                try { callback(); } catch (error) { context.platform.console.error("Speech start callback failed:", error); }
            });
        }


        function invokeSpeechCompletionCallbacks(transcriptIndex) {
            if (!Number.isInteger(transcriptIndex) || transcriptIndex < 0) return;
            const callbacks = context.state.speechCompletionCallbacks.get(transcriptIndex) || [];
            context.state.speechCompletionCallbacks.delete(transcriptIndex);
            callbacks.forEach((callback) => {
                try {
                    context.platform.window.setTimeout(() => {
                        try { callback(); } catch (error) { context.platform.console.error("Speech completion callback failed:", error); }
                    }, 0);
                } catch (error) {
                    context.platform.console.error("Could not schedule speech completion callback:", error);
                }
            });
        }


        function trackSpeechChunksForMessage(transcriptIndex, count) {
            if (!Number.isInteger(transcriptIndex) || transcriptIndex < 0 || !Number.isFinite(count) || count <= 0) return;
            context.state.speechChunkCounts.set(transcriptIndex, (context.state.speechChunkCounts.get(transcriptIndex) || 0) + count);
        }


        function markSpeechChunkComplete(transcriptIndex) {
            if (!Number.isInteger(transcriptIndex) || transcriptIndex < 0) return;
            const nextRemaining = (context.state.speechChunkCounts.get(transcriptIndex) || 0) - 1;
            if (nextRemaining > 0) {
                context.state.speechChunkCounts.set(transcriptIndex, nextRemaining);
                return;
            }
            context.state.speechChunkCounts.delete(transcriptIndex);
            const message = context.state.transcript?.[transcriptIndex];
            if (message?.speechDeliveryState === "pending") {
                if (context.settings.SPEECH_DELIVERY.has(message)) context.settings.SPEECH_DELIVERY.sealUnresolved(message);
                else message.speechDeliveryState = "unresolved";
            }
            invokeSpeechCompletionCallbacks(transcriptIndex);
        }


        function finalizeSpeechPlaybackForMessage(transcriptIndex) {
            if (!Number.isInteger(transcriptIndex) || transcriptIndex < 0) return;
            context.state.speechChunkCounts.delete(transcriptIndex);
            invokeSpeechCompletionCallbacks(transcriptIndex);
        }


        function finalizeAllSpeechPlaybackCallbacks() {
            const ids = new Set([...context.state.speechChunkCounts.keys(), ...context.state.speechStartCallbacks.keys(), ...context.state.speechCompletionCallbacks.keys()]);
            context.state.speechChunkCounts.clear();
            ids.forEach((id) => invokeSpeechStartCallbacks(id));
            ids.forEach((id) => invokeSpeechCompletionCallbacks(id));
        }
        return Object.freeze({registerSpeechCompletionCallback,registerSpeechStartCallback,invokeSpeechStartCallbacks,invokeSpeechCompletionCallbacks,trackSpeechChunksForMessage,markSpeechChunkComplete,finalizeSpeechPlaybackForMessage,finalizeAllSpeechPlaybackCallbacks});
    }
    return Object.freeze({create,dependencies});
});
