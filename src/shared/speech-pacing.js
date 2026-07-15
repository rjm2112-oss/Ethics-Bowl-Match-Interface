(function exposeSpeechPacing(root, factory) {
    const speechPacing = factory();
    if (typeof module === "object" && module.exports) module.exports = speechPacing;
    if (root) root.EthicsSpeechPacing = speechPacing;
})(typeof globalThis === "object" ? globalThis : this, function createSpeechPacing() {
    "use strict";

    const DEFAULT_SENTENCE_PAUSE_MS = 360;
    const DEFAULT_PARAGRAPH_PAUSE_MS = 650;

    function normalizeInlineText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function splitTextByWords(text, maxLength) {
        const normalized = normalizeInlineText(text);
        if (!normalized) return [];
        const chunks = [];
        let current = "";
        for (const word of normalized.split(" ")) {
            const candidate = current ? `${current} ${word}` : word;
            if (candidate.length > maxLength && current) {
                chunks.push(current);
                current = word;
            } else {
                current = candidate;
            }
        }
        if (current) chunks.push(current);
        return chunks;
    }

    function splitIntoSentences(text, locale) {
        const normalized = normalizeInlineText(text);
        if (!normalized) return [];
        if (typeof Intl === "object" && typeof Intl.Segmenter === "function") {
            try {
                const segmenter = new Intl.Segmenter(locale || "en", { granularity: "sentence" });
                const sentences = Array.from(segmenter.segment(normalized), ({ segment }) => normalizeInlineText(segment)).filter(Boolean);
                if (sentences.length) return sentences;
            } catch {}
        }
        return (normalized.match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)/gu) || [normalized])
        .map(normalizeInlineText)
        .filter(Boolean);
    }

    function ensureSentenceEnding(text, ending = ".") {
        const normalized = normalizeInlineText(text);
        if (!normalized || /[.!?…]["')\]]*$/u.test(normalized)) return normalized;
        return `${normalized}${String(ending || ".").charAt(0) || "."}`;
    }

    function buildModeratorSpeechChunks(text, options = {}) {
        const maxLength = Number.isFinite(options.maxLength) && options.maxLength > 0
            ? Math.floor(options.maxLength)
            : 420;
        const sentencePauseMs = Number.isFinite(options.sentencePauseMs) && options.sentencePauseMs >= 0
            ? Math.floor(options.sentencePauseMs)
            : DEFAULT_SENTENCE_PAUSE_MS;
        const paragraphPauseMs = Number.isFinite(options.paragraphPauseMs) && options.paragraphPauseMs >= 0
            ? Math.floor(options.paragraphPauseMs)
            : DEFAULT_PARAGRAPH_PAUSE_MS;
        const locale = String(options.locale || "en");
        const paragraphs = String(text || "")
        .replace(/\r\n?/g, "\n")
        .split(/\n\s*\n+/)
        .map(normalizeInlineText)
        .filter(Boolean);
        const chunks = [];

        paragraphs.forEach((paragraph, paragraphIndex) => {
            const sentences = splitIntoSentences(paragraph, locale);
            sentences.forEach((sentence, sentenceIndex) => {
                const sentenceChunks = splitTextByWords(sentence, maxLength);
                sentenceChunks.forEach((chunk, chunkIndex) => {
                    const endsSentence = chunkIndex === sentenceChunks.length - 1;
                    const endsParagraph = endsSentence && sentenceIndex === sentences.length - 1;
                    const hasMoreParagraphs = paragraphIndex < paragraphs.length - 1;
                    const hasMoreSentences = sentenceIndex < sentences.length - 1;
                    let pauseAfterMs = 0;
                    if (endsParagraph && hasMoreParagraphs) pauseAfterMs = paragraphPauseMs;
                    else if (endsSentence && hasMoreSentences) pauseAfterMs = sentencePauseMs;
                    chunks.push(Object.freeze({ text: chunk, pauseAfterMs }));
                });
            });
        });

        if (chunks.length) chunks[chunks.length - 1] = Object.freeze({ ...chunks[chunks.length - 1], pauseAfterMs: 0 });
        return Object.freeze(chunks);
    }

    return Object.freeze({
        DEFAULT_SENTENCE_PAUSE_MS,
        DEFAULT_PARAGRAPH_PAUSE_MS,
        ensureSentenceEnding,
        buildModeratorSpeechChunks
    });
});
