/**
 * ============================================================================
 * SILICON GEEK — Signature Animation Engine (script.js)
 * High-Precision Frame-Synchronized SVG Stroke & Cyan Laser Trail Animator
 * ============================================================================
 */

class SignatureAnimator {
  constructor(options = {}) {
    this.speed = options.speed || 1.0;
    this.loop = options.loop !== undefined ? options.loop : true;
    this.loopDelay = options.loopDelay || 1800;
    this.showUnderline = options.showUnderline !== undefined ? options.showUnderline : false;
    this.onProgress = options.onProgress || null;
    this.onStateChange = options.onStateChange || null;

    // Exact temporal schedule derived from the 60fps fountain-pen video recording
    this.strokeSchedule = [
      { id: 1, name: 'B Vertical Stem',     startMs: 0,    durationMs: 280,  trailRatio: 0.38 },
      { id: 2, name: 'B Double Bowl',       startMs: 320,  durationMs: 560,  trailRatio: 0.28 },
      { id: 3, name: 'Initial Period (.)',  startMs: 940,  durationMs: 110,  trailRatio: 0.65 },
      { id: 4, name: 'Main Signature Body', startMs: 1120, durationMs: 2450, trailRatio: 0.11 },
      { id: 5, name: 'Right Stem Crossbar', startMs: 3630, durationMs: 240,  trailRatio: 0.40 },
      { id: 6, name: 'Terminal Period (.)', startMs: 3930, durationMs: 110,  trailRatio: 0.65 }
    ];

    this.underlineTiming = { startMs: 3850, durationMs: 480, trailRatio: 0.30 };
    this.subtitleTriggerMs = 4020;
    this.totalDurationMs = 4800;

    this.strokes = [];
    this.underline = null;
    this.subtitleEl = document.getElementById('sig-subtitle');
    this.penTipEl = document.getElementById('pen-tip-glow');

    this.rafId = null;
    this.loopTimeoutId = null;
    this.isPlaying = false;
    this.startTime = 0;
    this.elapsedMs = 0;

    this.initGeometry();
  }

  initGeometry() {
    this.strokes = this.strokeSchedule.map(item => {
      const inkEl = document.getElementById(`ink-${item.id}`);
      const trailEl = document.getElementById(`trail-${item.id}`);
      const length = inkEl ? inkEl.getTotalLength() : 0;
      return {
        ...item,
        inkEl,
        trailEl,
        length,
        trailLength: Math.max(18, Math.min(135, length * item.trailRatio))
      };
    });

    const uInk = document.getElementById('ink-underline');
    const uTrail = document.getElementById('trail-underline');
    if (uInk && uTrail) {
      const uLen = uInk.getTotalLength();
      this.underline = {
        ...this.underlineTiming,
        inkEl: uInk,
        trailEl: uTrail,
        length: uLen,
        trailLength: uLen * this.underlineTiming.trailRatio
      };
    }
  }

  // Ease-in-out sine/cubic blend for natural human fountain-pen velocity
  easeStroke(t, strokeId) {
    if (strokeId === 4) {
      return t < 0.5
        ? 0.5 * Math.pow(2 * t, 1.12)
        : 1 - 0.5 * Math.pow(2 * (1 - t), 1.12);
    }
    return 0.5 - 0.5 * Math.cos(Math.PI * t);
  }

