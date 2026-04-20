// Constants & State
const dom = {
    editor: document.getElementById('textEditor'),
    panel: document.getElementById('readingPanel'),
    readingContent: document.getElementById('readingContent'),
    estTimeVal: document.getElementById('estTimeVal'),
    estTimeWrapper: document.getElementById('estTimeWrapper'),
    wrapper: document.getElementById('contentWrapper'),

    btnEdit: document.getElementById('btnEditMode'),
    btnRead: document.getElementById('btnReadMode'),
    btnToggleSide: document.getElementById('btnToggleSide'),
    btnCloseSide: document.getElementById('btnCloseSide'),
    btnToggleTime: document.getElementById('btnToggleTime'),
    sidebar: document.getElementById('sidebar'),
    centerPlayback: document.getElementById('centerPlayback'),

    iconPlay: document.querySelector('.play-icon'),
    iconPause: document.querySelector('.pause-icon'),

    btnPrevSent: document.getElementById('btnPrevSent'),
    btnNextSent: document.getElementById('btnNextSent'),
    btnPrevWord: document.getElementById('btnPrevWord'),
    btnNextWord: document.getElementById('btnNextWord'),
    btnPlayPause: document.getElementById('btnPlayPause'),

    modeToggles: document.querySelectorAll('.toggle-btn'),
    voiceSelect: document.getElementById('voiceSelect'),
    pacingSlider: document.getElementById('pacingSlider'),
    pacingSliderVal: document.getElementById('pacingSliderVal'),
    speechRate: document.getElementById('speechRate'),
    speechRateVal: document.getElementById('speechRateVal'),
    textSize: document.getElementById('textSize'),
    textSizeVal: document.getElementById('textSizeVal'),
    lineSpacing: document.getElementById('lineSpacing'),
    lineSpacingVal: document.getElementById('lineSpacingVal'),
    maxWidth: document.getElementById('maxWidth'),
    maxWidthVal: document.getElementById('maxWidthVal'),
    letterSpacing: document.getElementById('letterSpacing'),
    letterSpacingVal: document.getElementById('letterSpacingVal'),
    wordSpacing: document.getElementById('wordSpacing'),
    wordSpacingVal: document.getElementById('wordSpacingVal'),
    delayGroup: document.getElementById('delayGroup'),
    chunkSettingsGroup: document.getElementById('chunkSettingsGroup'),
    checkChunking: document.getElementById('checkChunking'),
    chunkSize: document.getElementById('chunkSize'),
    chunkSizeVal: document.getElementById('chunkSizeVal')
};

let state = {
    isEditing: true,
    operationMode: 'writing',
    units: [],
    currentIndex: 0,
    isPlaying: false,
    delayTimer: null,
    sessionId: 0,
    voicesAvailable: [],
    settings: {
        text_size: 24, line_spacing: 1.8, max_width: 800,
        letter_spacing: 0, word_spacing: 0,
        voiceToken: '', pacing: 50, speech_rate: 1.0, op_mode: 'writing',
        theme: 'light',
        use_chunking: true,
        chunk_size: 3,
        show_time_estimate: true,
        speech_rate_writing: 1.0,
        speech_rate_reading: 1.0
    },
    ttsSpeed: { msPerChar: 70 },
    ttsStartTimestamp: 0
};

const digitMap = {
    '0': '०', '1': '१', '2': '२', '3': '३', '4': '४',
    '5': '५', '6': '६', '7': '७', '8': '८', '9': '९',
    '+': ' जमा ', '×': ' गुणा ', '÷': ' बटे ',
    '²': ' का स्क्वैर, ', '³': ' का क्यूब, '
};

function toHindi(text, isHindi = true) {
    if (state.operationMode === 'reading') return text;
    let processed = text.toString();

    // Protect hyphen between identical words (e.g., साथ-साथ, एक-एक)
    const repeatRegex = /(^|[\s.,!?;:'"()।])([^\s.,!?;:'"()\-]+)-\2(?=[\s.,!?;:'"()।]|$)/g;
    processed = processed.replace(repeatRegex, '$1$2####SKIP####$2');

    processed = processed
        .replace(/-/g, isHindi ? ' हाइफन ' : ' hyphen ')
        .replace(/\//g, isHindi ? ' बट्टे ' : ' slash ')
        .replace(/,/g, isHindi ? ' कौमा ' : ' comma ');

    // Restore protected hyphens
    processed = processed.replace(/####SKIP####/g, '-');

    return processed.replace(/[0-9+×÷²³]/g, (match) => digitMap[match] || match);
}

// Audio Bell Singleton
const hindiSegmenter = new Intl.Segmenter("hi", { granularity: "grapheme" });

let audioCtx = null;
function playBell(times = 1) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        let playCount = 0;
        function ring() {
            if (playCount >= times) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1244.51, audioCtx.currentTime); // D#6
            gain.gain.setValueAtTime(0, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.8);
            playCount++;
            if (playCount < times) setTimeout(ring, 300);
        }
        ring();
    } catch(e) {}
}

// Persist Text Input
dom.editor.addEventListener('input', () => {
    localStorage.setItem('rs_text', dom.editor.value);
});

