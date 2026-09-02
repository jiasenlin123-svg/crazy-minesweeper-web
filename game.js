(() => {
  'use strict';

  const CONFIG = window.CRAZY_MINESWEEPER_CONFIG;
  const $ = (id) => document.getElementById(id);
  const els = {
    board: $('board'), boardWrap: $('boardWrap'), mineCount: $('mineCount'), timer: $('timer'), combo: $('combo'),
    crazyValue: $('crazyValue'), crazyFill: $('crazyFill'), crazyStage: $('crazyStage'), crazyHint: $('crazyHint'),
    modeTitle: $('modeTitle'), boardMeta: $('boardMeta'), radarModeBadge: $('radarModeBadge'),
    calmBtn: $('calmBtn'), radarBtn: $('radarBtn'), calmCount: $('calmCount'), radarCount: $('radarCount'),
    shieldCount: $('shieldCount'), inventoryTotal: $('inventoryTotal'),
    statusBadge: $('statusBadge'), statusIcon: $('statusIcon'), statusTitle: $('statusTitle'), statusText: $('statusText'),
    eventCount: $('eventCount'), eventLog: $('eventLog'), toast: $('toast'),
    soundBtn: $('soundBtn'), restartBtn: $('restartBtn'), resultRestartBtn: $('resultRestartBtn'),
    resultOverlay: $('resultOverlay'), resultIcon: $('resultIcon'), resultTitle: $('resultTitle'), resultLead: $('resultLead'),
    resultTime: $('resultTime'), resultCompletion: $('resultCompletion'), resultCrazy: $('resultCrazy'),
    resultCombo: $('resultCombo'), resultEvents: $('resultEvents'),
    eventOverlay: $('eventOverlay'), overlayIcon: $('overlayIcon'), overlayTitle: $('overlayTitle'),
    overlayText: $('overlayText'), overlayCountdown: $('overlayCountdown')
  };

  let toastTimer = null;
  let audioContext = null;
  let state;

  const EVENT_META = {
    mineShift: { icon: '💣', title: '地雷暴动', text: '深层未知区域的地雷即将迁移。' },
    ghost: { icon: '👻', title: '数字干扰', text: '部分已揭开数字将暂时失去显示。' },
    overload: { icon: '⚡', title: '雷区过载', text: '一块 3×3 区域即将被暂时锁定。' }
  };

  function newState(modeKey) {
    const mode = CONFIG.modes[modeKey];
    return {
      sessionId: Date.now() + Math.random(),
      modeKey,
      mode,
      board: makeEmptyBoard(mode.rows, mode.cols),
      minesPlaced: false,
      gameStatus: 'playing',
      elapsed: 0,
      timerId: null,
      crazy: 0,
      highestCrazy: 0,
      combo: 0,
      maxCombo: 0,
      claimedComboRewards: new Set(),
      inventory: { ...mode.startItems },
      radarMode: false,
      radarCells: new Set(),
      ghostedCells: new Set(),
      lockedCells: new Set(),
      eventBusy: false,
      lastEvent: null,
      eventHistory: [],
      eventCount: 0,
      soundOn: true,
      effectTimers: []
    };
  }

  function makeEmptyBoard(rows, cols) {
    return Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({ r, c, mine: false, revealed: false, flagged: false, adjacent: 0, hit: false }))
    );
  }

  function init(modeKey = state?.modeKey || 'normal') {
    if (state) {
      clearInterval(state.timerId);
      state.effectTimers.forEach(clearTimeout);
    }
    clearTimeout(toastTimer);
    state = newState(modeKey);
    els.eventOverlay.classList.add('hidden');
    els.resultOverlay.classList.add('hidden');
    document.body.dataset.crazyStage = 'stable';
    setStatus('🎯', `${state.mode.icon} ${state.mode.label}模式准备就绪`, '点开第一格，雷区才会生成。', '进行中');
    renderAll();
  }

  function key(r, c) { return `${r}:${c}`; }
  function inBounds(r, c) { return r >= 0 && c >= 0 && r < state.mode.rows && c < state.mode.cols; }
  function neighbors(r, c) {
    const list = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc)) list.push(state.board[nr][nc]);
      }
    }
    return list;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function placeMines(firstR, firstC) {
    const candidates = [];
    for (const row of state.board) {
      for (const cell of row) {
        const protectedByFirstClick = Math.abs(cell.r - firstR) <= 1 && Math.abs(cell.c - firstC) <= 1;
        if (!protectedByFirstClick) candidates.push(cell);
      }
    }
    shuffle(candidates).slice(0, state.mode.mines).forEach((cell) => { cell.mine = true; });
    recalcNumbers();
    state.minesPlaced = true;
  }

  function recalcNumbers() {
    for (const row of state.board) {
      for (const cell of row) {
        cell.adjacent = cell.mine ? 0 : neighbors(cell.r, cell.c).filter((n) => n.mine).length;
      }
    }
  }

  function startTimer() {
    if (state.timerId) return;
    state.timerId = setInterval(() => {
      if (state.gameStatus !== 'playing') return;
      state.elapsed += 1;
      els.timer.textContent = formatTime(state.elapsed);
    }, 1000);
  }

  function revealAt(r, c) {
    if (state.gameStatus !== 'playing' || state.eventBusy) return;
    const cell = state.board[r][c];
    if (state.lockedCells.has(key(r, c))) return showToast('⚡ 这个区域正在过载，先去别处排雷。');
    if (cell.revealed || cell.flagged) return;

    if (!state.minesPlaced) {
      placeMines(r, c);
      startTimer();
      setStatus('🧠', '雷区已生成', '现在开始真正的推理。疯狂值也会随操作上涨。', '进行中');
    }

    if (cell.mine) {
      state.combo = 0;
      if (state.inventory.shield > 0) {
        state.inventory.shield -= 1;
        cell.revealed = true;
        cell.hit = true;
        adjustCrazy(10);
        setStatus('🛡️', '防爆盾启动！', '这颗雷已经暴露，你活下来了，但疯狂值 +10。', '惊险存活');
        showToast('🛡️ 防爆盾挡住了一次爆炸！');
        beep(180, 0.18);
        renderAll();
        checkWin();
        return;
      }
      cell.revealed = true;
      cell.hit = true;
      finishGame(false);
      return;
    }

    const previousCombo = state.combo;
    const revealedCount = floodReveal(r, c);
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    const crazyGain = 1 + Math.max(0, revealedCount - 1) * 0.25;
    adjustCrazy(crazyGain * state.mode.crazyMultiplier);
    applyComboRewards(previousCombo, state.combo);
    renderAll();
    checkWin();
  }

  function floodReveal(startR, startC) {
    const queue = [[startR, startC]];
    const visited = new Set();
    let count = 0;
    while (queue.length) {
      const [r, c] = queue.shift();
      const k = key(r, c);
      if (visited.has(k)) continue;
      visited.add(k);
      const cell = state.board[r][c];
      if (cell.revealed || cell.flagged || cell.mine) continue;
      cell.revealed = true;
      count += 1;
      if (cell.adjacent === 0) {
        neighbors(r, c).forEach((n) => {
          if (!n.revealed && !n.flagged && !n.mine) queue.push([n.r, n.c]);
        });
      }
    }
    return count;
  }

  function toggleFlag(r, c) {
    if (state.gameStatus !== 'playing' || state.eventBusy) return;
    if (!state.minesPlaced) return showToast('👇 先揭开第一格，再开始插旗。');
    const cell = state.board[r][c];
    if (cell.revealed) return;
    if (state.lockedCells.has(key(r, c))) return showToast('⚡ 过载区域暂时不能操作。');
    cell.flagged = !cell.flagged;
    adjustCrazy(1 * state.mode.crazyMultiplier);
    renderAll();
  }

  function applyComboRewards(previousCombo, combo) {
    Object.entries(CONFIG.comboRewards).forEach(([milestoneText, reward]) => {
      const milestone = Number(milestoneText);
      if (previousCombo < milestone && combo >= milestone && !state.claimedComboRewards.has(milestone)) {
        state.claimedComboRewards.add(milestone);
        if (reward.type === 'crazy') adjustCrazy(reward.value);
        if (reward.type === 'item') awardRandomItem();
        showToast(`🔥 SAFE ×${milestone} · ${reward.label}`);
      }
    });
  }

  function totalInventory() {
    return state.inventory.calm + state.inventory.radar + state.inventory.shield;
  }

  function awardRandomItem() {
    if (totalInventory() >= CONFIG.inventory.totalMax) return showToast('🎒 道具栏已满，补给没有掉下来。');
    const options = ['calm', 'radar', 'shield'].filter((type) => state.inventory[type] < CONFIG.inventory.perItemMax);
    if (!options.length) return;
    const type = options[Math.floor(Math.random() * options.length)];
    state.inventory[type] += 1;
    const names = { calm: '🧯 冷静剂', radar: '🔍 雷达', shield: '🛡️ 防爆盾' };
    showToast(`🎁 获得 ${names[type]} ×1`);
  }

  function useCalm() {
    if (state.gameStatus !== 'playing' || state.eventBusy || state.inventory.calm <= 0) return;
    if (state.crazy <= 10) return showToast('🟢 现在还很冷静，先把冷静剂留着。');
    state.inventory.calm -= 1;
    state.crazy = Math.max(10, state.crazy - 30);
    setStatus('🧯', '疯狂值被压下来了', '冷静剂让雷区暂时稳定，但下一波疯狂还会回来。', '降温成功');
    showToast('🧯 冷静剂生效：疯狂值 -30');
    renderAll();
  }

  function toggleRadarMode() {
    if (state.gameStatus !== 'playing' || state.eventBusy || state.inventory.radar <= 0) return;
    if (!state.minesPlaced) return showToast('👇 先揭开第一格，再使用雷达。');
    state.radarMode = !state.radarMode;
    renderAll();
  }

  function scanRadar(r, c) {
    if (!state.radarMode || state.inventory.radar <= 0) return;
    state.radarMode = false;
    state.inventory.radar -= 1;
    const region = [];
    for (let rr = r - 1; rr <= r + 1; rr++) {
      for (let cc = c - 1; cc <= c + 1; cc++) {
        if (inBounds(rr, cc)) region.push(state.board[rr][cc]);
      }
    }
    const mines = region.filter((cell) => cell.mine).length;
    state.radarCells = new Set(region.map((cell) => key(cell.r, cell.c)));
    adjustCrazy(5 * state.mode.crazyMultiplier);
    setStatus('🔍', '雷达扫描完成', `这个区域一共有 ${mines} 颗雷。具体位置仍要靠你推理。`, '扫描结果');
    showToast(`🔍 扫描完成：这个区域共有 💣 ×${mines}`);
    const session = state.sessionId;
    const timer = setTimeout(() => {
      if (state.sessionId !== session) return;
      state.radarCells.clear();
      renderBoard();
    }, 5000);
    state.effectTimers.push(timer);
    renderAll();
  }

  function adjustCrazy(amount) {
    if (state.gameStatus !== 'playing') return;
    state.crazy = Math.max(0, Math.min(100, state.crazy + amount));
    state.highestCrazy = Math.max(state.highestCrazy, state.crazy);
    if (state.crazy >= 100 && !state.eventBusy) triggerCrazyEvent();
  }

  function crazyStage() {
    return CONFIG.stages.find((stage) => state.crazy >= stage.min && state.crazy <= stage.max) || CONFIG.stages.at(-1);
  }

  function getDeepUnknownCells() {
    const revealed = [];
    for (const row of state.board) for (const cell of row) if (cell.revealed) revealed.push(cell);
    const protectedCell = (cell) => revealed.some((r) => Math.max(Math.abs(r.r - cell.r), Math.abs(r.c - cell.c)) < 2);
    const sources = [], targets = [];
    for (const row of state.board) {
      for (const cell of row) {
        if (cell.revealed || cell.flagged || protectedCell(cell)) continue;
        if (cell.mine) sources.push(cell); else targets.push(cell);
      }
    }
    return { sources, targets };
  }

  function availableEvents() {
    const events = [];
    const deep = getDeepUnknownCells();
    if (deep.sources.length && deep.targets.length) events.push('mineShift');
    const numberCells = state.board.flat().filter((cell) => cell.revealed && !cell.mine && cell.adjacent > 0);
    if (numberCells.length) events.push('ghost');
    if (state.board.flat().some((cell) => !cell.revealed)) events.push('overload');
    return events;
  }

  async function triggerCrazyEvent() {
    if (state.gameStatus !== 'playing' || state.eventBusy) return;
    state.eventBusy = true;
    state.crazy = 100;
    state.highestCrazy = 100;
    renderAll();

    let options = availableEvents().filter((event) => event !== state.lastEvent);
    if (!options.length) options = availableEvents();
    if (!options.length) {
      state.crazy = randomInt(CONFIG.crazyReset.min, CONFIG.crazyReset.max);
      state.eventBusy = false;
      return renderAll();
    }

    const eventKey = options[Math.floor(Math.random() * options.length)];
    const meta = EVENT_META[eventKey];
    const session = state.sessionId;
    setStatus('🚨', `${meta.title}即将发生`, meta.text, '疯狂警报');
    await showCountdown(meta, state.mode.warningSeconds, session);
    if (state.sessionId !== session || state.gameStatus !== 'playing') return;

    let description = '';
    if (eventKey === 'mineShift') description = executeMineShift();
    if (eventKey === 'ghost') description = executeGhost();
    if (eventKey === 'overload') description = executeOverload();

    state.lastEvent = eventKey;
    state.eventCount += 1;
    state.eventHistory.unshift(`${meta.icon} ${meta.title}：${description}`);
    state.eventHistory = state.eventHistory.slice(0, 5);
    state.crazy = randomInt(CONFIG.crazyReset.min, CONFIG.crazyReset.max);
    state.eventBusy = false;
    setStatus(meta.icon, `${meta.title}已发生`, description, '事件结束');
    showToast(`${meta.icon} ${meta.title}：${description}`);
    beep(420, 0.12);
    renderAll();
  }

  async function showCountdown(meta, seconds, session) {
    els.overlayIcon.textContent = meta.icon;
    els.overlayTitle.textContent = meta.title;
    els.overlayText.textContent = meta.text;
    els.eventOverlay.classList.remove('hidden');
    for (let left = seconds; left > 0; left--) {
      if (state.sessionId !== session) return;
      els.overlayCountdown.textContent = left;
      beep(left <= 3 ? 700 : 440, 0.06);
      await delay(1000);
    }
    if (state.sessionId === session) els.eventOverlay.classList.add('hidden');
  }

  function executeMineShift() {
    const { sources, targets } = getDeepUnknownCells();
    const amount = Math.min(randomInt(state.mode.mineShift.min, state.mode.mineShift.max), sources.length, targets.length);
    if (amount <= 0) return '雷区没有足够的安全迁移空间，本次暴动自行平息。';
    shuffle(sources);
    shuffle(targets);
    for (let i = 0; i < amount; i++) {
      sources[i].mine = false;
      targets[i].mine = true;
    }
    recalcNumbers();
    return `${amount} 枚地雷在深层未知区域完成迁移，当前推理边界未被偷改。`;
  }

  function executeGhost() {
    const candidates = shuffle(state.board.flat().filter((cell) => cell.revealed && !cell.mine && cell.adjacent > 0));
    const amount = Math.min(randomInt(state.mode.ghost.min, state.mode.ghost.max), candidates.length);
    const selected = candidates.slice(0, amount);
    selected.forEach((cell) => state.ghostedCells.add(key(cell.r, cell.c)));
    const session = state.sessionId;
    const seconds = Math.round(state.mode.ghost.durationMs / 1000);
    const timer = setTimeout(() => {
      if (state.sessionId !== session) return;
      selected.forEach((cell) => state.ghostedCells.delete(key(cell.r, cell.c)));
      setStatus('👻', '数字恢复', '被干扰的数字已经重新显示。', '恢复正常');
      renderAll();
    }, state.mode.ghost.durationMs);
    state.effectTimers.push(timer);
    return `${amount} 个数字变成“?”，${seconds} 秒后自动恢复；真实数字没有被修改。`;
  }

  function executeOverload() {
    const centers = [];
    for (let r = 1; r < state.mode.rows - 1; r++) {
      for (let c = 1; c < state.mode.cols - 1; c++) {
        let hasUnknown = false;
        for (let rr = r - 1; rr <= r + 1; rr++) for (let cc = c - 1; cc <= c + 1; cc++) if (!state.board[rr][cc].revealed) hasUnknown = true;
        if (hasUnknown) centers.push([r, c]);
      }
    }
    if (!centers.length) return '已经没有适合锁定的 3×3 区域，本次过载没有造成影响。';
    const [r, c] = centers[Math.floor(Math.random() * centers.length)];
    const locked = [];
    for (let rr = r - 1; rr <= r + 1; rr++) {
      for (let cc = c - 1; cc <= c + 1; cc++) {
        const k = key(rr, cc);
        state.lockedCells.add(k);
        locked.push(k);
      }
    }
    const session = state.sessionId;
    const seconds = Math.round(state.mode.overload.durationMs / 1000);
    const timer = setTimeout(() => {
      if (state.sessionId !== session) return;
      locked.forEach((k) => state.lockedCells.delete(k));
      setStatus('⚡', '过载解除', '被锁定的区域重新可以操作。', '恢复正常');
      renderAll();
    }, state.mode.overload.durationMs);
    state.effectTimers.push(timer);
    return `一个 3×3 区域被锁定 ${seconds} 秒，请先换一片区域继续推理。`;
  }

  function checkWin() {
    if (state.gameStatus !== 'playing') return;
    const safeCells = state.board.flat().filter((cell) => !cell.mine);
    if (safeCells.every((cell) => cell.revealed)) finishGame(true);
  }

  function finishGame(won) {
    state.gameStatus = won ? 'won' : 'lost';
    clearInterval(state.timerId);
    state.radarMode = false;
    state.eventBusy = false;
    els.eventOverlay.classList.add('hidden');
    if (!won) {
      state.board.flat().forEach((cell) => { if (cell.mine) cell.revealed = true; });
      setStatus('💥', 'BOOM！', '这次雷区赢了，但结算会告诉你到底差多少。', '挑战失败');
      beep(100, 0.35);
    } else {
      setStatus('🎉', '雷区清理完成！', '你在疯狂事件里把全部安全格清完了。', '挑战成功');
      beep(760, 0.18);
    }
    renderAll();
    showResult(won);
  }

  function completionStats() {
    const safe = state.board.flat().filter((cell) => !cell.mine);
    const revealed = safe.filter((cell) => cell.revealed).length;
    return { revealed, total: safe.length, remaining: safe.length - revealed, percent: Math.round((revealed / safe.length) * 100) };
  }

  function showResult(won) {
    const stats = completionStats();
    els.resultIcon.textContent = won ? '🎉' : '💥';
    els.resultTitle.textContent = won ? '雷区清理完成！' : 'BOOM！你踩雷了';
    if (won) els.resultLead.textContent = '这次你压住了疯狂。';
    else if (stats.remaining === 1) els.resultLead.textContent = '只差最后 1 格！这局真的就差一点。';
    else if (stats.percent >= 80) els.resultLead.textContent = `只差 ${stats.remaining} 格！再来一局很有机会。`;
    else els.resultLead.textContent = '这次雷区赢了。看看下一局能走多远。';
    els.resultTime.textContent = formatTime(state.elapsed);
    els.resultCompletion.textContent = `${stats.percent}%`;
    els.resultCrazy.textContent = `${Math.round(state.highestCrazy)}%`;
    els.resultCombo.textContent = `×${state.maxCombo}`;
    els.resultEvents.textContent = state.eventCount;
    els.resultOverlay.classList.remove('hidden');
  }

  function renderAll() {
    renderBoard();
    renderHud();
    renderInventory();
    renderEvents();
    document.querySelectorAll('.mode-btn').forEach((button) => button.classList.toggle('active', button.dataset.mode === state.modeKey));
    els.modeTitle.textContent = `${state.mode.icon} ${state.mode.label}模式`;
    els.boardMeta.textContent = `${state.mode.rows}×${state.mode.cols} · ${state.mode.mines} 雷`;
    els.radarModeBadge.classList.toggle('hidden', !state.radarMode);
    els.radarBtn.classList.toggle('active', state.radarMode);
  }

  function renderBoard() {
    els.board.style.setProperty('--cols', state.mode.cols);
    const showAllMines = state.gameStatus === 'lost';
    els.board.innerHTML = state.board.flat().map((cell) => {
      const k = key(cell.r, cell.c);
      const classes = ['cell'];
      if (cell.revealed) classes.push('revealed');
      if (cell.flagged && !cell.revealed) classes.push('flagged');
      if (cell.hit) classes.push('mine-hit');
      if (state.ghostedCells.has(k)) classes.push('ghosted');
      if (state.lockedCells.has(k)) classes.push('locked');
      if (state.radarCells.has(k)) classes.push('radar');
      let content = '';
      if (cell.flagged && !cell.revealed) content = '🚩';
      else if ((cell.revealed || showAllMines) && cell.mine) content = cell.hit ? '💥' : '💣';
      else if (cell.revealed && cell.adjacent > 0) content = `<span class="number">${cell.adjacent}</span>`;
      const numberAttr = cell.revealed && !cell.mine ? ` data-number="${cell.adjacent}"` : '';
      return `<button class="${classes.join(' ')}" data-r="${cell.r}" data-c="${cell.c}"${numberAttr} type="button" aria-label="第${cell.r + 1}行第${cell.c + 1}列">${content}</button>`;
    }).join('');
  }

  function renderHud() {
    const flags = state.board.flat().filter((cell) => cell.flagged && !cell.revealed).length;
    const revealedMines = state.board.flat().filter((cell) => cell.mine && cell.revealed).length;
    els.mineCount.textContent = Math.max(0, state.mode.mines - flags - revealedMines);
    els.timer.textContent = formatTime(state.elapsed);
    els.combo.textContent = `×${state.combo}`;
    els.crazyValue.textContent = `${Math.round(state.crazy)}%`;
    els.crazyFill.style.width = `${state.crazy}%`;
    const stage = crazyStage();
    document.body.dataset.crazyStage = stage.key;
    els.crazyStage.textContent = `${stage.icon} ${stage.label}`;
    const hints = {
      stable: '雷区暂时正常', strange: '雷区开始躁动', warning: '注意异常变化', danger: '疯狂事件正在逼近', critical: '下一次操作可能触发警报'
    };
    els.crazyHint.textContent = hints[stage.key];
  }

  function renderInventory() {
    els.calmCount.textContent = `×${state.inventory.calm}`;
    els.radarCount.textContent = `×${state.inventory.radar}`;
    els.shieldCount.textContent = `×${state.inventory.shield}`;
    els.inventoryTotal.textContent = `${totalInventory()} / ${CONFIG.inventory.totalMax}`;
    els.calmBtn.disabled = state.inventory.calm <= 0 || state.gameStatus !== 'playing' || state.eventBusy;
    els.radarBtn.disabled = state.inventory.radar <= 0 || state.gameStatus !== 'playing' || state.eventBusy;
  }

  function renderEvents() {
    els.eventCount.textContent = `${state.eventCount} 次`;
    if (!state.eventHistory.length) {
      els.eventLog.innerHTML = '<li class="muted">暂时安全……</li>';
      return;
    }
    els.eventLog.innerHTML = state.eventHistory.map((text) => `<li>${text}</li>`).join('');
  }

  function setStatus(icon, title, text, badge) {
    els.statusIcon.textContent = icon;
    els.statusTitle.textContent = title;
    els.statusText.textContent = text;
    els.statusBadge.textContent = badge;
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.remove('hidden');
    toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 2600);
  }

  function formatTime(seconds) {
    const min = Math.floor(seconds / 60).toString().padStart(2, '0');
    const sec = (seconds % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  }

  function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  function beep(frequency = 440, duration = 0.08) {
    if (!state?.soundOn) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.045, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (_) {}
  }

  els.board.addEventListener('click', (event) => {
    const cellButton = event.target.closest('.cell');
    if (!cellButton) return;
    const r = Number(cellButton.dataset.r), c = Number(cellButton.dataset.c);
    if (state.radarMode) return scanRadar(r, c);
    revealAt(r, c);
  });

  els.board.addEventListener('contextmenu', (event) => {
    const cellButton = event.target.closest('.cell');
    if (!cellButton) return;
    event.preventDefault();
    toggleFlag(Number(cellButton.dataset.r), Number(cellButton.dataset.c));
  });

  document.querySelectorAll('.mode-btn').forEach((button) => button.addEventListener('click', () => init(button.dataset.mode)));
  els.restartBtn.addEventListener('click', () => init(state.modeKey));
  els.resultRestartBtn.addEventListener('click', () => init(state.modeKey));
  els.calmBtn.addEventListener('click', useCalm);
  els.radarBtn.addEventListener('click', toggleRadarMode);
  els.soundBtn.addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    els.soundBtn.textContent = state.soundOn ? '📢 音效 ON' : '🔇 音效 OFF';
  });

  init('normal');
})();
