(function exposeComposerStatus(root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.EthicsComposerStatus = api;
})(typeof globalThis === "object" ? globalThis : this, function createComposerStatus() {
    "use strict";

    // Display policy only. This helper never starts actions or changes controls/timers.
    function deriveStatus(snapshot = {}) {
        const fr = /^fr(?:-|$)/i.test(snapshot.locale || "en");
        const t = (en, french) => fr ? french : en;
        const phase = snapshot.phase;
        const actor = snapshot.actor || t("Participant", "Participant");
        const judge = snapshot.judge || t("Judge", "Juge");
        const humanJudge = phase?.kind === "judgeQuestion" && snapshot.judgeMode === "human";
        const humanTurn = (phase?.kind === "speech" || phase?.kind === "judgeAnswer") && !snapshot.speakerIsAi;
        const composerPhase = humanJudge || humanTurn;
        const owner = humanJudge ? judge : actor;
        let key, text, inputInvited = false;

        if (snapshot.completed) {
            key = "complete"; text = t("Match complete. Input is inactive.", "Match terminé. La saisie est inactive.");
        } else if (snapshot.coinTossAnimating) {
            key = "coin-toss"; text = t("Coin toss in progress. Input is inactive.", "Tirage en cours. La saisie est inactive.");
        } else if (snapshot.waitingForCoinCall) {
            key = "coin-call"; text = t("Choose Heads or Tails in the coin-toss panel.", "Choisissez Face ou Pile dans le panneau du tirage.");
        } else if (snapshot.waitingForCoinChoice) {
            key = "coin-choice"; text = t(`${snapshot.coinWinner || actor} must choose Lead or Pass for Case #1.`, `${snapshot.coinWinner || actor} doit choisir Mener ou Passer pour le cas 1.`);
        } else if (!snapshot.started) {
            if (snapshot.liveScreenActive) {
                key = "opening"; text = t("The moderator is introducing the match.", "Le modérateur présente le match.");
            } else {
                key = snapshot.busy ? "setup-busy" : "setup";
                text = snapshot.busy ? t("Preparing the match. Input is inactive.", "Préparation du match. La saisie est inactive.") : t("Set up and start a match to activate input.", "Configurez et démarrez un match pour activer la saisie.");
            }
        } else if (!phase) {
            key = "no-phase"; text = t("Waiting for the next phase. Input is inactive.", "En attente de la prochaine phase. La saisie est inactive.");
        } else if (snapshot.isRecording) {
            key = "recording"; text = snapshot.submissionAllowed === false
                ? t(`Recording for ${owner}. Stop recording to transcribe.`, `Enregistrement pour ${owner}. Arrêtez pour transcrire.`)
                : t(`Recording for ${owner}. Stop recording to transcribe, or submit to stop and send.`, `Enregistrement pour ${owner}. Arrêtez pour transcrire, ou soumettez pour arrêter et envoyer.`);
        } else if (snapshot.voiceFinalizePending) {
            key = "transcribing";
            text = snapshot.pendingSubmitReason === "timeout"
                ? t("Time is up. Finalizing the voice transcript before submission.", "Le temps est écoulé. Finalisation de la transcription vocale avant la soumission.")
                : snapshot.pendingSubmitReason === "manual"
                ? t("Finalizing the voice transcript before submission. Input is temporarily locked.", "Finalisation de la transcription vocale avant la soumission. La saisie est temporairement verrouillée.")
                : t("Finalizing the voice transcript. Wait before editing or submitting.", "Finalisation de la transcription vocale. Attendez avant de modifier ou de soumettre.");
        } else if(snapshot.audioTranscriptPending){
            key="audio-transcribing";text=t("Transcribing the audio played before time was called. Input is inactive.","Transcription de l’audio joué avant l’arrêt. La saisie est inactive.");
        } else if(snapshot.audioTranscriptRetry){
            key="audio-transcript-retry";text=t("Speech transcription failed. Use Retry transcription before continuing.","La transcription a échoué. Réessayez avant de continuer.");
        } else if (snapshot.timerExpired) {
            key = "timeout"; text = t("Time is up. Waiting for the next phase.", "Le temps est écoulé. En attente de la prochaine phase.");
        } else if (!snapshot.phaseReady) {
            key = "announcement";
            text = snapshot.playbackPaused
                ? t("Moderator read-aloud paused. Input is inactive.", "Lecture du modérateur en pause. La saisie est inactive.")
                : snapshot.playing
                ? composerPhase
                    ? t("Moderator speaking. Input activates after the announcement.", "Le modérateur parle. La saisie s’active après l’annonce.")
                    : t("Moderator speaking. Text and voice input are inactive in this phase.", "Le modérateur parle. Les saisies texte et vocale sont inactives dans cette phase.")
                : snapshot.audioPending
                ? t("Preparing the moderator announcement. Input is inactive.", "Préparation de l’annonce du modérateur. La saisie est inactive.")
                : t("Waiting for the moderator announcement. Input is inactive.", "En attente de l’annonce du modérateur. La saisie est inactive.");
        } else if (snapshot.playing || snapshot.playbackPaused) {
            key = snapshot.playbackPaused ? "playback-paused" : "playback";
            const reader = snapshot.reader || (phase.kind === "judgeQuestion" ? judge : actor);
            text = snapshot.playbackPaused
                ? t(`Read-aloud paused for ${reader}.`, `Lecture en pause pour ${reader}.`)
                : t(`${reader}: read-aloud in progress.`, `${reader} : lecture en cours.`);
        } else if (snapshot.awaitingPlayback) {
            key = "audio-preparing";
            text = t("Preparing or waiting for read-aloud. The turn has not finished.", "Préparation ou attente de la lecture. Le tour n’est pas terminé.");
        } else if (snapshot.generationBlocked) {
            key = "retry"; text = t(`Automatic generation stopped. Use “${snapshot.retryLabel || "Advance / Generate"}” to retry.`, `La génération automatique s’est arrêtée. Utilisez « ${snapshot.retryLabel || "Avancer / Générer"} » pour réessayer.`);
        } else if (snapshot.busy || snapshot.preparing) {
            key = "preparing";
            text = phase.kind === "closing"
                ? snapshot.judgeMode === "ai"
                    ? t("AI judges are preparing the final scorecards.", "Les juges IA préparent les fiches de pointage finales.")
                    : t("Computing the human-judge result.", "Calcul du résultat des juges humains.")
                : phase.kind === "judgeQuestion" && !humanJudge
                    ? t(`${judge} is preparing a question.`, `${judge} prépare une question.`)
                    : snapshot.speakerIsAi && ["speech", "judgeAnswer", "confer"].includes(phase.kind)
                    ? t(`${actor} is preparing the turn.`, `${actor} prépare le tour.`)
                    : t("Processing the current action. Input is temporarily unavailable.", "Traitement de l’action actuelle. La saisie est temporairement indisponible.");
        } else if (composerPhase) {
            key = "input-ready"; inputInvited = true;
            text = humanJudge
                ? t(`${judge}: type or record the question, then Ask.`, `${judge} : tapez ou enregistrez la question, puis posez-la.`)
                : phase.kind === "judgeAnswer"
                ? t(`${actor}: type or record the answer, then Submit Turn.`, `${actor} : tapez ou enregistrez la réponse, puis soumettez le tour.`)
                : t(`${actor}: type or record the ${phase.subtype || "turn"}, then Submit Turn.`, `${actor} : tapez ou enregistrez ${({presentation:"la présentation",commentary:"le commentaire",response:"la réplique"})[phase.subtype] || "le tour"}, puis soumettez le tour.`);
        } else if (phase.kind === "confer") {
            key = "conferral"; text = t(`${actor} is conferring. Text and voice input are inactive.`, `${actor} est en caucus. Les saisies texte et vocale sont inactives.`);
        } else if (phase.kind === "scoring") {
            key = "scoring"; text = snapshot.judgeMode === "ai"
                ? t("Case scoring interval. Waiting for the next phase.", "Période de pointage du cas. En attente de la prochaine phase.")
                : t("Human judges can record scores. Waiting for the next phase.", "Les juges humains peuvent saisir les notes. En attente de la prochaine phase.");
        } else if (phase.kind === "closing") {
            key = "closing"; text = snapshot.judgeMode === "ai"
                ? t("Ready to generate the final decision.", "Prêt à générer la décision finale.")
                : t("Enter all three judges’ scores, then compute the result.", "Entrez les notes des trois juges, puis calculez le résultat.");
        } else if (phase.kind === "moderatorCase") {
            key = "case-transition"; text = t("Case announcement complete. Waiting for the next phase.", "Annonce du cas terminée. En attente de la prochaine phase.");
        } else {
            key = "ai-ready"; text = snapshot.prepared
                ? t("AI text is ready. Waiting for read-aloud to start.", "Le texte IA est prêt. En attente du début de la lecture.")
                : t("Waiting for the AI turn to start. Text and voice input are inactive.", "En attente du début du tour IA. Les saisies texte et vocale sont inactives.");
        }
        if (snapshot.timerPaused && phase && snapshot.phaseReady && !snapshot.completed) text += t(" Timer paused.", " Minuterie en pause.");
        const notice = snapshot.notice;
        const sameScope = notice && notice.matchRunId === snapshot.matchRunId && notice.phaseId === (phase?.id || "");
        const error = !!(sameScope && notice.error && !snapshot.busy && !snapshot.isRecording && !snapshot.voiceFinalizePending && !snapshot.completed);
        if (error) text = `${notice.text} ${text}`;
        const hintVisible = !!(snapshot.started && !snapshot.completed && humanJudge && snapshot.phaseReady);
        const hintState = ({ recording: t("Recording question", "Enregistrement de la question"), transcribing: t("Finalizing transcript", "Finalisation de la transcription"), playback: t("Reading question", "Lecture de la question"), "playback-paused": t("Question playback paused", "Lecture de la question en pause"), "audio-preparing": t("Preparing question audio", "Préparation de l’audio de la question"), timeout: t("Question time is up", "Temps de question écoulé") })[key];
        const hint = !hintVisible ? "" : inputInvited ? t(`${judge} · Question input active`, `${judge} · Saisie de question active`)
            : `${judge} · ${hintState || t("Question input temporarily unavailable", "Saisie de question temporairement indisponible")}`;
        return { key, text, error, inputInvited, hint, hintVisible, hintActive: hintVisible && inputInvited };
    }

    return Object.freeze({ deriveStatus });
});