  renderAtTime(ms) {
    this.elapsedMs = Math.max(0, Math.min(this.totalDurationMs, ms));
    let activeTipPoint = null;

    // 1. Render each signature stroke
    for (const s of this.strokes) {
      if (!s.inkEl || !s.trailEl) continue;

      if (this.elapsedMs < s.startMs) {
        s.inkEl.style.opacity = '0';
        s.trailEl.style.opacity = '0';
      } else if (this.elapsedMs >= s.startMs && this.elapsedMs <= s.startMs + s.durationMs) {
        const rawT = (this.elapsedMs - s.startMs) / s.durationMs;
        const p = this.easeStroke(rawT, s.id);
        const drawnLen = p * s.length;

        // White ink stroke reveals up to drawnLen
        s.inkEl.style.opacity = '1';
        s.inkEl.style.strokeDasharray = `${drawnLen} ${s.length + 50}`;
        s.inkEl.style.strokeDashoffset = '0';

        // Cyan laser trail highlights the leading head segment [headStart .. drawnLen]
        const currentTrail = Math.min(drawnLen, s.trailLength);
        const headStart = Math.max(0, drawnLen - currentTrail);
        const fadeOut = rawT > 0.85 ? (1 - rawT) / 0.15 : 1;

        s.trailEl.style.opacity = String(Math.max(0, fadeOut));
        s.trailEl.style.strokeDasharray = `${currentTrail} ${s.length + 50}`;
        s.trailEl.style.strokeDashoffset = String(-headStart);

        try {
          activeTipPoint = s.inkEl.getPointAtLength(drawnLen);
        } catch (e) {}
      } else {
        const timeSinceEnd = this.elapsedMs - (s.startMs + s.durationMs);
        s.inkEl.style.opacity = '1';
        s.inkEl.style.strokeDasharray = `${s.length + 10} ${s.length + 50}`;
        s.inkEl.style.strokeDashoffset = '0';

        if (timeSinceEnd < 90) {
          const lingerRatio = 1 - timeSinceEnd / 90;
          const tailSeg = s.trailLength * lingerRatio;
          s.trailEl.style.opacity = String(lingerRatio * 0.8);
          s.trailEl.style.strokeDasharray = `${tailSeg} ${s.length + 50}`;
          s.trailEl.style.strokeDashoffset = String(-(s.length - tailSeg));
        } else {
          s.trailEl.style.opacity = '0';
        }
      }
    }

    // 2. Render optional underline accent rule
    if (this.underline && this.underline.inkEl && this.underline.trailEl) {
      const u = this.underline;
      if (!this.showUnderline || this.elapsedMs < u.startMs) {
        u.inkEl.style.opacity = '0';
        u.trailEl.style.opacity = '0';
      } else if (this.elapsedMs <= u.startMs + u.durationMs) {
        const rawT = (this.elapsedMs - u.startMs) / u.durationMs;
        const p = 1 - Math.pow(1 - rawT, 2.2);
        const drawnLen = p * u.length;
        u.inkEl.style.opacity = '0.85';
        u.inkEl.style.strokeDasharray = `${drawnLen} ${u.length + 50}`;
        u.inkEl.style.strokeDashoffset = '0';

        const currentTrail = Math.min(drawnLen, u.trailLength);
        const headStart = Math.max(0, drawnLen - currentTrail);
        u.trailEl.style.opacity = String(1 - rawT * 0.5);
        u.trailEl.style.strokeDasharray = `${currentTrail} ${u.length + 50}`;
        u.trailEl.style.strokeDashoffset = String(-headStart);
      } else {
        u.inkEl.style.opacity = '0.85';
        u.inkEl.style.strokeDasharray = `${u.length + 10} ${u.length + 50}`;
        u.inkEl.style.strokeDashoffset = '0';
        u.trailEl.style.opacity = '0';
      }
    }

    // 3. Update glowing leading pen tip dot
    if (this.penTipEl) {
      if (activeTipPoint) {
        this.penTipEl.setAttribute('cx', activeTipPoint.x.toFixed(1));
        this.penTipEl.setAttribute('cy', activeTipPoint.y.toFixed(1));
        this.penTipEl.style.opacity = '0.95';
      } else {
        this.penTipEl.style.opacity = '0';
      }
    }

    // 4. Trigger "SILICON GEEK" subtitle reveal
    if (this.subtitleEl) {
      if (this.elapsedMs >= this.subtitleTriggerMs) {
        this.subtitleEl.classList.add('visible');
      } else {
        this.subtitleEl.classList.remove('visible');
      }
    }

    if (this.onProgress) {
      this.onProgress(this.elapsedMs / this.totalDurationMs, this.elapsedMs);
    }
  }

  play() {
    this.stopTimers();
    if (this.elapsedMs >= this.totalDurationMs - 20) {
      this.elapsedMs = 0;
    }
    this.isPlaying = true;
    if (this.onStateChange) this.onStateChange(true);

    let lastTimestamp = performance.now();
    const tick = (now) => {
      if (!this.isPlaying) return;
      const dt = (now - lastTimestamp) * this.speed;
      lastTimestamp = now;
      const nextMs = this.elapsedMs + dt;

      if (nextMs >= this.totalDurationMs) {
        this.renderAtTime(this.totalDurationMs);
        this.isPlaying = false;
        if (this.onStateChange) this.onStateChange(false);

        if (this.loop) {
          this.loopTimeoutId = setTimeout(() => {
            this.elapsedMs = 0;
            this.play();
          }, this.loopDelay);
        }
        return;
      }

      this.renderAtTime(nextMs);
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  pause() {
    this.isPlaying = false;
    this.stopTimers();
    if (this.onStateChange) this.onStateChange(false);
  }

  restart() {
    this.stopTimers();
    this.elapsedMs = 0;
    this.renderAtTime(0);
    this.play();
  }

  seek(progressRatio) {
    this.pause();
    const targetMs = Math.max(0, Math.min(1, progressRatio)) * this.totalDurationMs;
    this.renderAtTime(targetMs);
  }

  stopTimers() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.loopTimeoutId) {
      clearTimeout(this.loopTimeoutId);
      this.loopTimeoutId = null;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.sigAnimator = new SignatureAnimator({
    speed: 1.0,
    loop: true,
    showUnderline: false
  });
  window.sigAnimator.play();
});