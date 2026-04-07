// Constants & State
const dom = {
    editor: document.getElementById('textEditor'),
    panel: document.getElementById('readingPanel'),
    wrapper: document.getElementById('contentWrapper'),

    btnEdit: document.getElementById('btnEditMode'),
    btnRead: document.getElementById('btnReadMode'),
    btnToggleSide: document.getElementById('btnToggleSide'),
    btnCloseSide: document.getElementById('btnCloseSide'),
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
    delayGroup: document.getElementById('delayGroup')
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
        theme: 'light'
    }
};

const digitMap = {
    '0': '०', '1': '१', '2': '२', '3': '३', '4': '४',
    '5': '५', '6': '६', '7': '७', '8': '८', '9': '९',
    '+': ' जमा ', '-': ' घटा ', '×': ' गुणा ', '÷': ' बटे ',
    '²': ' का स्क्वैर, ', '³': ' का क्यूब, '
};

function toHindi(text, isHindi = true) {
    if (text === '-') return isHindi ? 'हाइफन' : 'hyphen';
    if (text === '/') return isHindi ? 'बट्टे' : 'slash';
    return text.toString().replace(/[0-9+\-×÷²³]/g, (match) => digitMap[match] || match);
}

// Audio Bell Singleton
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
    dom.pacingSliderVal.textContent = state.settings.pacing + '%';

    state.settings.speech_rate = parseFloat(dom.speechRate.value);
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

    if (dom.voiceSelect.value !== "") {
        let v = state.voicesAvailable[dom.voiceSelect.value];
        if (v) state.settings.voiceToken = v.name;
    }

    applyCSSVars();
    localStorage.setItem('rs_settings', JSON.stringify(state.settings));
}

['pacingSlider', 'speechRate', 'textSize', 'lineSpacing', 'maxWidth', 'letterSpacing', 'wordSpacing'].forEach(id => {
    dom[id].addEventListener('input', updateSettings);
});

dom.voiceSelect.addEventListener('change', () => { stopTTS(); updateSettings(); });

