/**
 * Live speech follow-along using the browser SpeechRecognition API.
 * Used to light lyric letters from the microphone, and to show a live
 * line when no prepared lyrics are loaded.
 */
export class SpeechFollow {
  constructor() {
    this.heard = '';
    this.liveLine = '';
    this.active = false;
    this.supported = typeof window !== 'undefined' && Boolean(
      window.SpeechRecognition || window.webkitSpeechRecognition,
    );
    this.recognition = null;
  }

  start() {
    if (!this.supported || this.active) return this.supported;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new Ctor();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = document.documentElement.lang || 'en-US';
    this.recognition.onresult = (event) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) finalText += `${piece} `;
        else interim += piece;
      }
      const chunk = `${finalText} ${interim}`.trim();
      if (chunk) {
        this.heard = `${this.heard} ${chunk}`.trim().slice(-400);
        this.liveLine = chunk;
      }
    };
    this.recognition.onerror = () => {};
    try {
      this.recognition.start();
      this.active = true;
    } catch {
      this.active = false;
    }
    return this.active;
  }

  stop() {
    this.active = false;
    try { this.recognition?.stop(); } catch { /* ignore */ }
    this.recognition = null;
  }
}