// --- Voice Init ---
function initVoices() {
    const cb = () => {
        let voices = window.speechSynthesis.getVoices().filter(v => {
            return (v.lang.startsWith("hi") || v.lang.startsWith("en")) && !v.lang.includes("#");
        });
        if (!voices.length) return;

        const isStrictHindi = (lang) => lang === "hi_IN" || lang === "hi-IN";
        const isStrictEngIN = (lang) => lang === "en_IN" || lang === "en-IN";

        voices.sort((a, b) => {
            let scoreA = (a.lang.startsWith("hi") ? 1000 : 0) + (isStrictHindi(a.lang) || isStrictEngIN(a.lang) ? 100 : 0) + (a.localService ? 10 : 0) + (!a.name.includes("Microsoft") ? 1 : 0);
            let scoreB = (b.lang.startsWith("hi") ? 1000 : 0) + (isStrictHindi(b.lang) || isStrictEngIN(b.lang) ? 100 : 0) + (b.localService ? 10 : 0) + (!b.name.includes("Microsoft") ? 1 : 0);
            return scoreB - scoreA;
        });

        state.voicesAvailable = voices;
        dom.voiceSelect.innerHTML = '';

        let hindiGroup = document.createElement('optgroup');
        hindiGroup.label = 'हिन्दी ध्वनियाँ';
        let engGroup = document.createElement('optgroup');
        engGroup.label = 'English Voices';

        voices.forEach((v, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `${v.name} [${v.lang}] ${v.localService ? '(Offline)' : '(Online)'}`;

            if (v.lang.startsWith('hi')) hindiGroup.appendChild(opt);
            else engGroup.appendChild(opt);
        });

        if (hindiGroup.children.length > 0) dom.voiceSelect.appendChild(hindiGroup);
        if (engGroup.children.length > 0) dom.voiceSelect.appendChild(engGroup);

        // Resolve preferred default matching token
        if (state.settings.voiceToken) {
            let matchIdx = voices.findIndex(v => v.name === state.settings.voiceToken);
            if(matchIdx !== -1) {
                dom.voiceSelect.value = matchIdx;
            } else {
                dom.voiceSelect.value = 0; // fallback to best offline
            }
        } else {
            // First time load logic (Auto-select local Hindi female-preferred voice)
            const localHindiVoices = voices.filter(v => v.lang.startsWith('hi') && v.localService);
            if (localHindiVoices.length > 0) {
                let preferredVoice = localHindiVoices.length >= 2 ? localHindiVoices[localHindiVoices.length - 1] : localHindiVoices[0];
                let idx = voices.findIndex(v => v.name === preferredVoice.name);
                dom.voiceSelect.value = idx !== -1 ? idx : 0;
            } else {
                dom.voiceSelect.value = 0;
            }
            // Hydrate initial selection explicitly
            if (voices[dom.voiceSelect.value]) {
                state.settings.voiceToken = voices[dom.voiceSelect.value].name;
                localStorage.setItem('rs_settings', JSON.stringify(state.settings));
            }
        }
    };
    cb();
    if (window.speechSynthesis.onvoiceschanged !== undefined) window.speechSynthesis.onvoiceschanged = cb;
}

// --- Settings & UI Binding ---
function applyCSSVars() {
    document.documentElement.style.setProperty('--dynamic-text-size', `${state.settings.text_size}px`);
    document.documentElement.style.setProperty('--dynamic-line-spacing', `${state.settings.line_spacing}`);
    document.documentElement.style.setProperty('--dynamic-max-width', `${state.settings.max_width}px`);
    document.documentElement.style.setProperty('--dynamic-letter-spacing', `${state.settings.letter_spacing}px`);
    document.documentElement.style.setProperty('--dynamic-word-spacing', `${state.settings.word_spacing}px`);
}

function updateSettings() {
    state.settings.pacing = parseInt(dom.pacingSlider.value);
    dom.pacingSliderVal.textContent = (1 + state.settings.pacing / 100).toFixed(1) + 'x';

    state.settings.speech_rate = parseFloat(dom.speechRate.value);
    if (state.operationMode === 'writing') state.settings.speech_rate_writing = state.settings.speech_rate;
    else state.settings.speech_rate_reading = state.settings.speech_rate;
    dom.speechRateVal.textContent = state.settings.speech_rate.toFixed(1) + 'x';

    state.settings.text_size = parseInt(dom.textSize.value);
    dom.textSizeVal.textContent = state.settings.text_size + 'px';

    state.settings.line_spacing = parseFloat(dom.lineSpacing.value);
    dom.lineSpacingVal.textContent = state.settings.line_spacing.toFixed(1);

    state.settings.max_width = parseInt(dom.maxWidth.value);
    dom.maxWidthVal.textContent = state.settings.max_width + 'px';

    state.settings.letter_spacing = parseFloat(dom.letterSpacing.value);
    dom.letterSpacingVal.textContent = state.settings.letter_spacing.toFixed(2) + 'px';

    state.settings.word_spacing = parseInt(dom.wordSpacing.value);
    dom.wordSpacingVal.textContent = state.settings.word_spacing + 'px';

    if (dom.checkChunking) {
        state.settings.use_chunking = dom.checkChunking.checked;
        state.settings.chunk_size = parseInt(dom.chunkSize.value);
        dom.chunkSizeVal.textContent = state.settings.chunk_size;

        let chunkGroup = document.getElementById('chunkSizeGroup');
        if(chunkGroup) chunkGroup.style.display = state.settings.use_chunking ? 'block' : 'none';
    }

    if (dom.voiceSelect.value !== "") {
        let v = state.voicesAvailable[dom.voiceSelect.value];
        if (v) state.settings.voiceToken = v.name;
    }

    applyCSSVars();
    if (!state.isEditing) {
        calculateEstimatedTime();
        scrollToActive(true);
    }
    localStorage.setItem('rs_settings', JSON.stringify(state.settings));
}

['pacingSlider', 'speechRate', 'textSize', 'lineSpacing', 'maxWidth', 'letterSpacing', 'wordSpacing'].forEach(id => {
    if(dom[id]) dom[id].addEventListener('input', updateSettings);
});

