// ==============================================================================
// TIMEMASTER PRO APPLICATION SCRIPT (APP.JS)
// ==============================================================================

// --- Audio & Ambient Sound Synthesizer via Web Audio API ---
class AudioEngine {
  constructor() {
    this.audioCtx = null;
    this.isMuted = localStorage.getItem('timemaster_sound_muted') === 'true';
    this.ambientNodes = null;
    this.currentAmbient = null;
  }

  init() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
  }

  ensureContext() {
    this.init();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playTone(freq = 440, type = 'sine', duration = 0.2, gainVal = 0.15) {
    if (this.isMuted) return;
    try {
      this.ensureContext();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gainNode = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

      gainNode.gain.setValueAtTime(gainVal, this.audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + duration);

      osc.connect(gainNode);
      gainNode.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      console.warn("Tone error:", e);
    }
  }

  playClick() {
    this.playTone(680, 'sine', 0.06, 0.08);
  }

  playComplete() {
    this.playTone(523.25, 'triangle', 0.18, 0.2); // C5
    setTimeout(() => this.playTone(659.25, 'triangle', 0.2, 0.22), 140); // E5
    setTimeout(() => this.playTone(783.99, 'triangle', 0.28, 0.25), 280); // G5
    setTimeout(() => this.playTone(1046.50, 'triangle', 0.45, 0.28), 440); // C6
  }

  playAlarm() {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this.playTone(880, 'sine', 0.2, 0.25);
        setTimeout(() => this.playTone(1174.66, 'sine', 0.35, 0.3), 150);
      }, i * 550);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem('timemaster_sound_muted', this.isMuted);
    if (this.isMuted && this.ambientNodes) {
      this.stopAmbient();
    }
    return this.isMuted;
  }

  // Pure Web Audio procedural Ambient Sound generator (Rain / Waves / Brown Noise)
  startAmbient(type) {
    this.ensureContext();
    if (this.isMuted || !this.audioCtx) return;
    this.stopAmbient();

    const bufferSize = this.audioCtx.sampleRate * 2;
    const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    // Generate Brown/Pink Noise curve
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5;
    }

    const whiteNoise = this.audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = this.audioCtx.createBiquadFilter();
    const gainNode = this.audioCtx.createGain();

    if (type === 'rain') {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, this.audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.18, this.audioCtx.currentTime);
    } else if (type === 'waves') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(450, this.audioCtx.currentTime);
      filter.Q.setValueAtTime(1.5, this.audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.25, this.audioCtx.currentTime);

      // LFO for wave modulation
      const lfo = this.audioCtx.createOscillator();
      const lfoGain = this.audioCtx.createGain();
      lfo.frequency.setValueAtTime(0.15, this.audioCtx.currentTime); // Wave period
      lfoGain.gain.setValueAtTime(0.18, this.audioCtx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(gainNode.gain);
      lfo.start();
      this.ambientLfo = lfo;
    } else { // Brown noise
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, this.audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.22, this.audioCtx.currentTime);
    }

    whiteNoise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);
    whiteNoise.start();

    this.ambientNodes = { source: whiteNoise, filter, gain: gainNode };
    this.currentAmbient = type;
  }

  stopAmbient() {
    if (this.ambientNodes) {
      try {
        this.ambientNodes.source.stop();
        this.ambientNodes.source.disconnect();
      } catch (e) {}
      this.ambientNodes = null;
    }
    if (this.ambientLfo) {
      try {
        this.ambientLfo.stop();
        this.ambientLfo.disconnect();
      } catch (e) {}
      this.ambientLfo = null;
    }
    this.currentAmbient = null;
  }
}

// --- Data Store & Persistence Manager ---
class TaskStore {
  constructor() {
    this.STORAGE_KEY = 'timemaster_pro_tasks';
    this.STATS_KEY = 'timemaster_pro_stats';
    this.TIMEBLOCK_KEY = 'timemaster_pro_timeblocks';
    this.QURAN_KEY = 'timemaster_pro_quran';
    this.tasks = this.loadTasks();
    this.stats = this.loadStats();
    this.timeBlocks = this.loadTimeBlocks();
    this.quran = this.loadQuranData();
    this.activeTaskId = null;
  }