// Mode Toggles
dom.modeToggles.forEach(btn => {
    btn.addEventListener('click', () => {
        stopTTS();
        dom.modeToggles.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.settings.op_mode = btn.dataset.mode;
        state.operationMode = state.settings.op_mode;
        dom.delayGroup.style.display = state.operationMode === 'writing' ? 'block' : 'none';
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

        dom.pacingSlider.value = state.settings.pacing;
        dom.speechRate.value = state.settings.speech_rate;
        dom.textSize.value = state.settings.text_size;
        dom.lineSpacing.value = state.settings.line_spacing;
        dom.maxWidth.value = state.settings.max_width;
        dom.letterSpacing.value = state.settings.letter_spacing || 0;
        dom.wordSpacing.value = state.settings.word_spacing || 0;

        state.operationMode = state.settings.op_mode;

        dom.modeToggles.forEach(b => b.classList.toggle('active', b.dataset.mode === state.operationMode));
        dom.delayGroup.style.display = state.operationMode === 'writing' ? 'block' : 'none';

        updateSettings();
        applyTheme(state.settings.theme || 'light');
    } catch(e){}
}

window.onload = () => { loadSettings(); initVoices(); setEditMode(true); };

// Sidebar
dom.btnToggleSide.onclick = () => dom.sidebar.classList.toggle('open');
dom.btnCloseSide.onclick = () => dom.sidebar.classList.remove('open');

// --- Edit/Read View Toggle ---

dom.btnEdit.onclick = () => setEditMode(true);
dom.btnRead.onclick = () => setEditMode(false);

function setEditMode(isEdit) {
    stopTTS();
    state.isEditing = isEdit;

    if (isEdit) {
        dom.btnEdit.classList.add('active');
        dom.btnRead.classList.remove('active');
        dom.editor.classList.remove('hidden');
        dom.panel.classList.add('hidden');
        dom.centerPlayback.classList.add('disabled');
        // Perfect scroll sync
        dom.editor.scrollTop = dom.panel.scrollTop;
    } else {
        dom.btnRead.classList.add('active');
        dom.btnEdit.classList.remove('active');
        dom.editor.classList.add('hidden');
        dom.panel.classList.remove('hidden');
        dom.centerPlayback.classList.remove('disabled');
        renderOutput();
        // Perfect scroll sync
        dom.panel.scrollTop = dom.editor.scrollTop;
    }
}

function wrapSymbols(text) {
    return text.replace(/([,\-\/\(\)।\.!?])/g, '<span class="sym-em">$1</span>');
}

// --- Text Parsing & Rendering ---
function renderOutput() {
    dom.panel.innerHTML = '';
    state.units = [];
    state.currentIndex = 0;

    // Split hyphens bridging normal words
    const text = dom.editor.value.trim()
        .replace(/([^\d\s])-([^\d\s])/g, '$1 - $2')
        .replace(/([^\s])\/([^\s])/g, '$1 / $2');
    if (!text) return;

    const paragraphs = text.split(/\n+/);
    let uIndex = 0;

    paragraphs.forEach((para, pIdx) => {
        if (!para.trim()) return;
        const pEl = document.createElement('div');
        pEl.className = 'paragraph';

        if (state.operationMode === 'reading') {
            // Split natively into full sentences for 'reading' mode
            const sentences = para.split(/(?<=[.!?|।])\s+/);
            sentences.forEach((sent, sIdx) => {
                if(!sent.trim()) return;
                const span = document.createElement('span');
                span.className = 'dictation-unit block-unit';
                span.innerHTML = wrapSymbols(sent) + ' ';
                span.dataset.index = uIndex;
                span.onclick = () => jumpTo(parseInt(span.dataset.index), true);
                pEl.appendChild(span);

                state.units.push({ el: span, text: sent, paraIdx: pIdx, sentIdx: sIdx, isSymbol: false });
                uIndex++;
            });
        } else {
            // Words for 'writing' mode
            const sentences = para.split(/(?<=[.!?|।])\s+/);
            sentences.forEach((sent, sIdx) => {
                const words = sent.match(/\S+/g) || [];
                words.forEach(word => {
                    if(!word.trim()) return;
                    const span = document.createElement('span');
                    span.className = 'dictation-unit';
                    span.innerHTML = wrapSymbols(word);
                    span.dataset.index = uIndex;
                    span.onclick = () => jumpTo(parseInt(span.dataset.index), true);

                    pEl.appendChild(span);
                    pEl.appendChild(document.createTextNode(' '));

                    let isSymbol = /^[^a-zA-Z0-9\u0900-\u097F]+$/.test(word);
                    if (word === '-' || word === '/') isSymbol = false;

                    state.units.push({ el: span, text: word, paraIdx: pIdx, sentIdx: sIdx, isSymbol: isSymbol });
                    uIndex++;
                });
            });
        }
        dom.panel.appendChild(pEl);
    });
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

function scrollToActive() {
    if (userScrolling || !state.isPlaying || state.isEditing) return;
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

    // Pacing value: 0 (slowest wait) to 100 (fastest / minimal wait).
    let invMult = 2.0 - (state.settings.pacing / 100) * 1.9;

    if (state.operationMode === 'writing' && unit.isSymbol) {
        let bellTimes = 0;
        let nextUnit = state.units[state.currentIndex + 1];
        if (nextUnit && nextUnit.paraIdx > unit.paraIdx) bellTimes = 2;
        else if (/[।\.!?]/.test(unit.text)) bellTimes = 1;

        if (bellTimes > 0) playBell(bellTimes);

        let extraDelay = (bellTimes > 0) ? 600 * invMult : 0;

        state.delayTimer = setTimeout(() => {
            if(currentSid !== state.sessionId) return;
            state.currentIndex++;
            speakNext();
        }, 150 * invMult + extraDelay);
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

    ut.onend = () => {
        if (currentSid !== state.sessionId) return;

        let bellTimes = 0;
        let nextUnit = state.units[state.currentIndex + 1];
        if (nextUnit && nextUnit.paraIdx > unit.paraIdx) bellTimes = 2;
        else if (/[।\.!?]$/.test(unit.text.trim())) bellTimes = 1;

        if (bellTimes > 0 && state.operationMode === 'writing') playBell(bellTimes);

        let extraDelay = (bellTimes > 0) ? (state.operationMode === 'writing' ? 600 * invMult : 600) : 0;

        state.currentIndex++;

        let delay = 0;
        if (state.operationMode === 'writing') {
            let len = unit.text.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, "").length;
            delay = invMult * (200 + (len * 100)) + extraDelay;
        } else {
            delay = 400 + extraDelay;
        }

        state.delayTimer = setTimeout(() => {
            if (currentSid !== state.sessionId) return;
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
        if (wasPlaying || forcePlay) {
            scrollToActive();
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
    'light': '#fdfefe',
    'bluish-dark': '#0f172a',
    'amoled': '#000000',
    'system': '#fdfefe'
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