if (dom.checkChunking) {
    dom.checkChunking.addEventListener('change', () => { updateSettings(); if (!state.isEditing) renderOutput(); });
    dom.chunkSize.addEventListener('input', () => { updateSettings(); if (!state.isEditing) renderOutput(); });
}

dom.voiceSelect.addEventListener('change', () => { stopTTS(); updateSettings(); });

if (dom.btnToggleTime) {
    dom.btnToggleTime.addEventListener('click', () => {
        state.settings.show_time_estimate = !state.settings.show_time_estimate;
        if (dom.estTimeWrapper) dom.estTimeWrapper.classList.toggle('hidden', !state.settings.show_time_estimate);
        dom.btnToggleTime.style.opacity = state.settings.show_time_estimate ? '1' : '0.5';
        localStorage.setItem('rs_settings', JSON.stringify(state.settings));
    });
}

// Mode Toggles
dom.modeToggles.forEach(btn => {
    btn.addEventListener('click', () => {
        stopTTS();
        dom.modeToggles.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.settings.op_mode = btn.dataset.mode;
        state.operationMode = state.settings.op_mode;
        dom.speechRate.value = state.settings[`speech_rate_${state.operationMode}`] || state.settings.speech_rate || 1.0;
        dom.delayGroup.style.display = state.operationMode === 'writing' ? 'block' : 'none';
        if (dom.chunkSettingsGroup) dom.chunkSettingsGroup.style.display = state.operationMode === 'writing' ? 'block' : 'none';
        updateSettings();
        if (!state.isEditing) renderOutput();
    });
});

function loadSettings() {
    try {
        const savedTxt = localStorage.getItem('rs_text');
        if (savedTxt) dom.editor.value = savedTxt;

        let saved = JSON.parse(localStorage.getItem('rs_settings'));
        if (saved) state.settings = { ...state.settings, ...saved };

        if (state.settings.show_time_estimate === undefined) state.settings.show_time_estimate = true;
        if (dom.btnToggleTime) dom.btnToggleTime.style.opacity = state.settings.show_time_estimate ? '1' : '0.5';
        if (dom.estTimeWrapper) dom.estTimeWrapper.classList.toggle('hidden', !state.settings.show_time_estimate);

        dom.pacingSlider.value = state.settings.pacing;
        dom.speechRate.value = state.settings.speech_rate;
        dom.textSize.value = state.settings.text_size;
        dom.lineSpacing.value = state.settings.line_spacing;
        dom.maxWidth.value = state.settings.max_width;
        dom.letterSpacing.value = state.settings.letter_spacing || 0;
        dom.wordSpacing.value = state.settings.word_spacing || 0;

        if (state.settings.use_chunking !== undefined && dom.checkChunking) {
            dom.checkChunking.checked = state.settings.use_chunking;
            dom.chunkSize.value = state.settings.chunk_size;
        }

        state.operationMode = state.settings.op_mode;

        dom.modeToggles.forEach(b => b.classList.toggle('active', b.dataset.mode === state.operationMode));
        dom.delayGroup.style.display = state.operationMode === 'writing' ? 'block' : 'none';
        if (dom.chunkSettingsGroup) dom.chunkSettingsGroup.style.display = state.operationMode === 'writing' ? 'block' : 'none';

        updateSettings();
        applyTheme(state.settings.theme || 'light');
    } catch(e){}
}

window.onload = () => { loadSettings(); initVoices(); setEditMode(true); };

// Sidebar
dom.btnToggleSide.onclick = () => dom.sidebar.classList.toggle('open');
dom.btnCloseSide.onclick = () => dom.sidebar.classList.remove('open');
document.addEventListener('click', (e) => {
    if (dom.sidebar.classList.contains('open')) {
        if (!dom.sidebar.contains(e.target) && !dom.btnToggleSide.contains(e.target)) {
            dom.sidebar.classList.remove('open');
            e.stopPropagation();
            e.preventDefault();
        }
    }
}, true);

// --- Edit/Read View Toggle ---

dom.btnEdit.onclick = () => setEditMode(true);
dom.btnRead.onclick = () => setEditMode(false);

function setEditMode(isEdit) {
    stopTTS();
    state.isEditing = isEdit;

    if (isEdit) {
        let maxScrollFrom = Math.max(1, dom.panel.scrollHeight - dom.panel.clientHeight);
        let ratio = dom.panel.scrollTop / maxScrollFrom;

        dom.btnEdit.classList.add('active');
        dom.btnRead.classList.remove('active');
        dom.editor.classList.remove('hidden');
        dom.panel.classList.add('hidden');
        dom.centerPlayback.classList.add('disabled');

        let maxScrollTo = Math.max(1, dom.editor.scrollHeight - dom.editor.clientHeight);
        dom.editor.scrollTop = ratio * maxScrollTo;
    } else {
        let maxScrollFrom = Math.max(1, dom.editor.scrollHeight - dom.editor.clientHeight);
        let ratio = dom.editor.scrollTop / maxScrollFrom;

        dom.btnRead.classList.add('active');
        dom.btnEdit.classList.remove('active');
        dom.editor.classList.add('hidden');
        dom.panel.classList.remove('hidden');
        dom.centerPlayback.classList.remove('disabled');

        renderOutput();

        let maxScrollTo = Math.max(1, dom.panel.scrollHeight - dom.panel.clientHeight);
        dom.panel.scrollTop = ratio * maxScrollTo;
    }
}

function wrapSymbols(text) {
    return text.replace(/([,\-\/\(\)।\.!?:;])/g, '<span class="sym-em">$1</span>');
}

