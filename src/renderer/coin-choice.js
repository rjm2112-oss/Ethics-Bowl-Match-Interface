(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["coin-choice"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": ["applyCaseOneChoice", "beginStructuredMatch"], "settings": [], "ui": ["coinChoicePanelEl"], "platform": []});
    function create(context) {
        function handleHumanCoinChoice(choice) {
            if (!context.state.waitingForCoinChoice) return;
            context.state.waitingForCoinChoice = false;
            context.ui.coinChoicePanelEl.hidden = true;
            context.services.applyCaseOneChoice(context.state.coinWinner, choice);
            context.services.beginStructuredMatch();
        }
        return Object.freeze({handleHumanCoinChoice});
    }
    return Object.freeze({create,dependencies});
});
