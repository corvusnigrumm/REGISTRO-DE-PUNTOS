/* ==========================================================================
   games.js - Lógica interactiva para:
   1. Navegación fluida por pestañas (Puntos, Serpiente, DOOM)
   2. Juego de la Serpiente Clásica con controles táctiles móviles, audio y partículas
   3. Estación de DOOM (1993) WebAssembly con soporte de pantalla completa y móvil
   ========================================================================== */

(function () {
  "use strict";

  /* ==========================================================================
     SISTEMA DE AUDIO Y EFECTOS SINTETIZADOS (Web Audio API)
     Sin dependencias externas, funciona 100% offline
     ========================================================================== */
  class SoundFX {
    constructor() {
      this.ctx = null;
      this.enabled = localStorage.getItem("snake_sound_muted") !== "true";
    }

    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    }

    toggle() {
      this.enabled = !this.enabled;
      localStorage.setItem("snake_sound_muted", (!this.enabled).toString());
      return this.enabled;
    }

    playTone(freq, type, duration, endFreq = null, volume = 0.15) {
      if (!this.enabled) return;
      try {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (endFreq) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), now + duration);
        }

        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + duration);
      } catch (e) {
        /* Silencioso si el navegador bloquea audio */
      }
    }

    playEat() {
      // Arpegio ascendente clásico retro
      this.playTone(440, "sine", 0.08, 660, 0.2);
    }

    playBonus() {
      // Chime dorado trifónico
      if (!this.enabled) return;
      this.playTone(523.25, "triangle", 0.1, 783.99, 0.25);
      setTimeout(() => this.playTone(659.25, "sine", 0.12, 1046.5, 0.25), 60);
    }

    playLevelUp() {
      if (!this.enabled) return;
      const notes = [440, 554, 659, 880];
      notes.forEach((freq, i) => {
        setTimeout(() => this.playTone(freq, "triangle", 0.09, null, 0.2), i * 70);
      });
    }

    playCrash() {
      this.playTone(220, "sawtooth", 0.35, 40, 0.3);
    }

    playClick() {
      this.playTone(800, "sine", 0.03, 400, 0.05);
    }
  }

  /* ==========================================================================
     SISTEMA HÁPTICO (Vibración móvil)
     ========================================================================== */
  class Haptics {
    constructor() {
      this.enabled = localStorage.getItem("snake_haptics_muted") !== "true";
    }

    toggle() {
      this.enabled = !this.enabled;
      localStorage.setItem("snake_haptics_muted", (!this.enabled).toString());
      return this.enabled;
    }

    vibrate(pattern) {
      if (!this.enabled || !navigator.vibrate) return;
      try {
        navigator.vibrate(pattern);
      } catch (e) {}
    }

    tap() {
      this.vibrate(20);
    }

    bonus() {
      this.vibrate([25, 40, 40]);
    }

    crash() {
      this.vibrate([100, 50, 180]);
    }
  }

  const sounds = new SoundFX();
  const haptics = new Haptics();

  /* ==========================================================================
     MOTOR DEL JUEGO DE LA SERPIENTE (SNAKE)
     ========================================================================== */
  class SnakeEngine {
    constructor() {
      this.canvas = document.getElementById("snake-canvas");
      this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
      this.gridSize = 20; // 20x20 celdas
      this.cellPixel = 20;

      // Estado de juego
      this.snake = [];
      this.dir = { x: 1, y: 0 };
      this.nextDir = { x: 1, y: 0 };
      this.food = { x: 10, y: 10 };
      this.goldenFood = null;
      this.goldenTimer = null;
      this.foodCount = 0;

      this.score = 0;
      this.highScore = parseInt(localStorage.getItem("snake_high_score") || "0", 10);
      this.level = 1;
      this.speed = 135; // ms por tick
      this.baseSpeed = 135;
      this.mode = "progressive"; // progressive, easy, extreme
      this.wrapWalls = false; // si true, atraviesa paredes

      this.isPlaying = false;
      this.isPaused = false;
      this.isGameOver = false;
      this.hasBeatenRecord = false;

      this.gameLoopTimer = null;
      this.particles = [];
      this.animFrameId = null;

      // Gestos táctiles
      this.touchStartX = 0;
      this.touchStartY = 0;
      this.touchStartTime = 0;

      // Carga de recursos visuales personalizados (imágenes locales)
      this.headImg = new Image();
      this.headImg.src = "snake_head.png";
      this.headImgLoaded = false;
      this.headImg.onload = () => { this.headImgLoaded = true; this.render(); };

      this.chickenImg = new Image();
      this.chickenImg.src = "chicken_leg.png";
      this.chickenImgLoaded = false;
      this.chickenImg.onload = () => { this.chickenImgLoaded = true; this.render(); };

      this.bgImg = new Image();
      this.bgImg.src = "IMAGEN DE FONDO SERPIENTE.jpeg";
      this.bgImgLoaded = false;
      this.bgImg.onload = () => { this.bgImgLoaded = true; this.render(); };

      this.initDOM();
      this.setupControls();
      this.resizeCanvas();
      this.resetGame();
      this.render();
    }

    initDOM() {
      this.scoreEl = document.getElementById("snake-score");
      this.highScoreEl = document.getElementById("snake-highscore");
      this.levelEl = document.getElementById("snake-level");
      this.lengthEl = document.getElementById("snake-length");

      this.overlay = document.getElementById("snake-overlay");
      this.overlayTitle = document.getElementById("snake-overlay-title");
      this.overlaySub = document.getElementById("snake-overlay-sub");
      this.overlayHead = document.getElementById("snake-overlay-head");
      this.overlayRecordTag = document.getElementById("snake-overlay-record");
      this.overlayBtn = document.getElementById("snake-btn-overlay");

      this.btnSound = document.getElementById("snake-btn-sound");
      this.btnHaptic = document.getElementById("snake-btn-haptic");
      this.btnWalls = document.getElementById("snake-btn-walls");
      this.btnPause = document.getElementById("snake-btn-pause");
      this.btnRestart = document.getElementById("snake-btn-restart");
      this.modeSelect = document.getElementById("snake-mode-select");

      if (this.highScoreEl) {
        this.highScoreEl.textContent = this.highScore.toLocaleString();
      }

      this.updateToolButtons();
    }

    updateToolButtons() {
      if (this.btnSound) {
        this.btnSound.textContent = sounds.enabled ? "Sonido ON" : "Sonido OFF";
        this.btnSound.classList.toggle("active", sounds.enabled);
      }
      if (this.btnHaptic) {
        this.btnHaptic.textContent = haptics.enabled ? "Vibración ON" : "Vibración OFF";
        this.btnHaptic.classList.toggle("active", haptics.enabled);
      }
      if (this.btnWalls) {
        this.btnWalls.textContent = this.wrapWalls ? "Bordes: Traspasar" : "Bordes: Mortales";
        this.btnWalls.classList.toggle("active", this.wrapWalls);
      }
    }

    resizeCanvas() {
      if (!this.canvas) return;
      const rect = this.canvas.parentElement.getBoundingClientRect();
      const size = Math.min(rect.width, 500);
      const dpr = window.devicePixelRatio || 1;

      this.canvas.width = size * dpr;
      this.canvas.height = size * dpr;
      this.cellPixel = (size * dpr) / this.gridSize;

      this.ctx.setTransform(1, 0, 0, 1, 0, 0); // reset scale
      this.render();
    }

    resetGame() {
      this.snake = [
        { x: 6, y: 10 },
        { x: 5, y: 10 },
        { x: 4, y: 10 },
      ];
      this.dir = { x: 1, y: 0 };
      this.nextDir = { x: 1, y: 0 };
      this.score = 0;
      this.level = 1;
      this.foodCount = 0;
      this.goldenFood = null;
      if (this.goldenTimer) clearTimeout(this.goldenTimer);

      this.applyDifficulty();
      this.spawnFood();
      this.particles = [];
      this.isGameOver = false;
      this.isPaused = false;
      this.hasBeatenRecord = false;

      this.updateScoreboard();
    }

    applyDifficulty() {
      if (this.mode === "easy") {
        this.speed = 150;
      } else if (this.mode === "extreme") {
        this.speed = 85;
      } else {
        // progressive
        this.speed = Math.max(55, 140 - (this.level - 1) * 8);
      }
    }

    spawnFood() {
      let valid = false;
      let pos = { x: 0, y: 0 };
      while (!valid) {
        pos = {
          x: Math.floor(Math.random() * this.gridSize),
          y: Math.floor(Math.random() * this.gridSize)
        };
        valid = !this.snake.some(seg => seg.x === pos.x && seg.y === pos.y);
      }
      this.food = pos;
    }

    spawnGoldenFood() {
      let valid = false;
      let pos = { x: 0, y: 0 };
      let attempts = 0;
      while (!valid && attempts < 50) {
        pos = {
          x: Math.floor(Math.random() * this.gridSize),
          y: Math.floor(Math.random() * this.gridSize)
        };
        valid = !this.snake.some(seg => seg.x === pos.x && seg.y === pos.y) &&
                !(this.food.x === pos.x && this.food.y === pos.y);
        attempts++;
      }
      if (valid) {
        this.goldenFood = { ...pos, createdAt: Date.now(), lifespan: 7500 };
        if (this.goldenTimer) clearTimeout(this.goldenTimer);
        this.goldenTimer = setTimeout(() => {
          this.goldenFood = null;
        }, 7500);
      }
    }

    addParticles(x, y, color, count = 12) {
      const px = (x + 0.5) * this.cellPixel;
      const py = (y + 0.5) * this.cellPixel;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1.5;
        this.particles.push({
          x: px,
          y: py,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: Math.random() * 4 + 2,
          color: color,
          alpha: 1,
          decay: Math.random() * 0.03 + 0.02
        });
      }
    }

    start() {
      sounds.init();
      this.resetGame();
      this.isPlaying = true;
      this.isPaused = false;
      this.hideOverlay();
      this.runGameLoop();
      this.startAnimLoop();
    }

    pauseToggle() {
      if (!this.isPlaying || this.isGameOver) return;
      this.isPaused = !this.isPaused;
      if (this.btnPause) {
        this.btnPause.textContent = this.isPaused ? "Continuar" : "Pausa";
      }
      if (this.isPaused) {
        if (this.gameLoopTimer) clearTimeout(this.gameLoopTimer);
        this.showOverlay("PAUSA", "Presiona continuar para reanudar la partida.", "CONTINUAR");
      } else {
        this.hideOverlay();
        this.runGameLoop();
      }
    }

    runGameLoop() {
      if (this.gameLoopTimer) clearTimeout(this.gameLoopTimer);
      if (!this.isPlaying || this.isPaused || this.isGameOver) return;

      this.step();

      if (this.isPlaying && !this.isGameOver && !this.isPaused) {
        this.gameLoopTimer = setTimeout(() => this.runGameLoop(), this.speed);
      }
    }

    startAnimLoop() {
      if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
      const loop = () => {
        this.updateParticles();
        this.render();
        if (this.isPlaying || this.particles.length > 0) {
          this.animFrameId = requestAnimationFrame(loop);
        }
      };
      this.animFrameId = requestAnimationFrame(loop);
    }

    step() {
      this.dir = { ...this.nextDir };
      let nextHead = {
        x: this.snake[0].x + this.dir.x,
        y: this.snake[0].y + this.dir.y
      };

      // Manejo de bordes
      if (this.wrapWalls) {
        if (nextHead.x < 0) nextHead.x = this.gridSize - 1;
        if (nextHead.x >= this.gridSize) nextHead.x = 0;
        if (nextHead.y < 0) nextHead.y = this.gridSize - 1;
        if (nextHead.y >= this.gridSize) nextHead.y = 0;
      } else {
        if (
          nextHead.x < 0 ||
          nextHead.x >= this.gridSize ||
          nextHead.y < 0 ||
          nextHead.y >= this.gridSize
        ) {
          this.gameOver();
          return;
        }
      }

      // Colisión con sí misma
      if (this.snake.some(seg => seg.x === nextHead.x && seg.y === nextHead.y)) {
        this.gameOver();
        return;
      }

      // Avanzar serpiente
      this.snake.unshift(nextHead);

      // Comprobar comida normal (presa de pollo)
      if (nextHead.x === this.food.x && nextHead.y === this.food.y) {
        this.score += 10;
        this.foodCount++;
        sounds.playEat();
        haptics.tap();
        this.addParticles(nextHead.x, nextHead.y, "#f59e0b", 14);

        // Aumentar nivel y dificultad
        if (this.foodCount % 4 === 0) {
          this.level++;
          sounds.playLevelUp();
          this.applyDifficulty();
        }

        // Posibilidad de spawn de comida dorada cada 5 alimentos
        if (this.foodCount % 5 === 0 && !this.goldenFood) {
          this.spawnGoldenFood();
        }

        this.spawnFood();
        this.checkRecord();
        this.updateScoreboard();
      }
      // Comprobar comida dorada
      else if (
        this.goldenFood &&
        nextHead.x === this.goldenFood.x &&
        nextHead.y === this.goldenFood.y
      ) {
        this.score += 50;
        sounds.playBonus();
        haptics.bonus();
        this.addParticles(nextHead.x, nextHead.y, "#ffd700", 25);
        this.goldenFood = null;
        if (this.goldenTimer) clearTimeout(this.goldenTimer);
        this.checkRecord();
        this.updateScoreboard();
      } else {
        // No comió: quitar última sección para mantener tamaño
        this.snake.pop();
      }
    }

    checkRecord() {
      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem("snake_high_score", this.highScore.toString());
        if (this.highScoreEl) this.highScoreEl.textContent = this.highScore.toLocaleString();

        if (!this.hasBeatenRecord && this.score > 20) {
          this.hasBeatenRecord = true;
          if (typeof window.launchFireworks === "function") {
            window.launchFireworks();
          }
        }
      }
    }

    gameOver() {
      this.isGameOver = true;
      this.isPlaying = false;
      if (this.gameLoopTimer) clearTimeout(this.gameLoopTimer);

      sounds.playCrash();
      haptics.crash();

      if (this.snake.length > 0) {
        this.addParticles(this.snake[0].x, this.snake[0].y, "#ef4444", 24);
      }

      const isNewRecord = this.hasBeatenRecord || (this.score >= this.highScore && this.score > 0);
      const subMsg = isNewRecord
        ? `Puntuación: ${this.score} pts (¡Nuevo Récord!)`
        : `Puntuación: ${this.score} pts · Récord actual: ${this.highScore} pts`;

      this.showOverlay("Has perdido maldito exitoso inútil", subMsg, "REINTENTAR", isNewRecord, true);
    }

    updateScoreboard() {
      if (this.scoreEl) this.scoreEl.textContent = this.score.toLocaleString();
      if (this.levelEl) this.levelEl.textContent = this.level.toString();
      if (this.lengthEl) this.lengthEl.textContent = this.snake.length.toString();
    }

    showOverlay(title, sub, btnText, showRecordBadge = false, isGameOver = false) {
      if (!this.overlay) return;
      if (this.overlayTitle) {
        this.overlayTitle.textContent = title;
        this.overlayTitle.classList.toggle("gameover", isGameOver);
      }
      if (this.overlaySub) this.overlaySub.textContent = sub;
      if (this.overlayBtn) this.overlayBtn.textContent = btnText;
      if (this.overlayRecordTag) {
        this.overlayRecordTag.style.display = showRecordBadge ? "inline-flex" : "none";
      }
      this.overlay.classList.add("active");
    }

    hideOverlay() {
      if (this.overlay) this.overlay.classList.remove("active");
    }

    setDirection(dx, dy) {
      sounds.init();
      // Prevenir giro 180° sobre sí misma
      if (dx !== 0 && this.dir.x !== 0 && dx === -this.dir.x) return;
      if (dy !== 0 && this.dir.y !== 0 && dy === -this.dir.y) return;
      this.nextDir = { x: dx, y: dy };
    }

    setupControls() {
      // 1. Teclas de Teclado
      window.addEventListener("keydown", (e) => {
        // Solo responder si estamos viendo la sección de serpiente
        const snakeSec = document.getElementById("section-snake");
        if (!snakeSec || snakeSec.classList.contains("hidden")) return;

        switch (e.key) {
          case "ArrowUp":
          case "w":
          case "W":
            e.preventDefault();
            this.setDirection(0, -1);
            break;
          case "ArrowDown":
          case "s":
          case "S":
            e.preventDefault();
            this.setDirection(0, 1);
            break;
          case "ArrowLeft":
          case "a":
          case "A":
            e.preventDefault();
            this.setDirection(-1, 0);
            break;
          case "ArrowRight":
          case "d":
          case "D":
            e.preventDefault();
            this.setDirection(1, 0);
            break;
          case " ":
            e.preventDefault();
            if (!this.isPlaying || this.isGameOver) {
              this.start();
            } else {
              this.pauseToggle();
            }
            break;
          case "r":
          case "R":
            e.preventDefault();
            this.start();
            break;
        }
      });

      // 2. Gestos táctiles Swipe en Canvas
      if (this.canvas) {
        this.canvas.addEventListener(
          "touchstart",
          (e) => {
            const touch = e.touches[0];
            this.touchStartX = touch.clientX;
            this.touchStartY = touch.clientY;
            this.touchStartTime = Date.now();
          },
          { passive: true }
        );

        this.canvas.addEventListener(
          "touchend",
          (e) => {
            if (!this.isPlaying) return;
            const touch = e.changedTouches[0];
            const dx = touch.clientX - this.touchStartX;
            const dy = touch.clientY - this.touchStartY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const duration = Date.now() - this.touchStartTime;

            // Swipe mínimo de 22px en menos de 500ms
            if (dist > 22 && duration < 500) {
              if (Math.abs(dx) > Math.abs(dy)) {
                // Horizontal
                this.setDirection(dx > 0 ? 1 : -1, 0);
              } else {
                // Vertical
                this.setDirection(0, dy > 0 ? 1 : -1);
              }
              haptics.tap();
            }
          },
          { passive: true }
        );
      }

      // 3. Botones del D-Pad Virtual (Móvil)
      const bindDpad = (id, dx, dy) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        const trigger = (e) => {
          if (e.cancelable) e.preventDefault();
          sounds.init();
          btn.classList.add("pressed");
          if (!this.isPlaying || this.isGameOver) {
            this.start();
          }
          this.setDirection(dx, dy);
          haptics.tap();
        };

        const release = () => btn.classList.remove("pressed");

        btn.addEventListener("touchstart", trigger, { passive: false });
        btn.addEventListener("touchend", release);
        btn.addEventListener("mousedown", trigger);
        btn.addEventListener("mouseup", release);
        btn.addEventListener("mouseleave", release);
      };

      bindDpad("dpad-up", 0, -1);
      bindDpad("dpad-down", 0, 1);
      bindDpad("dpad-left", -1, 0);
      bindDpad("dpad-right", 1, 0);

      const dpadCenter = document.getElementById("dpad-center");
      if (dpadCenter) {
        dpadCenter.addEventListener("click", () => this.pauseToggle());
      }

      // 4. Botones de barra de herramientas
      if (this.overlayBtn) {
        this.overlayBtn.addEventListener("click", () => this.start());
      }
      if (this.btnPause) {
        this.btnPause.addEventListener("click", () => this.pauseToggle());
      }
      if (this.btnRestart) {
        this.btnRestart.addEventListener("click", () => this.start());
      }
      if (this.btnSound) {
        this.btnSound.addEventListener("click", () => {
          sounds.toggle();
          this.updateToolButtons();
          sounds.playClick();
        });
      }
      if (this.btnHaptic) {
        this.btnHaptic.addEventListener("click", () => {
          haptics.toggle();
          this.updateToolButtons();
          haptics.tap();
        });
      }
      if (this.btnWalls) {
        this.btnWalls.addEventListener("click", () => {
          this.wrapWalls = !this.wrapWalls;
          this.updateToolButtons();
          sounds.playClick();
        });
      }
      if (this.modeSelect) {
        this.modeSelect.addEventListener("change", (e) => {
          this.mode = e.target.value;
          this.applyDifficulty();
          sounds.playClick();
        });
      }

      window.addEventListener("resize", () => this.resizeCanvas());
    }

    updateParticles() {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.alpha -= p.decay;
        if (p.alpha <= 0) {
          this.particles.splice(i, 1);
        }
      }
    }

    render() {
      if (!this.ctx || !this.canvas) return;
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const cp = this.cellPixel;

      // Fondo: Imagen personalizada solicitada por el usuario
      if (this.bgImgLoaded && this.bgImg.complete && this.bgImg.naturalWidth > 0) {
        ctx.drawImage(this.bgImg, 0, 0, w, h);
        // Sutil viñeta oscura para legibilidad y contraste superior del juego
        ctx.fillStyle = "rgba(4, 10, 6, 0.45)";
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = "#0a1208";
        ctx.fillRect(0, 0, w, h);
      }

      // Rejilla sutil retro
      ctx.strokeStyle = "rgba(45, 122, 82, 0.12)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= this.gridSize; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cp, 0);
        ctx.lineTo(i * cp, h);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i * cp);
        ctx.lineTo(w, i * cp);
        ctx.stroke();
      }

      // 1. Dibujar Comida Normal: Presa de pollo
      if (this.food) {
        const fx = this.food.x * cp;
        const fy = this.food.y * cp;
        const centerX = fx + cp / 2;
        const centerY = fy + cp / 2;

        // Aura brillante ámbar / dorada
        const glowRadius = cp * 0.8;
        const glow = ctx.createRadialGradient(centerX, centerY, 2, centerX, centerY, glowRadius);
        glow.addColorStop(0, "rgba(245, 158, 11, 0.75)");
        glow.addColorStop(0.5, "rgba(217, 119, 6, 0.25)");
        glow.addColorStop(1, "rgba(217, 119, 6, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        if (this.chickenImgLoaded && this.chickenImg.complete && this.chickenImg.naturalWidth > 0) {
          // Micro-animación de respiración / pulso
          const pulse = Math.sin(Date.now() / 150) * (cp * 0.04);
          const size = cp * 0.95 + pulse;
          ctx.drawImage(this.chickenImg, centerX - size / 2, centerY - size / 2, size, size);
        } else {
          // Fallback vectorial
          ctx.fillStyle = "#d97706";
          ctx.beginPath();
          ctx.arc(centerX, centerY, cp * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 2. Comida especial dorada
      if (this.goldenFood) {
        const gx = this.goldenFood.x * cp;
        const gy = this.goldenFood.y * cp;
        const centerX = gx + cp / 2;
        const centerY = gy + cp / 2;
        const gRadius = cp * 0.65;

        const timeRatio = 1 - (Date.now() - this.goldenFood.createdAt) / this.goldenFood.lifespan;

        // Resplandor dorado
        const gGlow = ctx.createRadialGradient(centerX, centerY, 2, centerX, centerY, gRadius * 2);
        gGlow.addColorStop(0, "rgba(255, 215, 0, 0.9)");
        gGlow.addColorStop(0.6, "rgba(255, 180, 0, 0.3)");
        gGlow.addColorStop(1, "rgba(255, 180, 0, 0)");
        ctx.fillStyle = gGlow;
        ctx.beginPath();
        ctx.arc(centerX, centerY, gRadius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Anillo de tiempo
        if (timeRatio > 0) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(centerX, centerY, gRadius + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * timeRatio);
          ctx.stroke();
        }

        if (this.chickenImgLoaded && this.chickenImg.complete && this.chickenImg.naturalWidth > 0) {
          const goldSize = cp * 1.15;
          ctx.save();
          ctx.filter = "brightness(1.3) contrast(1.1) drop-shadow(0 0 6px #ffd700)";
          ctx.drawImage(this.chickenImg, centerX - goldSize / 2, centerY - goldSize / 2, goldSize, goldSize);
          ctx.restore();
        } else {
          ctx.fillStyle = "#ffd700";
          ctx.beginPath();
          ctx.arc(centerX, centerY, gRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 3. Dibujar Serpiente
      if (this.snake.length > 0) {
        for (let i = this.snake.length - 1; i >= 0; i--) {
          const seg = this.snake[i];
          const sx = seg.x * cp;
          const sy = seg.y * cp;
          const pad = 2;
          const isHead = (i === 0);

          if (isHead) {
            const centerX = sx + cp / 2;
            const centerY = sy + cp / 2;

            if (this.headImgLoaded && this.headImg.complete && this.headImg.naturalWidth > 0) {
              ctx.save();
              ctx.translate(centerX, centerY);

              // Rotación según dirección
              let angle = 0;
              if (this.dir.x === 1) angle = 0;              // Derecha (orientación nativa)
              else if (this.dir.x === -1) angle = Math.PI;  // Izquierda
              else if (this.dir.y === 1) angle = Math.PI / 2;   // Abajo
              else if (this.dir.y === -1) angle = -Math.PI / 2; // Arriba

              ctx.rotate(angle);

              // Borde redondeado suave para la cabeza
              const headSize = cp * 1.18;
              ctx.beginPath();
              ctx.arc(0, 0, headSize / 2, 0, Math.PI * 2);
              ctx.clip();

              ctx.drawImage(this.headImg, -headSize / 2, -headSize / 2, headSize, headSize);
              ctx.restore();
            } else {
              // Fallback si aún no carga imagen
              ctx.fillStyle = "#3fa076";
              this.roundRect(ctx, sx + pad, sy + pad, cp - pad * 2, cp - pad * 2, cp * 0.35);
              ctx.fill();
            }
          } else {
            // Segmento de cuerpo: degradado esmeralda con escama interna
            const factor = 1 - (i / this.snake.length) * 0.45;
            ctx.fillStyle = `rgba(31, 140, 75, ${factor})`;
            this.roundRect(ctx, sx + pad, sy + pad, cp - pad * 2, cp - pad * 2, cp * 0.3);
            ctx.fill();

            // Resplandor de escama interna
            ctx.fillStyle = `rgba(122, 236, 160, ${factor * 0.35})`;
            this.roundRect(ctx, sx + pad + 2, sy + pad + 2, cp - (pad + 2) * 2, cp - (pad + 2) * 2, cp * 0.2);
            ctx.fill();
          }
        }
      }

      // 4. Dibujar Partículas
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
    }

    roundRect(ctx, x, y, width, height, radius) {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    }
  }

  /* ==========================================================================
     CONTROLADOR DE DOOM (1993)
     ========================================================================== */
  class DoomController {
    constructor() {
      this.frame = document.getElementById("doom-frame");
      this.loader = document.getElementById("doom-loader");
      this.container = document.getElementById("doom-container-card");
      this.btnFullscreen = document.getElementById("doom-btn-fullscreen");
      this.btnReload = document.getElementById("doom-btn-reload");
      this.isLoaded = false;

      this.sources = {
        cloudflare: "https://silentspacemarine.com",
        archive: "https://archive.org/embed/DoomsharewareEpisode"
      };
      this.currentSource = "cloudflare";

      this.initEvents();
    }

    load() {
      if (this.isLoaded || !this.frame) return;
      this.isLoaded = true;
      this.frame.src = this.sources[this.currentSource];

      this.frame.onload = () => {
        if (this.loader) this.loader.classList.add("loaded");
      };
    }

    reload() {
      if (!this.frame) return;
      if (this.loader) this.loader.classList.remove("loaded");
      this.frame.src = this.sources[this.currentSource];
    }

    toggleFullscreen() {
      const el = this.container || this.frame;
      if (!el) return;

      if (!document.fullscreenElement) {
        if (el.requestFullscreen) {
          el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        } else if (el.msRequestFullscreen) {
          el.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    }

    initEvents() {
      if (this.btnFullscreen) {
        this.btnFullscreen.addEventListener("click", () => this.toggleFullscreen());
      }
      if (this.btnReload) {
        this.btnReload.addEventListener("click", () => this.reload());
      }

      const mirrorSelect = document.getElementById("doom-mirror-select");
      if (mirrorSelect) {
        mirrorSelect.addEventListener("change", (e) => {
          this.currentSource = e.target.value;
          this.reload();
        });
      }
    }
  }

  /* ==========================================================================
     GESTOR DE PESTAÑAS (TABS)
     ========================================================================== */
  window.currentAppTab = "dashboard";
  let snakeGameInstance = null;
  let doomControllerInstance = null;

  function switchTab(tabName) {
    window.currentAppTab = tabName;
    window.location.hash = tabName;

    // Actualizar botones de navegación
    const navTabs = document.querySelectorAll(".nav-tab");
    navTabs.forEach((tab) => {
      const isTarget = tab.dataset.tab === tabName;
      tab.classList.toggle("active", isTarget);
      tab.setAttribute("aria-selected", isTarget ? "true" : "false");
    });

    const secDashboard = document.getElementById("dashboard");
    const secRewardBanner = document.getElementById("reward-banner");
    const secSnake = document.getElementById("section-snake");
    const secDoom = document.getElementById("section-doom");

    // Ocultar todas las secciones primero
    if (secDashboard) secDashboard.classList.add("hidden");
    if (secRewardBanner) secRewardBanner.classList.add("hidden");
    if (secSnake) secSnake.classList.add("hidden");
    if (secDoom) secDoom.classList.add("hidden");

    if (tabName === "dashboard") {
      if (secDashboard) secDashboard.classList.remove("hidden");
      if (secRewardBanner) secRewardBanner.classList.remove("hidden");
      // Si el juego de serpiente estaba corriendo, pausarlo
      if (snakeGameInstance && snakeGameInstance.isPlaying) {
        snakeGameInstance.pauseToggle();
      }
    } else if (tabName === "snake") {
      if (secSnake) secSnake.classList.remove("hidden");
      if (!snakeGameInstance) {
        snakeGameInstance = new SnakeEngine();
      } else {
        snakeGameInstance.resizeCanvas();
      }
    } else if (tabName === "doom") {
      if (secDoom) secDoom.classList.remove("hidden");
      if (!doomControllerInstance) {
        doomControllerInstance = new DoomController();
      }
      doomControllerInstance.load();
      // Pausar serpiente si estaba corriendo
      if (snakeGameInstance && snakeGameInstance.isPlaying) {
        snakeGameInstance.pauseToggle();
      }
    }
  }

  // Exponer para app.js
  window.switchTab = switchTab;

  function initTabs() {
    const navTabs = document.querySelectorAll(".nav-tab");
    navTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabName = tab.dataset.tab;
        switchTab(tabName);
      });
    });

    // Detectar hash en URL
    const hash = window.location.hash.replace("#", "");
    if (hash === "snake" || hash === "serpiente") {
      switchTab("snake");
    } else if (hash === "doom") {
      switchTab("doom");
    } else {
      switchTab("dashboard");
    }

    window.addEventListener("hashchange", () => {
      const newHash = window.location.hash.replace("#", "");
      if (newHash && newHash !== window.currentAppTab) {
        if (newHash === "serpiente") switchTab("snake");
        else if (newHash === "puntos") switchTab("dashboard");
        else switchTab(newHash);
      }
    });
  }

  // Inicializar al cargar el DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTabs);
  } else {
    initTabs();
  }
})();