// --- REFINED LINGUISTIC DICTIONARIES ---
const terminators = new Set(['है', 'हैं', 'हूँ', 'हो', 'था', 'थी', 'थे', 'होगा', 'होगी', 'होंगे', 'सकता', 'सकती', 'सकते', 'चुका', 'चुकी', 'चुके', 'गया', 'गई', 'गए', 'वाला', 'वाली', 'वाले', 'चाहिए', 'रहा', 'रही', 'रहे', 'हुए', 'हुई', 'हुआ']);
const connectors = new Set(['का', 'के', 'की']); // ALWAYS demand an object target after them
const postpositions = new Set(['से', 'में', 'पर', 'ने', 'को', 'तक', 'द्वारा']); // End a phrase, don't necessarily pull the next word
const secondaryTargets = new Set(['लिए', 'वास्ते', 'साथ', 'पास', 'बाद', 'पहले', 'कारण', 'ओर', 'तरफ', 'संबंधित', 'अनुसार', 'दौरान']);
// Removed word-level conjunctions (और, एवं) so they don't fracture noun phrases like "प्रस्तावना एवं निष्कर्ष"
const clauseBreakers = new Set(['कि', 'क्योंकि', 'इसलिए', 'लेकिन', 'परंतु', 'अतः', 'अर्थात', 'अगर', 'यदि']);

function chunkHindiTextForTTS(text, baseLimit) {
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    const chunks = [];
    let currentChunk = [];
    let i = 0;

    const clean = (w) => w.replace(/[.,;!?।'"()\*_:]/g, '');
    const hasPunctuation = (w) => /[.,;!?:।]/.test(w);

    while (i < words.length) {
        let word = words[i];
        let cleanWord = clean(word);

        // RULE 1: STRONG CLAUSE BREAKERS
        if (clauseBreakers.has(cleanWord) && currentChunk.length > 0) {
            if (cleanWord === 'कि') {
                currentChunk.push(word);
                chunks.push(currentChunk.join(' '));
                currentChunk = [];
                i++;
                continue;
            } else {
                chunks.push(currentChunk.join(' '));
                currentChunk = [];
            }
        }

        currentChunk.push(word);
        let wordHasPunc = hasPunctuation(word);
        let isTerminator = terminators.has(cleanWord);

        let nextIsTerminator = false;
        if (i + 1 < words.length) {
           nextIsTerminator = terminators.has(clean(words[i + 1]));
        }

        // Break if punctuation is hit, or if a terminator phrase is fully finished
        let hardStop = wordHasPunc || (isTerminator && !nextIsTerminator);

        if (hardStop || currentChunk.length >= baseLimit) {

            // Track if the word that triggered the limit was a Connector ('के')
            let recentlyPulledConnector = connectors.has(cleanWord);

            // SMART PULL AHEAD LOOP
            while (i + 1 < words.length) {
                let nextWord = words[i + 1];
                let nextClean = clean(nextWord);
                let nextHasPunc = hasPunctuation(nextWord);
                let shouldPull = false;

                if (nextClean === '-' || nextClean === '/') {
                    shouldPull = true;
                }
                else if (terminators.has(nextClean)) {
                    shouldPull = true; // Always group verbs
                }
                else if (connectors.has(nextClean) || postpositions.has(nextClean)) {
                    shouldPull = true; // Always group case markers
                    if (connectors.has(nextClean)) {
                        recentlyPulledConnector = true; // Flag that we need to pull a target next!
                    }
                }
                else if (recentlyPulledConnector || secondaryTargets.has(nextClean)) {
                    // If we just pulled 'के', we MUST pull the target ('उत्तर', 'प्रश्न', 'साथ')
                    shouldPull = true;
                    recentlyPulledConnector = false; // Reset after successfully pulling the target
                }

                if (shouldPull) {
                    currentChunk.push(nextWord);
                    i++;
                    if (nextClean === '-' || nextClean === '/') {
                        break; // Close the group immediately after pulling isolated symbol
                    }
                    if (nextHasPunc) {
                        break; // Break instantly if pulled word has punctuation
                    }
                } else {
                    break; // Not a glue word or target, stop looking ahead.
                }
            }

            chunks.push(currentChunk.join(' '));
            currentChunk = [];
        }

        i++;
    }

    if (currentChunk.length > 0) chunks.push(currentChunk.join(' '));
    return chunks;
}

// --- Execution Time Estimation ---
function calculateEstimatedTime() {
    if (state.units.length === 0 || state.isEditing) {
        if (dom.estTimeVal) dom.estTimeVal.parentElement.style.opacity = '0';
        return;
    }

    if (dom.estTimeVal) dom.estTimeVal.parentElement.style.opacity = '1';

    let pacingVal = Math.max(-50, Math.min(100, parseInt(state.settings.pacing) || 50));
    let userMultiplier = 1.0 - (pacingVal / 100) * 0.6;
    let totalMs = 0;
    let tempLineGraphemes = 0;

    for (let i = state.currentIndex; i < state.units.length; i++) {
        let unit = state.units[i];

        let prevUnit = i > 0 ? state.units[i - 1] : null;
        if (!prevUnit || prevUnit.paraIdx !== unit.paraIdx) {
            tempLineGraphemes = 0;
        }

        let currGraphemes = 0;
        if (!unit.isSymbol) {
            currGraphemes = Array.from(hindiSegmenter.segment(unit.text)).length;
        }

        let bellTimes = 0;
        let nextUnit = state.units[i + 1];
        if (nextUnit && nextUnit.paraIdx > unit.paraIdx) bellTimes = 2;
        else if (/[।\.!?]$/.test(unit.text.trim()) || (unit.isSymbol && /[।\.!?]/.test(unit.text))) bellTimes = 1;

        let extraDelay = 0;
        if (state.operationMode === 'writing') {
            if (bellTimes === 2) extraDelay = 1500 * userMultiplier;
            else if (bellTimes === 1) extraDelay = 1000 * userMultiplier;

            if (!unit.isSymbol) {
                if (tempLineGraphemes + currGraphemes >= 40 && bellTimes === 0) {
                    extraDelay += 1500 * userMultiplier;
                    tempLineGraphemes = 0;
                } else {
                    tempLineGraphemes += currGraphemes;
                }
            }
            if (bellTimes > 0) tempLineGraphemes = 0;
        }

        let delay = 0;
        let ttsTime = 0;

        if (state.operationMode === 'writing') {
            if (unit.isSymbol) {
                delay = 150 * userMultiplier + extraDelay;
                ttsTime = 500;
            } else {
                let charCount = unit.text.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, "").length;
                let matraCount = (unit.text.match(/[\u093E-\u094C\u0901\u0902\u094D\u093F]/g) || []).length;
                let complexBuffer = (matraCount > 2) ? (matraCount * 400) : 0;
                let baseTime = charCount * 700;
                let bufferTime = 1000 + complexBuffer;
                delay = (baseTime + bufferTime) * userMultiplier + extraDelay;
                ttsTime = charCount * state.ttsSpeed.msPerChar;
            }
        } else {
            delay = (150 * userMultiplier) + extraDelay;
            let charCount = unit.text.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, "").length;
            ttsTime = charCount * state.ttsSpeed.msPerChar;
        }

        totalMs += ttsTime + delay;
    }

    let totalSeconds = Math.ceil(totalMs / 1000);
    let mins = Math.floor(totalSeconds / 60);
    let secs = totalSeconds % 60;
    let hrs = Math.floor(mins / 60);
    mins = mins % 60;

    if (dom.estTimeVal) {
        if (hrs > 0) {
            dom.estTimeVal.textContent = `${hrs}h ${mins}m ${secs.toString().padStart(2, '0')}s`;
        } else if (mins > 0) {
            dom.estTimeVal.textContent = `${mins}m ${secs.toString().padStart(2, '0')}s`;
        } else {
            dom.estTimeVal.textContent = `${secs}s`;
        }
    }
}

