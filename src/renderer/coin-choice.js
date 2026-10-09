(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["coin-choice"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": ["applyCaseOneChoice", "beginStructuredMatch", "refreshControls", "updatePhaseHeader"], "settings": [], "ui": ["coinChoicePanelEl", "coinHeadsBtnEl"], "platform": []});
    function create(context) {
        function requestHumanCoinCall() {
            cancelHumanCoinCall();
            context.state.waitingForCoinCall = true;
            const result = new Promise(resolve => {
                context.state.pendingCoinCall = { runId: context.state.matchRunId, resolve };
            });
            context.services.updatePhaseHeader();
            context.services.refreshControls();
            context.ui.coinHeadsBtnEl?.focus({ preventScroll: true });
            return result;
        }

        function handleHumanCoinCall(choice) {
            const pending = context.state.pendingCoinCall;
            if (!context.state.waitingForCoinCall || !pending || pending.runId !== context.state.matchRunId
                || context.state.sessionClosed || !["heads", "tails"].includes(choice)) return false;
            context.state.coinCall = choice;
            context.state.waitingForCoinCall = false;
            context.state.pendingCoinCall = null;
            context.services.updatePhaseHeader();
            context.services.refreshControls();
            pending.resolve(choice);
            return true;
        }

        function cancelHumanCoinCall() {
            const pending = context.state.pendingCoinCall;
            context.state.pendingCoinCall = null;
            context.state.waitingForCoinCall = false;
            pending?.resolve("");
        }

        function handleHumanCoinChoice(choice) {
            if (!context.state.waitingForCoinChoice) return;
            context.state.waitingForCoinChoice = false;
            context.ui.coinChoicePanelEl.hidden = true;
            context.services.applyCaseOneChoice(context.state.coinWinner, choice);
            context.services.beginStructuredMatch();
        }
        return Object.freeze({requestHumanCoinCall,handleHumanCoinCall,cancelHumanCoinCall,handleHumanCoinChoice});
    }
    return Object.freeze({create,dependencies});
});
