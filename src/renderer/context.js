(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["context"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": ["speakerName"], "settings": [], "ui": [], "platform": ["window"]});
    function create(context) {
        function getPhaseById(phaseId) {
            return phaseId ? (context.state.phases.find((phase) => phase.id === phaseId) || null) : null;
        }


        function isSubstantiveTranscriptMessage(message) {
            return context.platform.window.EthicsTranscriptContext.isSubstantive(message);
        }


        function substantiveTranscriptAsPlainText(caseNum = null) {
            return context.platform.window.EthicsTranscriptContext.discussion({messages:context.state.transcript,phases:context.state.phases,locale:context.state.locale,caseNum});
        }


        function scoringTranscriptAsPlainText() {
            return context.platform.window.EthicsTranscriptContext.scoring({messages:context.state.transcript,phases:context.state.phases,cases:context.state.cases,leadByCase:context.state.leadByCase,names:{human:context.services.speakerName("human"),ai:context.services.speakerName("ai")},locale:context.state.locale});
        }
        return Object.freeze({getPhaseById,isSubstantiveTranscriptMessage,substantiveTranscriptAsPlainText,scoringTranscriptAsPlainText});
    }
    return Object.freeze({create,dependencies});
});