// --- Text Parsing & Rendering ---
function renderOutput() {
    if(dom.readingContent) dom.readingContent.innerHTML = '';
    state.units = [];
    state.currentIndex = 0;

    const text = dom.editor.value.trim();
    if (!text) return;

    const lines = text.split('\n');
    let uIndex = 0;
    let currentBlockIdx = 0;
    const fragment = document.createDocumentFragment();

    const renderSpanContent = (textChunk, initBold, initItalic) => {
        let finalSpanHTML = '';
        let currentPart = '';
        let inBold = initBold;
        let inItalic = initItalic;
        let lastBold = inBold;
        let lastItalic = inItalic;
        let cleanText = '';

        for (let c of textChunk) {
            if (c === '*') {
                if (currentPart) {
                    let partHTML = wrapSymbols(currentPart);
                    if (lastBold) partHTML = `<b>${partHTML}</b>`;
                    if (lastItalic) partHTML = `<i>${partHTML}</i>`;
                    finalSpanHTML += partHTML;
                    currentPart = '';
                }
                inBold = !inBold;
                lastBold = inBold;
            } else if (c === '_') {
                if (currentPart) {
                    let partHTML = wrapSymbols(currentPart);
                    if (lastBold) partHTML = `<b>${partHTML}</b>`;
                    if (lastItalic) partHTML = `<i>${partHTML}</i>`;
                    finalSpanHTML += partHTML;
                    currentPart = '';
                }
                inItalic = !inItalic;
                lastItalic = inItalic;
            } else {
                currentPart += c;
                cleanText += c;
            }
        }
        if (currentPart) {
            let partHTML = wrapSymbols(currentPart);
            if (lastBold) partHTML = `<b>${partHTML}</b>`;
            if (lastItalic) partHTML = `<i>${partHTML}</i>`;
            finalSpanHTML += partHTML;
        }
        return { html: finalSpanHTML, cleanText, outBold: inBold, outItalic: inItalic };
    };

    lines.forEach((line, lIdx) => {
        let pText = line.trim();
        if (!pText) {
            const gap = document.createElement('div');
            gap.className = 'para-gap';
            fragment.appendChild(gap);
            currentBlockIdx++;
            return;
        }

        const pEl = document.createElement('div');
        pEl.className = 'paragraph';

        if (/^-{3,}$/.test(pText)) { pEl.classList.add('md-hr'); pText = ''; }
        else if (/^={3,}$/.test(pText)) { pEl.classList.add('md-equals'); pText = ''; }
        else if (pText.startsWith('### ')) { pEl.classList.add('md-h3'); pText = pText.substring(4); }
        else if (pText.startsWith('## ')) { pEl.classList.add('md-h2'); pText = pText.substring(3); }
        else if (pText.startsWith('# ')) { pEl.classList.add('md-h1'); pText = pText.substring(2); }
        else if (pText.startsWith('- ')) { pEl.classList.add('md-bullet'); pText = pText.substring(2); }
        else if (/^\d+\.\s/.test(pText)) {
            let match = pText.match(/^(\d+\.\s)/);
            pEl.classList.add('md-ordered');
            pEl.setAttribute('data-list-val', match[0].trim());
            pText = pText.substring(match[0].length);
        }

        pText = pText.replace(/\*\*+/g, '*').replace(/__+/g, '_');

        if (!pText) {
            fragment.appendChild(pEl);
            return;
        }

        let inBold = false;
        let inItalic = false;

        if (state.operationMode === 'reading') {
            const sentences = pText.split(/(?<=[.!?|।])\s+/);
            sentences.forEach((sent, sIdx) => {
                if(!sent.trim()) return;

                const { html, cleanText, outBold, outItalic } = renderSpanContent(sent, inBold, inItalic);
                inBold = outBold;
                inItalic = outItalic;

                const span = document.createElement('span');
                span.className = 'dictation-unit block-unit';
                span.innerHTML = html;
                span.dataset.index = uIndex;
                pEl.appendChild(span);

                state.units.push({ el: span, text: cleanText, paraIdx: currentBlockIdx, sentIdx: sIdx, isSymbol: false });
                uIndex++;
            });
        } else {
            const sentences = pText.split(/(?<=[.!?|।])\s+/);
            sentences.forEach((sent, sIdx) => {
                let chunks = [];
                if (state.settings.use_chunking) {
                    chunks = chunkHindiTextForTTS(sent, state.settings.chunk_size || 3);
                } else {
                    chunks = sent.match(/\S+/g) || [];
                }
                chunks.forEach(chunk => {
                    if(!chunk.trim()) return;

                    const { html, cleanText, outBold, outItalic } = renderSpanContent(chunk, inBold, inItalic);
                    inBold = outBold;
                    inItalic = outItalic;

                    const span = document.createElement('span');
                    span.className = 'dictation-unit';
                    span.innerHTML = html;
                    span.dataset.index = uIndex;

                    pEl.appendChild(span);
                    pEl.appendChild(document.createTextNode(' '));

                    let isSymbol = /^[^a-zA-Z0-9\u0900-\u097F]+$/.test(cleanText);
                    if (cleanText === '-' || cleanText === '/') isSymbol = false;

                    state.units.push({ el: span, text: cleanText, paraIdx: currentBlockIdx, sentIdx: sIdx, isSymbol: isSymbol });
                    uIndex++;
                });
            });
        }
        fragment.appendChild(pEl);
        currentBlockIdx++;
    });

    if(dom.readingContent) dom.readingContent.appendChild(fragment);

    dom.readingContent.addEventListener('click', (e) => {
        const unitEl = e.target.closest('.dictation-unit');
        if (unitEl) {
            const selection = window.getSelection().toString();
            if (selection.trim().length === 0) {
                jumpTo(parseInt(unitEl.dataset.index), true);
            }
        }
    });

    calculateEstimatedTime();
}

