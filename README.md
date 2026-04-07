# 🎧 लेख पाठक - Sophisticated TTS Reader & Writing Assistant

A highly responsive, distraction-free Text-to-Speech (TTS) web application built natively for the browser.

I built this project out of frustration. I frequently needed a reliable tool to read back large blocks of written text to help catch typos or consume articles. I couldn't find a lightweight, offline-capable reader that gave me granular pacing control—so I built this.

Built entirely with **Vanilla JavaScript, HTML, and CSS**, this application requires no heavy frameworks, relies entirely on the native Web Speech API, perfectly syncs offline device voices, and costs nothing to use.

## ✨ Core Features

The app is separated into two highly specific modes tailored to how you want to consume text:

### 1. ✍️ Writing Assistant Mode (Word-by-Word Analysis)
Designed for proofreading and dictation. Instead of rushing through paragraphs, this mode parses your text and speaks it **word-by-word**.
- **Dynamic Algorithmic Pacing:** The app automatically calculates the physical character length of every individual word and intelligently assigns a dynamic delay. Short words are spoken quickly, while massive words get a biological "breath" delay so the pacing feels natural.
- **Audio Chime Notifications:** Utilizing the Web Audio API, the application synthesizes a sweet, decaying bell tone whenever it encounters a full-stop (`.`, `।`) or a new paragraph line. It acts as an auditory anchor so you don't even need to watch the screen while proofreading!
- **Intelligent Symbol Parsing:** Recognizes inline hyphens and slashes contextually. English words are spoken cleanly, while Hindi contexts will natively pronounce separators like `"हाइफन"`, `"बट्टा"`.

### 2. 📖 Simple Reading Mode (Sentence-by-Sentence)
Designed strictly for consuming articles and large bodies of text. This mode seamlessly stitches words together and reads standard flowing sentences natively, providing an uninterrupted audiobook-like experience.

---

### 🚀 Additional Power Features
- **Click-to-Play:** Click directly on any word or sentence in the generated canvas to instantly force the TTS engine to start speaking exactly from that position.
- **Zero-Dependency & Offline First:** Works completely offline without needing an active internet connection. On the very first launch, it intelligently auto-scans your local device voices and binds to the highest-quality native offline voices (e.g., auto-detecting the female Indian localized voice).
- **Limitless Canvas Navigation:** Support for advanced `Ctrl + Arrow Key` navigation allowing you to skip paragraphs and words on the fly.
- **Endless Modern UI:** Clean Android/Material You-inspired UI with floating bottom sheets, beautiful glassmorphism blur effects, and smooth scroll synchronization between text editing and the reading canvas.
- **Robust Customization:** Adjust Speech Rate, Dynamic Delays, Typography (Max-width, Line-spacing, Font-size), and Themes (Light, Bluish-Dark, AMOLED).

## 🛠️ Usage
No setup or `npm install` needed.
Because this is entirely built using standard web primitives, you only need to open the `index.html` file in any modern browser (Chrome/Edge preferably for the best localized TTS voices) and immediately paste your text.

## 🤝 Motivation
The goal of this project is to provide writers, proofreaders, and accessibility advocates with a smart, reliable reading assistant right in the browser, bypassing the bloat and paywalls of modern TTS extensions.

Enjoy reading!