  loadQuranData() {
    try {
      const data = localStorage.getItem(this.QURAN_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {}
    return {
      currentPages: 0,
      totalPages: 604,
      surahNote: ''
    };
  }

  saveQuranData() {
    localStorage.setItem(this.QURAN_KEY, JSON.stringify(this.quran));
  }

  updateQuranPages(change) {
    this.quran.currentPages = Math.max(0, Math.min(this.quran.totalPages, this.quran.currentPages + change));
    this.saveQuranData();
    return this.quran;
  }

  setQuranSurah(note) {
    this.quran.surahNote = note.trim();
    this.saveQuranData();
  }

  loadTasks() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error("Load tasks error:", e);
    }
    return [
      {
        id: 't-1',
        title: '🎯 تحديد أهم 3 أولويات لإنجازها اليوم بدون أي تشتت',
        quadrant: 'q1',
        completed: false,
        timeSpentSeconds: 0,
        createdAt: new Date().toISOString()
      },
      {
        id: 't-2',
        title: '📈 وضع الخطة الإستراتيجية للأسبوع والتعلم العميق',
        quadrant: 'q2',
        completed: false,
        timeSpentSeconds: 0,
        createdAt: new Date().toISOString()
      },
      {
        id: 't-3',
        title: '✉️ الرد على الرسائل والاتصالات المتراكمة دفعة واحدة',
        quadrant: 'q3',
        completed: false,
        timeSpentSeconds: 0,
        createdAt: new Date().toISOString()
      }
    ];
  }