// --- Smart Auto Scroll ---
let userScrolling = false;
let scrollTimeout = null;

function handleUserScroll() {
    userScrolling = true;
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => { userScrolling = false; }, 6000);
}

dom.panel.addEventListener('wheel', handleUserScroll, {passive: true});
dom.panel.addEventListener('touchmove', handleUserScroll, {passive: true});
document.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key) && !e.ctrlKey) {
        if(!state.isPlaying) handleUserScroll();
    }
});

function scrollToActive(force = false) {
    if ((userScrolling || !state.isPlaying || state.isEditing) && !force) return;
    const activeUnit = state.units[state.currentIndex];
    if (activeUnit && activeUnit.el) {
        activeUnit.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// --- TTS Engine ---

function updateUI() {
    if(state.isEditing) return;

    if (state.isPlaying) {
        dom.iconPlay.classList.add('hidden');
        dom.iconPause.classList.remove('hidden');
    } else {
        dom.iconPlay.classList.remove('hidden');
        dom.iconPause.classList.add('hidden');
    }

    let activePara = null;
    state.units.forEach((u, i) => {
        if(u.el) {
            u.el.classList.toggle('playing', i === state.currentIndex);
            if (i === state.currentIndex) activePara = u.el.closest('.paragraph');
        }
    });

    document.querySelectorAll('.paragraph').forEach(p => p.classList.remove('active-para'));
    if (activePara) activePara.classList.add('active-para');
    calculateEstimatedTime();
}

function stopTTS() {
    state.sessionId++;
    window.speechSynthesis.cancel();
    clearTimeout(state.delayTimer);
    state.isPlaying = false;
    updateUI();
}

function playPause() {
    if (state.isPlaying) {
        stopTTS();
    } else {
        if(state.units.length === 0) return;
        state.isPlaying = true;
        speakNext();
    }
}

function speakNext() {
    if (!state.isPlaying || state.currentIndex >= state.units.length) {
        if (state.currentIndex >= state.units.length) {
            stopTTS();
            state.currentIndex = 0;
            updateUI();
        }
        return;
    }

    const currentSid = ++state.sessionId;
    const unit = state.units[state.currentIndex];

    updateUI();
    scrollToActive();

    // Pacing mapped to User Multiplier (0 to 100): 0 -> 1.0x (slow), 50 -> 0.7x (normal), 100 -> 0.4x (fast)
    let pacingVal = Math.max(-50, Math.min(100, parseInt(state.settings.pacing) || 50));
    let userMultiplier = 1.0 - (pacingVal / 100) * 0.6;

    if (state.notebookLineGraphemes === undefined) state.notebookLineGraphemes = 0;

    let prevUnit = state.currentIndex > 0 ? state.units[state.currentIndex - 1] : null;
    if (!prevUnit || prevUnit.paraIdx !== unit.paraIdx) {
        state.notebookLineGraphemes = 0;
    }
    
    let currentChunkGraphemes = 0;
    if (!unit.isSymbol) {
        currentChunkGraphemes = Array.from(hindiSegmenter.segment(unit.text)).length;
    }

    if (state.operationMode === 'writing' && unit.isSymbol) {
        let bellTimes = 0;
        let nextUnit = state.units[state.currentIndex + 1];
        if (nextUnit && nextUnit.paraIdx > unit.paraIdx) bellTimes = 2;
        else if (/[।\.!?]/.test(unit.text)) bellTimes = 1;

        if (bellTimes > 0) playBell(bellTimes);

        let extraDelay = 0;
        if (bellTimes === 2) extraDelay = 1500 * userMultiplier;
        else if (bellTimes === 1) extraDelay = 1000 * userMultiplier;

        if (bellTimes > 0) {
            state.notebookLineGraphemes = 0;
        }

        state.delayTimer = setTimeout(() => {
            if(currentSid !== state.sessionId) return;
            state.currentIndex++;
            speakNext();
        }, 150 * userMultiplier + extraDelay);
        return;
    }

    const vIndex = dom.voiceSelect.value;
    let isHindiVoice = false;
    if (vIndex && state.voicesAvailable[vIndex]) {
        isHindiVoice = state.voicesAvailable[vIndex].lang.startsWith('hi');
    }

    let spokenText = toHindi(unit.text, isHindiVoice);
    window.speechSynthesis.cancel();

    const ut = new SpeechSynthesisUtterance(spokenText);

    if (vIndex && state.voicesAvailable[vIndex]) {
        let v = state.voicesAvailable[vIndex];
        ut.voice = v;
        ut.lang = v.lang;

        let baseRate = state.settings.speech_rate;
        if(v.name.includes('Microsoft') && v.localService) {
            baseRate *= 1.5;
        }
        ut.rate = baseRate;
    } else {
        ut.rate = state.settings.speech_rate;
    }

    ut.onstart = () => {
        state.ttsStartTimestamp = Date.now();
    };

    ut.onend = (e) => {
        if (currentSid !== state.sessionId) return;

        if (state.ttsStartTimestamp > 0) {
            let elapsed = e.elapsedTime || (Date.now() - state.ttsStartTimestamp);
            if (elapsed > 0) {
                let cleanText = unit.text.trim();
                // Accept basic Hindi + silent punctuations
                if (/^[\u0900-\u097F\s"'`:;]+$/.test(cleanText) && cleanText.length > 0) {
                    let wordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length;

                    if (wordCount >= 3) {
                        // Exclude silent punctuations and space for true character length. (\u0964 is Poornviram)
                        let realChars = cleanText.replace(/[\s"'`:;\u0964]/g, "").length;

                        if (realChars > 0) {
                            let speed = elapsed / realChars;
                            if (speed > 10 && speed < 300) {
                                state.ttsSpeed.msPerChar = (state.ttsSpeed.msPerChar * 0.7) + (speed * 0.3);
                                console.log(`[TTS Speed Updated] Learned from pure Hindi chunk: "${cleanText}" | Speed: ${speed.toFixed(2)} ms/char | New Average: ${state.ttsSpeed.msPerChar.toFixed(2)} ms/char`);
                                calculateEstimatedTime();
                            }
                        }
                    }
                }
            }
        }

        let bellTimes = 0;
        let nextUnit = state.units[state.currentIndex + 1];
        if (nextUnit && nextUnit.paraIdx > unit.paraIdx) bellTimes = 2;
        else if (/[।\.!?]$/.test(unit.text.trim())) bellTimes = 1;

        if (bellTimes > 0 && state.operationMode === 'writing') playBell(bellTimes);

        let extraDelay = 0;
        if (state.operationMode === 'writing') {
            if (bellTimes === 2) extraDelay = 1500 * userMultiplier;
            else if (bellTimes === 1) extraDelay = 1000 * userMultiplier;
        } else {
            if (bellTimes > 0) extraDelay = 200 * userMultiplier;
        }

        let delay = 0;
        if (state.operationMode === 'writing') {
            // Count actual characters (vowel marks will count as separate characters which is correct for writing strokes)
            let charCount = unit.text.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, "").length;
            let matraCount = (unit.text.match(/[\u093E-\u094C\u0901\u0902\u094D\u093F]/g) || []).length;
            let complexBuffer = (matraCount > 2) ? (matraCount * 400) : 0;

            // Base timing: 700ms per character
            let baseTime = charCount * 700;
            // Extra delay buffer: 1000ms at the end of each physical group for drawing shirorekha/lifting pen
            let bufferTime = 1000 + complexBuffer;

            delay = (baseTime + bufferTime) * userMultiplier + extraDelay;

            if (state.notebookLineGraphemes + currentChunkGraphemes >= 40 && bellTimes === 0) {
                console.log(`[Line Break Delay Add] Total line graphemes were ${state.notebookLineGraphemes}, chunk adds ${currentChunkGraphemes} pushing to ${state.notebookLineGraphemes + currentChunkGraphemes}. Adding extra notebook wrap delay of ${1500 * userMultiplier}ms.`);
                delay += 1500 * userMultiplier;
                state.notebookLineGraphemes = 0;
            } else {
                state.notebookLineGraphemes += currentChunkGraphemes;
            }

            if (bellTimes > 0) state.notebookLineGraphemes = 0;
        } else {
            delay = (150 * userMultiplier) + extraDelay;
        }

        state.delayTimer = setTimeout(() => {
            if (currentSid !== state.sessionId) return;
            state.currentIndex++;
            speakNext();
        }, delay);
    };

    ut.onerror = (e) => {
        if (currentSid !== state.sessionId) return;
        if (e.error !== 'canceled') {
            state.currentIndex++;
            speakNext();
        }
    };

    window.speechSynthesis.speak(ut);
}

// Fixed bug: if currently paused, do not involuntarily start playing on navigation
function jumpTo(idx, forcePlay = false) {
    if (idx >= 0 && idx < state.units.length) {
        let wasPlaying = state.isPlaying;
        stopTTS();
        state.currentIndex = idx;
        updateUI();
        scrollToActive(true);
        if (wasPlaying || forcePlay) {
            state.isPlaying = true;
            speakNext();
        }
    }
}

// Navigation Logic
function navBy(step) {
    if (state.units.length === 0) return;
    let newIdx = state.currentIndex + step;
    if (newIdx < 0) newIdx = 0;
    if (newIdx >= state.units.length) newIdx = state.units.length - 1;
    jumpTo(newIdx);
}

function navBySentence(dir) {
    if (state.units.length === 0) return;
    let cu = state.units[state.currentIndex];
    let target = state.currentIndex;

    if (dir > 0) {
        for(let i = target; i < state.units.length; i++){
            if(state.units[i].paraIdx > cu.paraIdx || state.units[i].sentIdx > cu.sentIdx){
                target = i; break;
            }
        }
    } else {
        let curStart = target;
        while(curStart > 0 && state.units[curStart-1].sentIdx === cu.sentIdx && state.units[curStart-1].paraIdx === cu.paraIdx) {
            curStart--;
        }
        if (target > curStart) {
            target = curStart;
        } else if (curStart > 0) {
            let prevCu = state.units[curStart - 1];
            target = curStart - 1;
            while(target > 0 && state.units[target-1].sentIdx === prevCu.sentIdx && state.units[target-1].paraIdx === prevCu.paraIdx) {
                target--;
            }
        }
    }
    jumpTo(target);
}

function navByParagraph(dir) {
    if (state.units.length === 0) return;
    let cu = state.units[state.currentIndex];
    let target = state.currentIndex;

    if (dir > 0) {
        for(let i = target; i < state.units.length; i++){
            if(state.units[i].paraIdx > cu.paraIdx){ target = i; break; }
        }
    } else {
        let curStart = target;
        while(curStart > 0 && state.units[curStart-1].paraIdx === cu.paraIdx) { curStart--; }
        if (target > curStart) {
            target = curStart;
        } else if (curStart > 0) {
            let pIdx = state.units[curStart - 1].paraIdx;
            target = curStart - 1;
            while(target > 0 && state.units[target-1].paraIdx === pIdx) { target--; }
        }
    }
    jumpTo(target);
}

// Handlers
dom.btnPrevWord.onclick = () => navBy(-1);
dom.btnNextWord.onclick = () => navBy(1);
dom.btnPrevSent.onclick = () => navBySentence(-1);
dom.btnNextSent.onclick = () => navBySentence(1);
dom.btnPlayPause.onclick = playPause;

document.addEventListener('keydown', (e) => {
    if (state.isEditing) return;

	if (e.code === 'Space') { e.preventDefault(); playPause(); }
	else if (e.code === 'ArrowRight') { e.preventDefault(); navBy(1); }
	else if (e.code === 'ArrowLeft') { e.preventDefault(); navBy(-1); }
    else if (e.ctrlKey) {
        if (e.code === 'ArrowDown') { e.preventDefault(); navByParagraph(1); }
        else if (e.code === 'ArrowUp') { e.preventDefault(); navByParagraph(-1); }
    } else {
        if (e.code === 'ArrowDown') { e.preventDefault(); navBySentence(1); }
        else if (e.code === 'ArrowUp') { e.preventDefault(); navBySentence(-1); }
    }
});

// Theme Management
const THEME_STATES = ['light', 'bluish-dark', 'amoled', 'system'];
const THEME_COLORS = {
    'light': '#f8fafc',
    'bluish-dark': '#0f172a',
    'amoled': '#000000',
    'system': '#f8fafc'
};

const btnThemeToggle = document.getElementById('btnThemeToggle');
const metaThemeColor = document.querySelector('meta[name="theme-color"]');

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-icon').forEach(el => el.classList.add('hidden'));

    let iconClass = '.theme-' + theme;
    let iconEl = document.querySelector(iconClass);
    if (iconEl) iconEl.classList.remove('hidden');

    let metaColor = THEME_COLORS[theme];
    if (theme === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        metaColor = isDark ? THEME_COLORS['bluish-dark'] : THEME_COLORS['light'];
    }
    if (metaThemeColor) metaThemeColor.setAttribute('content', metaColor);
}

if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
        let currentIdx = THEME_STATES.indexOf(state.settings.theme || 'light');
        let nextIdx = (currentIdx + 1) % THEME_STATES.length;
        let newTheme = THEME_STATES[nextIdx];

        state.settings.theme = newTheme;
        applyTheme(newTheme);
        localStorage.setItem('rs_settings', JSON.stringify(state.settings));
    });
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((state.settings.theme || 'light') === 'system') {
        applyTheme('system');
    }
});

// --- Header Scroll Logic for Landscape Mobile ---
let lastScrollTop = 0;
const headerEl = document.querySelector('.toolbar');
const scrollContainers = [dom.editor, dom.panel];

scrollContainers.forEach(container => {
    container.addEventListener('scroll', () => {
        const isLandscapeMobile = window.matchMedia('(max-height: 500px) and (orientation: landscape)').matches;
        const isPortraitMobile = window.matchMedia('(max-width: 768px) and (orientation: portrait)').matches;
        if (!isLandscapeMobile && !isPortraitMobile) {
            headerEl.classList.remove('hide-on-scroll');
            return;
        }

        let st = container.scrollTop;
        if (st > lastScrollTop && st > 50) {
            // Scroll down
            headerEl.classList.add('hide-on-scroll');
        } else if (st < lastScrollTop) {
            // Scroll up
            headerEl.classList.remove('hide-on-scroll');
        }
        lastScrollTop = st <= 0 ? 0 : st; // For Negative scrolling situations on mobile
    }, { passive: true });
});
