(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["phase-access"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": [], "settings": [], "ui": [], "platform": ["window"]});
    function create(context) {
        function buildPhases() {
            return context.platform.window.EthicsMatchPhases.build({leadByCase:context.state.leadByCase,locale:context.state.locale});
        }


        function getCurrentPhase() {
            return context.state.phases[context.state.currentPhaseIndex] || null;
        }
        return Object.freeze({buildPhases,getCurrentPhase});
    }
    return Object.freeze({create,dependencies});
});