  saveTasks() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.tasks));
  }

  loadStats() {
    try {
      const data = localStorage.getItem(this.STATS_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {}
    return {
      pomodoroSessionsCount: 0,
      totalFocusSeconds: 0
    };
  }

  saveStats() {
    localStorage.setItem(this.STATS_KEY, JSON.stringify(this.stats));
  }

  loadTimeBlocks() {
    try {
      const data = localStorage.getItem(this.TIMEBLOCK_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {}
    return {}; // e.g. { "09:00": "تحديد أهم 3 أولويات..." }
  }

  saveTimeBlocks() {
    localStorage.setItem(this.TIMEBLOCK_KEY, JSON.stringify(this.timeBlocks));
  }

  addTask(title, quadrant) {
    const newTask = {
      id: 'task-' + Date.now(),
      title: title.trim(),
      quadrant: quadrant,
      completed: false,
      timeSpentSeconds: 0,
      createdAt: new Date().toISOString()
    };
    this.tasks.unshift(newTask);
    this.saveTasks();
    return newTask;
  }

  toggleTaskComplete(id) {
    const task = this.tasks.find(t => t.id === id);
    if (task) {
      task.completed = !task.completed;
      this.saveTasks();
      return task;
    }
    return null;
  }

  deleteTask(id) {
    this.tasks = this.tasks.filter(t => t.id !== id);
    if (this.activeTaskId === id) {
      this.activeTaskId = null;
    }
    // Also remove from time-blocks if present
    Object.keys(this.timeBlocks).forEach(hour => {
      if (this.timeBlocks[hour] && this.timeBlocks[hour].taskId === id) {
        delete this.timeBlocks[hour];
      }
    });
    this.saveTimeBlocks();
    this.saveTasks();
  }

  setActiveTask(id) {
    this.activeTaskId = id;
  }

  getActiveTask() {
    return this.tasks.find(t => t.id === this.activeTaskId) || null;
  }

  addTimeSpent(id, seconds) {
    const task = this.tasks.find(t => t.id === id);
    if (task) {
      task.timeSpentSeconds = (task.timeSpentSeconds || 0) + seconds;
      this.saveTasks();
    }
  }

  assignToTimeSlot(hour, taskId, taskTitle) {
    this.timeBlocks[hour] = { taskId, taskTitle };
    this.saveTimeBlocks();
  }

  removeFromTimeSlot(hour) {
    delete this.timeBlocks[hour];
    this.saveTimeBlocks();
  }

  recordPomodoroSession(durationSeconds) {
    this.stats.pomodoroSessionsCount += 1;
    this.stats.totalFocusSeconds += durationSeconds;
    this.saveStats();
  }

  exportAllData() {
    return JSON.stringify({
      version: '2.0',
      exportedAt: new Date().toISOString(),
      tasks: this.tasks,
      stats: this.stats,
      timeBlocks: this.timeBlocks
    }, null, 2);
  }

  importData(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (Array.isArray(parsed.tasks)) {
        this.tasks = parsed.tasks;
        this.saveTasks();
      }
      if (parsed.stats) {
        this.stats = parsed.stats;
        this.saveStats();
      }
      if (parsed.timeBlocks) {
        this.timeBlocks = parsed.timeBlocks;
        this.saveTimeBlocks();
      }
      return true;
    } catch (e) {
      console.error("Import error:", e);
      return false;
    }
  }
}

// --- Pomodoro Timer Controller ---
class PomodoroTimer {
  constructor(sound, onTick, onComplete) {
    this.sound = sound;
    this.onTick = onTick;
    this.onComplete = onComplete;

    this.modes = {
      work: 25 * 60,
      shortBreak: 5 * 60,
      longBreak: 15 * 60
    };

    this.currentMode = 'work';
    this.totalSeconds = this.modes.work;
    this.remainingSeconds = this.modes.work;
    this.isRunning = false;
    this.timerId = null;
  }

  setMode(mode) {
    if (!this.modes[mode]) return;
    this.pause();
    this.currentMode = mode;
    this.totalSeconds = this.modes[mode];
    this.remainingSeconds = this.modes[mode];
    this.onTick(this.remainingSeconds, this.totalSeconds, this.currentMode);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.sound.playClick();

    this.timerId = setInterval(() => {
      if (this.remainingSeconds > 0) {
        this.remainingSeconds--;
        this.onTick(this.remainingSeconds, this.totalSeconds, this.currentMode);
      } else {
        this.finish();
      }
    }, 1000);
  }

  pause() {
    if (!this.isRunning) return;
    this.isRunning = false;
    clearInterval(this.timerId);
    this.timerId = null;
  }

  reset() {
    this.pause();
    this.remainingSeconds = this.totalSeconds;
    this.onTick(this.remainingSeconds, this.totalSeconds, this.currentMode);
  }

  finish() {
    this.pause();
    this.sound.playAlarm();
    this.onComplete(this.currentMode, this.totalSeconds);
    this.remainingSeconds = this.totalSeconds;
    this.onTick(this.remainingSeconds, this.totalSeconds, this.currentMode);
  }
}

// --- Main UI & Interaction Controller ---
class AppUI {
  constructor() {
    this.sound = new AudioEngine();
    this.store = new TaskStore();
    this.activeFilter = 'all';

    this.quotes = [
      "الوقت هو العملة الوحيدة التي لا يمكن استردادها.. استثمرها في المربع الأكثر تأثيراً.",
      "مبدأ 80/20: 20% من مهامك ستحقق 80% من نتائجك.. ركز على الأولويات الاستراتيجية.",
      "جلسة تركيز واحدة بدون مشتتات تصنع فارقاً حقيقياً في إنجاز يومك.",
      "الإنتاجية ليست كثرة الانشغال، بل دقة الإنجاز فيما يهم حقاً."
    ];

    this.timer = new PomodoroTimer(
      this.sound,
      (rem, tot, mode) => this.updateTimerDisplay(rem, tot, mode),
      (mode, dur) => this.handleTimerComplete(mode, dur)
    );

    this.initElements();
    this.bindEvents();
    this.applyTheme(localStorage.getItem('timemaster_theme') || 'dark');
    this.renderTimeSlots();
    this.renderAll();
    this.updateSoundIcon();
  }

  initElements() {
    // Header & Controls
    this.themeToggleBtn = document.getElementById('themeToggleBtn');
    this.themeIcon = document.getElementById('themeIcon');
    this.soundToggleBtn = document.getElementById('soundToggleBtn');
    this.soundIcon = document.getElementById('soundIcon');
    this.backupBtn = document.getElementById('backupBtn');

    // Timer
    this.timerDisplay = document.getElementById('timerDisplay');
    this.timerStatusLabel = document.getElementById('timerStatusLabel');
    this.timerProgressCircle = document.getElementById('timerProgressCircle');
    this.startTimerBtn = document.getElementById('startTimerBtn');
    this.startBtnText = document.getElementById('startBtnText');
    this.playPauseIcon = document.getElementById('playPauseIcon');
    this.resetTimerBtn = document.getElementById('resetTimerBtn');
    this.modeButtons = document.querySelectorAll('.mode-btn');
    this.activeTaskTitle = document.getElementById('activeTaskTitle');

    // Ambient buttons
    this.ambientButtons = document.querySelectorAll('.ambient-btn');
    this.ambientStatusText = document.getElementById('ambientStatusText');

    // Quran Elements
    this.quranProgressStat = document.getElementById('quranProgressStat');
    this.quranHeaderPill = document.getElementById('quranHeaderPill');
    this.quranCurrentVal = document.getElementById('quranCurrentVal');
    this.quranTargetVal = document.getElementById('quranTargetVal');
    this.quranPctBadge = document.getElementById('quranPctBadge');
    this.quranProgressFill = document.getElementById('quranProgressFill');
    this.quranMinusBtn = document.getElementById('quranMinusBtn');
    this.quranPlusBtn = document.getElementById('quranPlusBtn');
    this.quranPlusFiveBtn = document.getElementById('quranPlusFiveBtn');
    this.quranSurahInput = document.getElementById('quranSurahInput');

    // Task Creation & Filter
    this.taskForm = document.getElementById('taskForm');
    this.taskTitleInput = document.getElementById('taskTitleInput');
    this.taskQuadrantSelect = document.getElementById('taskQuadrantSelect');
    this.tabButtons = document.querySelectorAll('.tab-btn');

    // Quadrant containers
    this.lists = {
      q1: document.getElementById('list-q1'),
      q2: document.getElementById('list-q2'),
      q3: document.getElementById('list-q3'),
      q4: document.getElementById('list-q4')
    };

    this.counts = {
      q1: document.getElementById('count-q1'),
      q2: document.getElementById('count-q2'),
      q3: document.getElementById('count-q3'),
      q4: document.getElementById('count-q4')
    };

    // Stats
    this.completedTasksStat = document.getElementById('completedTasksStat');
    this.pomodoroCountStat = document.getElementById('pomodoroCountStat');
    this.totalFocusTimeStat = document.getElementById('totalFocusTimeStat');
    this.pendingTasksStat = document.getElementById('pendingTasksStat');
    this.toastContainer = document.getElementById('toastContainer');
    this.productivityQuote = document.getElementById('productivityQuote');

    // Time-blocking container
    this.timeSlotsContainer = document.getElementById('timeSlotsContainer');

    // Modal
    this.backupModal = document.getElementById('backupModal');
    this.closeModalBtn = document.getElementById('closeModalBtn');
    this.exportDataBtn = document.getElementById('exportDataBtn');
    this.importFileInput = document.getElementById('importFileInput');
  }

  bindEvents() {
    // Theme Toggle
    this.themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      this.applyTheme(next);
      this.sound.playClick();
    });

    // Sound Toggle
    this.soundToggleBtn.addEventListener('click', () => {
      const isMuted = this.sound.toggleMute();
      this.updateSoundIcon();
      this.showToast(isMuted ? 'تم كتم الأصوات' : 'تم تفعيل الأصوات');
    });

    // Ambient Buttons
    this.ambientButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.ambient;
        if (this.sound.currentAmbient === type) {
          this.sound.stopAmbient();
          btn.classList.remove('active');
          this.ambientStatusText.textContent = 'متوقف';
          this.showToast('تم إيقاف صوت الخلفية');
        } else {
          this.ambientButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.sound.startAmbient(type);
          this.ambientStatusText.textContent = `يعمل الآن: ${btn.textContent.trim()}`;
          this.showToast(`بدء صوت: ${btn.textContent.trim()} 🎧`);
        }
      });
    });

    // Timer Mode Switch
    this.modeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.timer.setMode(btn.dataset.mode);
        this.updatePlayBtnState(false);
      });
    });

    // Timer Start / Pause
    this.startTimerBtn.addEventListener('click', () => {
      if (this.timer.isRunning) {
        this.timer.pause();
        this.updatePlayBtnState(false);
        this.showToast('تم إيقاف المؤقت مؤقتاً');
      } else {
        this.timer.start();
        this.updatePlayBtnState(true);
      }
    });

    // Timer Reset
    this.resetTimerBtn.addEventListener('click', () => {
      this.timer.reset();
      this.updatePlayBtnState(false);
      this.sound.playClick();
      this.showToast('تمت إعادة ضبط المؤقت');
    });

    // Task Form Submit
    this.taskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = this.taskTitleInput.value;
      const quadrant = this.taskQuadrantSelect.value;
      if (!title.trim()) return;

      const task = this.store.addTask(title, quadrant);
      this.taskTitleInput.value = '';
      this.sound.playClick();
      this.renderTasks();
      this.renderStats();
      this.showToast(`تمت إضافة: "${task.title}"`);
    });

    // Filter Tabs
    this.tabButtons.forEach(tab => {
      tab.addEventListener('click', () => {
        this.tabButtons.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeFilter = tab.dataset.filter;
        this.renderTasks();
      });
    });

    // Backup & Restore Modal Events
    this.backupBtn.addEventListener('click', () => {
      this.backupModal.classList.add('open');
      this.sound.playClick();
    });

    this.closeModalBtn.addEventListener('click', () => {
      this.backupModal.classList.remove('open');
    });

    // Quran Tracker Event Listeners
    if (this.quranPlusBtn) {
      this.quranPlusBtn.addEventListener('click', () => {
        this.store.updateQuranPages(1);
        this.sound.playClick();
        this.renderQuranUI();
        this.showToast('بارك الله فيك! تم إنجاز صفحة من القرآن 📖');
      });
    }

    if (this.quranPlusFiveBtn) {
      this.quranPlusFiveBtn.addEventListener('click', () => {
        this.store.updateQuranPages(5);
        this.sound.playComplete();
        this.launchCelebration();
        this.renderQuranUI();
        this.showToast('ما شاء الله! تم إنجاز 5 صفحات من القرآن 🌟');
      });
    }

    if (this.quranMinusBtn) {
      this.quranMinusBtn.addEventListener('click', () => {
        this.store.updateQuranPages(-1);
        this.sound.playClick();
        this.renderQuranUI();
      });
    }

    if (this.quranSurahInput) {
      this.quranSurahInput.addEventListener('change', (e) => {
        this.store.setQuranSurah(e.target.value);
        this.showToast('تم حفظ تقدم السورة / الجزء');
      });
    }

    if (this.quranHeaderPill) {
      this.quranHeaderPill.addEventListener('click', () => {
        const input = prompt('أدخل عدد الصفحات المنجزة حالياً من أصل 604:', this.store.quran.currentPages);
        if (input !== null && !isNaN(parseInt(input))) {
          const val = parseInt(input);
          this.store.quran.currentPages = Math.max(0, Math.min(604, val));
          this.store.saveQuranData();
          this.renderQuranUI();
          this.sound.playComplete();
          this.showToast(`تم تعديل تقدمك إلى ${this.store.quran.currentPages} صفحة`);
        }
      });
    }

    this.backupModal.addEventListener('click', (e) => {
      if (e.target === this.backupModal) {
        this.backupModal.classList.remove('open');
      }
    });

    // Export Data
    this.exportDataBtn.addEventListener('click', () => {
      const json = this.store.exportAllData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timemaster-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.sound.playClick();
      this.showToast('تم تصدير ملف النسخة الاحتياطية بنجاح 💾');
    });

    // Import Data
    this.importFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const success = this.store.importData(event.target.result);
        if (success) {
          this.renderAll();
          this.renderTimeSlots();
          this.backupModal.classList.remove('open');
          this.sound.playComplete();
          this.showToast('تم استيراد كافة البيانات بنجاح! 🚀');
        } else {
          this.showToast('خطأ: الملف غير متوافق!');
        }
      };
      reader.readAsText(file);
    });
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('timemaster_theme', theme);
    if (theme === 'dark') {
      this.themeIcon.setAttribute('data-lucide', 'sun');
    } else {
      this.themeIcon.setAttribute('data-lucide', 'moon');
    }
    if (window.lucide) window.lucide.createIcons();
  }

  updateSoundIcon() {
    if (this.sound.isMuted) {
      this.soundIcon.setAttribute('data-lucide', 'volume-x');
    } else {
      this.soundIcon.setAttribute('data-lucide', 'volume-2');
    }
    if (window.lucide) window.lucide.createIcons();
  }

  updatePlayBtnState(running) {
    if (running) {
      this.startBtnText.textContent = 'إيقاف مؤقت';
      this.playPauseIcon.setAttribute('data-lucide', 'pause');
      this.timerStatusLabel.textContent = this.timer.currentMode === 'work' ? 'جاري التركيز العميق 🎯' : 'فترة استراحة ☕';
    } else {
      this.startBtnText.textContent = 'ابدأ التركيز';
      this.playPauseIcon.setAttribute('data-lucide', 'play');
      this.timerStatusLabel.textContent = 'جاهز للانطلاق';
    }
    if (window.lucide) window.lucide.createIcons();
  }

  updateTimerDisplay(remaining, total, mode) {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    this.timerDisplay.textContent = timeFormatted;
    document.title = `${timeFormatted} - TimeMaster Pro`;

    const circumference = 628.318;
    const progress = remaining / total;
    const offset = circumference * (1 - progress);
    this.timerProgressCircle.style.strokeDashoffset = offset;

    // Track focused minutes for active task
    if (this.timer.isRunning && mode === 'work' && this.store.activeTaskId) {
      if (remaining % 60 === 0 && remaining !== total) {
        this.store.addTimeSpent(this.store.activeTaskId, 60);
        this.renderTasks();
      }
    }
  }

  handleTimerComplete(mode, duration) {
    this.updatePlayBtnState(false);
    if (mode === 'work') {
      this.store.recordPomodoroSession(duration);
      if (this.store.activeTaskId) {
        this.store.addTimeSpent(this.store.activeTaskId, duration);
      }
      this.launchCelebration();
      this.showToast('🎉 عمل استثنائي! انتهت جلسة التركيز، استمتع باستراحة مستحقة.');
    } else {
      this.showToast('☕ انتهت فترة الاستراحة! فلنبدأ جولة تركيز جديدة بحماس.');
    }
    this.renderStats();
    this.renderTasks();
  }

  launchCelebration() {
    if (window.confetti) {
      window.confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i data-lucide="check-circle" style="color: var(--accent-primary); width: 20px; height: 20px;"></i> <span>${message}</span>`;
    this.toastContainer.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // Render Time-Blocking hourly slots
  renderTimeSlots() {
    this.timeSlotsContainer.innerHTML = '';
    const currentHour = new Date().getHours();

    for (let h = 8; h <= 21; h++) {
      const hourStr = `${h.toString().padStart(2, '0')}:00`;
      const isCurrent = h === currentHour;
      const slotData = this.store.timeBlocks[hourStr];

      const slot = document.createElement('div');
      slot.className = `time-slot ${isCurrent ? 'current-hour' : ''}`;
      slot.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="time-slot-time">${hourStr}</span>
          ${slotData ? `<button class="task-btn" style="padding: 2px;" data-remove="${hourStr}" title="إلغاء"><i data-lucide="x" style="width: 12px; height: 12px;"></i></button>` : ''}
        </div>
        <div class="time-slot-content">
          ${slotData 
            ? `<span style="color: var(--accent-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${slotData.taskTitle}">${this.escapeHtml(slotData.taskTitle)}</span>` 
            : `<button class="task-btn" style="font-size: 0.75rem; width: 100%; justify-content: flex-start; color: var(--text-muted);" data-schedule="${hourStr}">+ تعيين مهمة</button>`
          }
        </div>
      `;

      // Schedule current active task
      const scheduleBtn = slot.querySelector(`[data-schedule="${hourStr}"]`);
      if (scheduleBtn) {
        scheduleBtn.addEventListener('click', () => {
          const active = this.store.getActiveTask();
          if (active) {
            this.store.assignToTimeSlot(hourStr, active.id, active.title);
            this.sound.playClick();
            this.renderTimeSlots();
            this.showToast(`تمت جدولة "${active.title}" في الساعة ${hourStr}`);
          } else {
            this.showToast('يرجى تحديد المهمة النشطة أولاً عبر رمز الهدف 🎯');
          }
        });
      }

      const removeBtn = slot.querySelector(`[data-remove="${hourStr}"]`);
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          this.store.removeFromTimeSlot(hourStr);
          this.sound.playClick();
          this.renderTimeSlots();
          this.showToast(`تم إخلاء الساعة ${hourStr}`);
        });
      }

      this.timeSlotsContainer.appendChild(slot);
    }
    if (window.lucide) window.lucide.createIcons();
  }

  renderTasks() {
    const counts = { q1: 0, q2: 0, q3: 0, q4: 0 };
    Object.keys(this.lists).forEach(k => {
      this.lists[k].innerHTML = '';
    });

    const filtered = this.store.tasks.filter(task => {
      if (this.activeFilter === 'active') return !task.completed;
      if (this.activeFilter === 'completed') return task.completed;
      return true;
    });

    filtered.forEach(task => {
      counts[task.quadrant] = (counts[task.quadrant] || 0) + 1;
      const targetList = this.lists[task.quadrant];
      if (!targetList) return;

      const item = document.createElement('div');
      item.className = `task-item ${task.completed ? 'completed' : ''} ${this.store.activeTaskId === task.id ? 'active-focus' : ''}`;
      
      const timeMin = Math.round((task.timeSpentSeconds || 0) / 60);

      item.innerHTML = `
        <div class="task-left">
          <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} data-id="${task.id}" title="تحديد كمكتملة">
          <div class="task-details">
            <span class="task-title" title="${task.title}">${this.escapeHtml(task.title)}</span>
            <div class="task-meta">
              ${timeMin > 0 ? `<span class="task-time-spent"><i data-lucide="timer" style="width: 13px; height: 13px;"></i> ${timeMin} دقيقة تركيز</span>` : ''}
              <span>${new Date(task.createdAt).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}</span>
            </div>
          </div>
        </div>
        <div class="task-actions">
          <button class="task-btn ${this.store.activeTaskId === task.id ? 'active' : ''}" data-action="focus" data-id="${task.id}" title="ربط بمؤقت التركيز">
            <i data-lucide="crosshair" style="width: 17px; height: 17px; ${this.store.activeTaskId === task.id ? 'color: var(--accent-primary); stroke-width: 2.8;' : ''}"></i>
          </button>
          <button class="task-btn delete" data-action="delete" data-id="${task.id}" title="حذف المهمة">
            <i data-lucide="trash-2" style="width: 17px; height: 17px;"></i>
          </button>
        </div>
      `;

      // Checkbox event
      const chk = item.querySelector('.task-checkbox');
      chk.addEventListener('change', () => {
        const updated = this.store.toggleTaskComplete(task.id);
        if (updated && updated.completed) {
          this.sound.playComplete();
          this.launchCelebration();
          this.showToast(`إنجاز عظيم! تم إكمال: "${task.title}" 🏆`);
        } else {
          this.sound.playClick();
        }
        this.renderTasks();
        this.renderStats();
      });

      // Actions
      const focusBtn = item.querySelector('[data-action="focus"]');
      focusBtn.addEventListener('click', () => {
        if (this.store.activeTaskId === task.id) {
          this.store.setActiveTask(null);
          this.showToast('تم فك ربط المهمة بالمؤقت');
        } else {
          this.store.setActiveTask(task.id);
          this.sound.playClick();
          this.showToast(`المهمة النشطة للتركيز: "${task.title}" 🎯`);
        }
        this.updateActiveTaskBar();
        this.renderTasks();
      });

      const deleteBtn = item.querySelector('[data-action="delete"]');
      deleteBtn.addEventListener('click', () => {
        this.store.deleteTask(task.id);
        this.sound.playClick();
        this.renderTasks();
        this.renderStats();
        this.renderTimeSlots();
        this.updateActiveTaskBar();
        this.showToast('تم حذف المهمة');
      });

      targetList.appendChild(item);
    });

    // Update Counts & Empty States
    ['q1', 'q2', 'q3', 'q4'].forEach(q => {
      this.counts[q].textContent = counts[q] || 0;
      if (!this.lists[q].hasChildNodes()) {
        this.lists[q].innerHTML = `
          <div class="empty-state">
            <i data-lucide="sparkles" style="width: 28px; height: 28px;"></i>
            <span>لا توجد مهام حالياً في هذا المربع</span>
          </div>
        `;
      }
    });

    this.updateActiveTaskBar();
    if (window.lucide) window.lucide.createIcons();
  }

  updateActiveTaskBar() {
    const active = this.store.getActiveTask();
    if (active) {
      this.activeTaskTitle.textContent = active.title;
      this.activeTaskTitle.style.color = 'var(--accent-primary)';
    } else {
      this.activeTaskTitle.textContent = 'اختر مهمة للتركيز عليها (انقر على رمز 🎯)';
      this.activeTaskTitle.style.color = 'var(--text-muted)';
    }
  }

  renderStats() {
    const totalCompleted = this.store.tasks.filter(t => t.completed).length;
    const totalPending = this.store.tasks.filter(t => !t.completed).length;
    const totalFocusMin = Math.round(this.store.stats.totalFocusSeconds / 60);

    this.completedTasksStat.textContent = totalCompleted;
    this.pendingTasksStat.textContent = totalPending;
    this.pomodoroCountStat.textContent = this.store.stats.pomodoroSessionsCount;
    this.totalFocusTimeStat.textContent = `${totalFocusMin} د`;
  }

  renderQuranUI() {
    if (!this.quranCurrentVal) return;
    const { currentPages, totalPages, surahNote } = this.store.quran;
    const pct = Math.round((currentPages / totalPages) * 100);

    this.quranCurrentVal.textContent = currentPages;
    this.quranTargetVal.textContent = totalPages;
    if (this.quranPctBadge) this.quranPctBadge.textContent = `${pct}%`;
    if (this.quranProgressFill) this.quranProgressFill.style.width = `${pct}%`;
    if (this.quranProgressStat) this.quranProgressStat.textContent = `${currentPages}/${totalPages}`;
    if (this.quranSurahInput && surahNote && document.activeElement !== this.quranSurahInput) {
      this.quranSurahInput.value = surahNote;
    }
  }

  renderAll() {
    this.renderTasks();
    this.renderStats();
    this.renderQuranUI();
    const randomQuote = this.quotes[Math.floor(Math.random() * this.quotes.length)];
    if (this.productivityQuote) {
      this.productivityQuote.textContent = `"${randomQuote}"`;
    }
    if (window.lucide) window.lucide.createIcons();
  }

  escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new AppUI();
});
