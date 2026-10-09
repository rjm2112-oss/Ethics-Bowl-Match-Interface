(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer.transcript=api;}})(typeof globalThis==="object"?globalThis:this,function(){
    "use strict";
    const dependencies=Object.freeze({
    "services": [
        "buildSpeechQueueEntries",
        "enqueueTranscriptSpeech",
        "formatBubbleTime",
        "getMessageBodyEl",
        "getVoiceKeyForMessage",
        "l",
        "normalizeSpeechText",
        "registerSpeechCompletionCallback",
        "registerSpeechStartCallback",
        "shouldAutoSpeakMessage"
    ],
    "settings": [
        "AUTO_SPEAK_MESSAGE_KINDS",
        "SPEECH_DELIVERY"
    ],
    "ui": [
        "chatEl",
        "emptyStateEl",
        "followSpeechBtnEl"
    ],
    "platform": [
        "console",
        "document",
        "window"
    ]
});
    function create(context) {
        const renderedRows = new Map();
        const rowBodies = new WeakMap();
        const previewBodies = new WeakMap();
        function displayText(message) {
            return context.settings.SPEECH_DELIVERY.previewText(message) ?? String(message?.text || "");
        }
        function paintPreview(body, text, range) {
            let painted=previewBodies.get(body);
            if(!painted || painted.text!==text){
                body.textContent="";
                const words=[];let cursor=0;
                // Format generated emphasis without changing the source offsets
                // used by recognized-word highlighting and speech delivery.
                const emphasis=[],delimiters=new Set();
                for(const match of text.matchAll(/(?<![\p{L}\p{N}_*\\])(\*{1,2})([^*\s](?:[^*\n]*?[^*\s])?)\1(?![\p{L}\p{N}_*])/gu)){
                    const size=match[1].length,start=match.index+size,end=match.index+match[0].length-size;
                    emphasis.push({start,end,kind:size===2?"strong":"em"});
                    for(let i=0;i<size;i++){delimiters.add(match.index+i);delimiters.add(end+i);}
                }
                for(const token of text.matchAll(/\S+/gu)){
                    if(token.index>cursor)body.appendChild(context.platform.document.createTextNode(text.slice(cursor,token.index)));
                    const span=context.platform.document.createElement("span");
                    span.textContent=token[0].split("").filter((_char,index)=>!delimiters.has(token.index+index)).join("");
                    const format=emphasis.find(part=>token.index<part.end && token.index+token[0].length>part.start);
                    if(format)span.dataset.emphasis=format.kind;
                    body.appendChild(span);
                    words.push({span,start:token.index,end:token.index+token[0].length});
                    cursor=token.index+token[0].length;
                }
                if(cursor<text.length)body.appendChild(context.platform.document.createTextNode(text.slice(cursor)));
                painted={text,words,active:[]};previewBodies.set(body,painted);
            }
            const active=range ? painted.words.filter(word=>word.start<range.endChar && word.end>range.startChar) : [];
            for(const word of painted.active)if(!active.includes(word))word.span.className="";
            for(const word of active)if(!painted.active.includes(word))word.span.className="speech-speaking";
            painted.active=active;
        }

        function getMostRecentReadableTranscriptIndex() {
            for (let i = context.state.transcript.length - 1; i >= 0; i -= 1) {
                if (context.settings.AUTO_SPEAK_MESSAGE_KINDS.has(context.state.transcript[i]?.kind)) return i;
            }
            return -1;
        }

        function restoreMessageBodyPlainText(index) {
            const body = context.services.getMessageBodyEl(index);
            if (!body) return;
            const text = displayText(context.state.transcript[index]);
            if(context.settings.SPEECH_DELIVERY.previewText(context.state.transcript[index])!==null){paintPreview(body,text,null);return;}
            previewBodies.delete(body);
            if (body.textContent !== text || body.querySelector(".speech-speaking")) body.textContent = text;
        }

        function buildNormalizedTextIndexMap(rawText) {
            const raw = String(rawText || "");
            let normalized = "";
            const normToRaw = [];
            let pendingSpace = false;
            for (let i = 0; i < raw.length; i += 1) {
                const ch = raw[i];
                if (/\s/.test(ch)) {
                    if (normalized.length) pendingSpace = true;
                    continue;
                }
                if (pendingSpace && normalized.length) {
                    normalized += " ";
                    normToRaw.push(i);
                    pendingSpace = false;
                }
                normalized += ch;
                normToRaw.push(i);
            }
            return { normalized, normToRaw };
        }

        function findSpeechRangeInRawText(rawText, chunkText, startNormIndex = 0) {
            const raw = String(rawText || "");
            const chunk = context.services.normalizeSpeechText(chunkText);
            if (!chunk || !raw) return null;
            const mapped = buildNormalizedTextIndexMap(raw);
            const normalizedRaw = mapped.normalized;
            let startNorm = normalizedRaw.indexOf(chunk, Math.max(0, startNormIndex));
            if (startNorm < 0 && startNormIndex > 0) startNorm = normalizedRaw.indexOf(chunk);
            if (startNorm < 0) return null;
            const endNorm = startNorm + chunk.length;
            const rawStart = mapped.normToRaw[startNorm] ?? 0;
            const rawEnd = endNorm < mapped.normToRaw.length ? mapped.normToRaw[endNorm] : raw.length;
            return { rawStart, rawEnd: Math.max(rawStart, rawEnd), startNorm, endNorm };
        }

        function renderSpeechProgressOnBody(body, index) {
            const message = context.state.transcript[index];
            const rawText = String(message?.text || "");
            if (context.settings.SPEECH_DELIVERY.has(message)) {
                const text = displayText(message);
                const active=context.state.currentDeliveryPlayback;
                if(context.settings.SPEECH_DELIVERY.previewText(message)!==null){
                    const range=active?.message===message && active.entry?.transcriptIndex===index
                        && active.token===context.state.speechToken && active.runId===context.state.matchRunId && !context.state.sessionClosed
                        ? context.settings.SPEECH_DELIVERY.previewHighlightRange(message,active.entry.chunkIndex,active.audio) : null;
                    paintPreview(body,text,range);return;
                }
                previewBodies.delete(body);
                if (body.textContent !== text || body.querySelector(".speech-speaking")) body.textContent = text;
                return;
            }
            if (index !== context.state.speechProgressMessageIndex
                || context.state.speechProgressSpeakEnd <= context.state.speechProgressSpeakStart) {
                if (body.textContent !== rawText || body.querySelector(".speech-speaking")) body.textContent = rawText;
                return;
            }
            const readTo = Math.max(0, Math.min(rawText.length, context.state.speechProgressReadTo));
            const speakStart = Math.max(readTo, Math.min(rawText.length, context.state.speechProgressSpeakStart));
            const speakEnd = Math.max(speakStart, Math.min(rawText.length, context.state.speechProgressSpeakEnd));
            const beforeText = rawText.slice(0, speakStart);
            const currentText = rawText.slice(speakStart, speakEnd);
            const afterText = rawText.slice(speakEnd);
            body.textContent = "";
            if (beforeText) {
                const before = context.platform.document.createElement("span");
                before.className = "speech-read";
                before.textContent = beforeText;
                body.appendChild(before);
            }
            if (currentText) {
                const current = context.platform.document.createElement("span");
                current.className = "speech-speaking";
                current.textContent = currentText;
                body.appendChild(current);
            }
            if (afterText) body.appendChild(context.platform.document.createTextNode(afterText));
        }

        function isSpeechFollowActive() {
            return context.state.speechPlaybackActive || context.state.speechProcessing || !!context.state.speechQueue.length || !!context.state.openAiSpeechLookaheadPromise || !!context.state.openAiSpeechLookaheadPrepared;
        }

        function clearSpeechFollowRaf() {
            if (context.state.speechFollowRaf) {
                context.platform.window.cancelAnimationFrame(context.state.speechFollowRaf);
                context.state.speechFollowRaf = null;
            }
            context.state.speechFollowWantsSmooth = false;
        }

        function scrollSpeechProgressIntoView(smooth = true) {
            if (context.state.speechFollowPaused || context.state.speechProgressMessageIndex < 0) return false;
            const chat = context.ui.chatEl;
            const body = context.services.getMessageBodyEl(context.state.speechProgressMessageIndex);
            if (!body || typeof chat?.getBoundingClientRect !== "function") return false;
            const speaking = body.querySelector(".speech-speaking");
            const message = context.state.transcript[context.state.speechProgressMessageIndex];
            // A recognition gap between words must not jump back to the start.
            if (!speaking && context.state.speechFollowMessageIndex === context.state.speechProgressMessageIndex) return false;
            if (!speaking && context.settings.SPEECH_DELIVERY.has(message)
                && (context.settings.SPEECH_DELIVERY.previewText(message) === null
                    || context.state.currentDeliveryPlayback?.entry.chunkIndex > 0)) return false;
            const target = speaking || body;
            // A moderator highlight can span a whole paragraph. Anchor its first
            // line; participant highlights identify the current spoken word.
            const rect = target.getClientRects?.()[0] || target.getBoundingClientRect();
            const viewport = chat.getBoundingClientRect();
            const height = chat.clientHeight;
            if (!height || !Number.isFinite(rect.top)) return false;
            context.state.speechFollowMessageIndex = context.state.speechProgressMessageIndex;
            const inset = height / 3;
            // Leave room below the last line so even the end of a speech can
            // sit two thirds of the way up the reading pane.
            chat.style?.setProperty("--speech-tail-space", `${Math.ceil(height - inset)}px`);
            const lineHeight = Math.min(48, Math.max(16, rect.bottom - rect.top));
            if (Math.abs(rect.top - viewport.top - inset) <= lineHeight / 3) return false;
            const top = Math.max(0, Math.min(chat.scrollHeight - height, chat.scrollTop + rect.top - viewport.top - inset));
            if (Math.abs(top - chat.scrollTop) < 1) return false;
            const reducedMotion = context.platform.window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
            if (typeof chat.scrollTo === "function") chat.scrollTo({ top, behavior: smooth && !reducedMotion ? "smooth" : "auto" });
            else chat.scrollTop = top;
            return true;
        }

        function queueSpeechFollowScroll(smooth = true) {
            if (context.state.speechFollowPaused || context.state.speechProgressMessageIndex < 0) return false;
            if (context.state.speechFollowRaf || typeof context.platform.window.requestAnimationFrame !== "function") return false;
            context.state.speechFollowWantsSmooth = smooth;
            context.state.speechFollowRaf = context.platform.window.requestAnimationFrame(() => {
                context.state.speechFollowRaf = null;
                scrollSpeechProgressIntoView(context.state.speechFollowWantsSmooth);
            });
            return true;
        }

        function pauseSpeechFollow() {
            if (!isSpeechFollowActive()) return;
            context.state.speechFollowPaused = true;
            clearSpeechFollowRaf();
            if (context.ui.followSpeechBtnEl) context.ui.followSpeechBtnEl.hidden = false;
        }

        function resumeSpeechFollow() {
            context.state.speechFollowPaused = false;
            if (context.ui.followSpeechBtnEl) context.ui.followSpeechBtnEl.hidden = true;
            queueSpeechFollowScroll(true);
        }

        function syncSpeechProgressToUi(scrollSmooth = false) {
            const messageIndex = context.state.speechProgressMessageIndex;
            if (messageIndex < 0) return;
            const body = context.services.getMessageBodyEl(messageIndex);
            if (!body) return;
            renderSpeechProgressOnBody(body, messageIndex);
            queueSpeechFollowScroll(true);
        }

        function resetSpeechProgressState({ clearUi = true } = {}) {
            const previousIndex = context.state.speechProgressMessageIndex;
            context.state.speechProgressMessageIndex = -1;
            context.state.speechProgressNormalizedCursor = 0;
            context.state.speechProgressReadTo = 0;
            context.state.speechProgressSpeakStart = 0;
            context.state.speechProgressSpeakEnd = 0;
            clearSpeechFollowRaf();
            if (clearUi && previousIndex >= 0) restoreMessageBodyPlainText(previousIndex);
        }

        function finishSpeechProgressPlayback() {
            resetSpeechProgressState({ clearUi: true });
        }

        function beginSpeechProgressForQueueEntry(entry) {
            const entryText = context.services.normalizeSpeechText(entry?.text || "");
            if (!entryText) return;
            const messageIndex = Number.isInteger(entry?.transcriptIndex) ? entry.transcriptIndex : getMostRecentReadableTranscriptIndex();
            if (messageIndex < 0 || !context.state.transcript[messageIndex]) return;
            if (context.settings.SPEECH_DELIVERY.has(context.state.transcript[messageIndex])) return;
            if (context.state.speechProgressMessageIndex !== messageIndex) {
                const previousIndex = context.state.speechProgressMessageIndex;
                context.state.speechProgressMessageIndex = messageIndex;
                context.state.speechProgressNormalizedCursor = 0;
                context.state.speechProgressReadTo = 0;
                context.state.speechProgressSpeakStart = 0;
                context.state.speechProgressSpeakEnd = 0;
                if (previousIndex >= 0 && previousIndex !== messageIndex) restoreMessageBodyPlainText(previousIndex);
            }
            const rawText = String(context.state.transcript[messageIndex]?.text || "");
            const range = findSpeechRangeInRawText(rawText, entryText, context.state.speechProgressNormalizedCursor);
            if (range) {
                context.state.speechProgressReadTo = range.rawStart;
                context.state.speechProgressSpeakStart = range.rawStart;
                context.state.speechProgressSpeakEnd = range.rawEnd;
                context.state.speechProgressNormalizedCursor = range.endNorm;
            } else {
                const fallbackStart = Math.max(0, Math.min(rawText.length, context.state.speechProgressSpeakEnd));
                const fallbackEnd = Math.max(fallbackStart, Math.min(rawText.length, fallbackStart + entryText.length));
                context.state.speechProgressReadTo = fallbackStart;
                context.state.speechProgressSpeakStart = fallbackStart;
                context.state.speechProgressSpeakEnd = fallbackEnd;
            }
            syncSpeechProgressToUi(true);
        }

        function renderJudgeScorecardBody(body, card) {
            const make = (tag, text, className = "") => {
                const el = context.platform.document.createElement(tag);
                el.textContent = text;
                if (className) el.className = className;
                return el;
            };
            const table = make("table", "", "judge-result-scores");
            const head = make("thead", ""), header = make("tr", "");
            header.appendChild(make("th", context.services.l("Criterion", "Critère")));
            header.appendChild(make("th", card.participantNames.human));
            header.appendChild(make("th", card.participantNames.ai));
            head.appendChild(header); table.appendChild(head);
            const rows = make("tbody", "");
            const criteria = [
                ["presentationQuestion", "Clarity & systematicity", "Clarté et cohérence", 5],
                ["presentationEthics", "Moral dimensions", "Dimensions morales", 5],
                ["presentationViewpoints", "Conflicting viewpoints", "Points de vue divergents", 5],
                ["responseToFeedback", "Response to commentary", "Réponse aux commentaires", 10],
                ["judgesQuestions", "Judges’ questions", "Questions des juges", 20],
                ["commentary", "Commentary", "Commentaire", 10],
                ["respectfulDialogue", "Respectful dialogue", "Dialogue respectueux", 5]
            ];
            if (card.humanBreakdown && card.aiBreakdown) criteria.forEach(([key, en, fr, max]) => {
                const row = make("tr", "");
                row.appendChild(make("th", context.services.l(en, fr)));
                row.appendChild(make("td", `${card.humanBreakdown[key]}/${max}`));
                row.appendChild(make("td", `${card.aiBreakdown[key]}/${max}`));
                rows.appendChild(row);
            });
            table.appendChild(rows);
            const footer = make("tfoot", "", "judge-result-totals"), totals = make("tr", "");
            totals.appendChild(make("th", context.services.l("Total", "Total")));
            totals.appendChild(make("td", `${card.humanScore}/60`));
            totals.appendChild(make("td", `${card.aiScore}/60`));
            footer.appendChild(totals); table.appendChild(footer); body.appendChild(table);
            if (card.humanComments && card.aiComments) {
                const comments = make("div", "", "judge-result-comments");
                for (const [role, teamComments] of [["human", card.humanComments], ["ai", card.aiComments]]) {
                    const team = make("section", "", "judge-result-team");
                    team.appendChild(make("h4", card.participantNames[role], "judge-result-team-name"));
                    team.appendChild(make("h5", context.services.l("What the team did well", "Ce que l’équipe a bien fait"), "judge-result-comment-label"));
                    team.appendChild(make("p", teamComments.didWell, "judge-result-comment judge-result-comment-body"));
                    team.appendChild(make("h5", context.services.l("What needs improvement", "Ce qui doit être amélioré"), "judge-result-comment-label"));
                    team.appendChild(make("p", teamComments.needsImprovement, "judge-result-comment judge-result-comment-body"));
                    comments.appendChild(team);
                }
                body.appendChild(comments);
            } else if (card.comment) {
                // Historical scorecards keep their original comment; never invent paired feedback.
                body.appendChild(make("p", card.comment, "judge-result-comment"));
            }
        }

        function createMessageElement(message, index) {
            const row = context.platform.document.createElement("div");
            row.className = `msg-row ${message.kind}`;
            row.dataset.messageIndex = String(index);
            const bubble = context.platform.document.createElement("article");
            bubble.className = `bubble ${message.kind}`;
            const label = context.platform.document.createElement("div");
            label.className = "bubble-label";
            label.textContent = message.label;
            const body = context.platform.document.createElement("div");
            body.className = "bubble-body";
            rowBodies.set(row, body);
            if (message.kind === "judge-result" && message.scorecard) renderJudgeScorecardBody(body, message.scorecard);
            else if (context.settings.SPEECH_DELIVERY.has(message) || index === context.state.speechProgressMessageIndex) renderSpeechProgressOnBody(body, index);
            else body.textContent = displayText(message) || (message.speechDeliveryState === "pending" ? context.services.l("Awaiting confirmed speech…", "En attente de parole confirmée…") : "");

            if (message.speechDeliveryState === "unresolved") {
                const deliveryNote = context.platform.document.createElement("div");
                deliveryNote.className = "score-note";
                deliveryNote.textContent = context.services.l("Speech transcription needs review. Later model requests are blocked.", "La transcription doit être vérifiée. Les requêtes de modèle suivantes sont bloquées.");
                bubble.appendChild(deliveryNote);
            }
            const time = context.platform.document.createElement("div");
            time.className = "bubble-time";
            time.textContent = context.services.formatBubbleTime(message.time);
            bubble.appendChild(label);
            bubble.appendChild(body);
            bubble.appendChild(time);
            row.appendChild(bubble);
            return row;
        }

        function renderTranscript() {
            const chat = context.ui.chatEl;
            const previousTop = chat.scrollTop || 0;
            const followingBottom = (chat.scrollHeight || 0) - previousTop - (chat.clientHeight || 0) <= 48;
            const visibleMessages = context.state.transcript
                .map((message, index) => ({ message, index }))
                .filter(({ message }) => !message.hiddenUntilPhaseReady);
            if (!visibleMessages.length) {
                context.ui.emptyStateEl.hidden = false;
                if (typeof chat.replaceChildren === "function") chat.replaceChildren(context.ui.emptyStateEl);
                else { chat.innerHTML = ""; chat.appendChild(context.ui.emptyStateEl); }
                renderedRows.clear();
                chat.style?.removeProperty("--speech-tail-space");
                if (context.ui.followSpeechBtnEl) context.ui.followSpeechBtnEl.hidden = true;
                return;
            }
            context.ui.emptyStateEl.hidden = true;
            const desiredRows = [], addedRows = [], nextRows = new Map();
            for (const {message, index} of visibleMessages) {
                const previous = renderedRows.get(index);
                const unchanged = previous?.message === message && previous.label === message.label
                    && previous.time === message.time && previous.scorecard === message.scorecard
                    && previous.unresolved === (message.speechDeliveryState === "unresolved");
                const row = unchanged ? previous.row : createMessageElement(message, index);
                if (!previous || previous.message !== message) addedRows.push(row);
                if (unchanged && message.kind !== "judge-result") renderSpeechProgressOnBody(rowBodies.get(row), index);
                nextRows.set(index, {message, row, label:message.label, time:message.time, scorecard:message.scorecard, unresolved:message.speechDeliveryState === "unresolved"});
                desiredRows.push(row);
            }
            for (const child of Array.from(chat.children || [])) {
                if (!desiredRows.includes(child)) chat.removeChild(child);
            }
            desiredRows.forEach((row, index) => {
                if (chat.children?.[index] === row) return;
                if (typeof chat.insertBefore === "function") chat.insertBefore(row, chat.children[index] || null);
                else chat.appendChild(row);
            });
            renderedRows.clear();
            for (const [index, entry] of nextRows) renderedRows.set(index, entry);
            syncSpeechProgressToUi(false);
            // Queued announcements must not pull the current speech off screen.
            // Playback, rather than message arrival, controls speech following.
            if (!isSpeechFollowActive() && !context.state.speechFollowPaused && followingBottom && addedRows.length && typeof chat.getBoundingClientRect === "function") {
                const row = addedRows[addedRows.length - 1];
                const rowRect = row.getBoundingClientRect();
                const chatRect = chat.getBoundingClientRect();
                chat.scrollTop = Math.max(0, previousTop + rowRect.top - chatRect.top);
            } else if (chat.scrollTop !== previousTop) chat.scrollTop = previousTop;
        }

        function revealTranscriptMessagesForPhase(phaseId) {
            let changed = false;
            context.state.transcript.forEach((message) => {
                if (!message.hiddenUntilPhaseReady || message.phaseId !== phaseId) return;
                message.hiddenUntilPhaseReady = false;
                changed = true;
            });
            if (changed) renderTranscript();
        }

        function appendMessage(kind, label, text, options = {}) {
            const runId = context.state.matchRunId;
            if (context.state.sessionClosed) return -1;
            const voiceKey = context.services.getVoiceKeyForMessage(kind, options);
            const willAutoSpeak = kind !== "judge-result" && context.services.shouldAutoSpeakMessage(kind, text, options);
            const awaitsDeliveredSpeech = willAutoSpeak && options.substantive !== false
                && ["ai", "ai-alt", "judge"].includes(kind);
            context.state.transcript.push({
                kind,
                ...(kind === "judge-result" ? { scorecard: options.scorecard } : {}),
                label,
                text: String(text || ""),
                speechDeliveryState: awaitsDeliveredSpeech ? "pending" : "complete",
                                  time: new Date().toISOString(),
                                  caseNum: options.caseNum || 0,
                                      phaseId: options.phaseId || "",
                                      voiceKey,
                                      substantive: kind !== "judge-result" && options.substantive !== false,
                                      hiddenUntilPhaseReady: options.hiddenUntilPhaseReady === true
            });
            const transcriptIndex = context.state.transcript.length - 1;
            if (awaitsDeliveredSpeech) context.settings.SPEECH_DELIVERY.attach(context.state.transcript[transcriptIndex], String(text || ""), context.services.buildSpeechQueueEntries(kind, text, transcriptIndex, voiceKey, options).map(entry => entry.text),context.state.locale);
            const onPlaybackStart = typeof options.onPlaybackStart === "function" ? () => { if (runId === context.state.matchRunId && !context.state.sessionClosed) options.onPlaybackStart(); } : null;
            const onPlaybackComplete = typeof options.onPlaybackComplete === "function" ? () => { if (runId === context.state.matchRunId && !context.state.sessionClosed) options.onPlaybackComplete(); } : null;
            if (onPlaybackStart) {
                if (willAutoSpeak) context.services.registerSpeechStartCallback(transcriptIndex, onPlaybackStart);
                else {
                    context.platform.window.setTimeout(() => {
                        try { onPlaybackStart(); } catch (error) { context.platform.console.error("Immediate playback-start callback failed:", error); }
                    }, 0);
                }
            }
            if (onPlaybackComplete) {
                if (willAutoSpeak) context.services.registerSpeechCompletionCallback(transcriptIndex, onPlaybackComplete);
                else {
                    context.platform.window.setTimeout(() => {
                        try { onPlaybackComplete(); } catch (error) { context.platform.console.error("Immediate playback callback failed:", error); }
                    }, 0);
                }
            }
            renderTranscript();
            if (willAutoSpeak) context.services.enqueueTranscriptSpeech(kind, text, transcriptIndex, voiceKey, options);
            return transcriptIndex;
        }
        return Object.freeze({getMostRecentReadableTranscriptIndex,restoreMessageBodyPlainText,buildNormalizedTextIndexMap,findSpeechRangeInRawText,renderSpeechProgressOnBody,isSpeechFollowActive,clearSpeechFollowRaf,scrollSpeechProgressIntoView,queueSpeechFollowScroll,pauseSpeechFollow,resumeSpeechFollow,syncSpeechProgressToUi,resetSpeechProgressState,finishSpeechProgressPlayback,beginSpeechProgressForQueueEntry,renderJudgeScorecardBody,createMessageElement,renderTranscript,revealTranscriptMessagesForPhase,appendMessage});
    }
    return Object.freeze({create,dependencies});
});
