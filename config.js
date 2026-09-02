window.CRAZY_MINESWEEPER_CONFIG = {
  crazyReset: { min: 45, max: 60 },
  inventory: { perItemMax: 2, totalMax: 4 },
  comboRewards: {
    5: { type: 'crazy', value: -2, label: '冷静一下：疯狂值 -2' },
    10: { type: 'item', label: '连击补给：随机道具 +1' },
    20: { type: 'crazy', value: -10, label: '稳定发挥：疯狂值 -10' },
    30: { type: 'item', label: '高手补给：随机道具 +1' }
  },
  stages: [
    { min: 0, max: 29, key: 'stable', label: '稳定', icon: '🟢' },
    { min: 30, max: 49, key: 'strange', label: '异常', icon: '🟡' },
    { min: 50, max: 69, key: 'warning', label: '警戒', icon: '🟠' },
    { min: 70, max: 89, key: 'danger', label: '危险', icon: '🔴' },
    { min: 90, max: 99, key: 'critical', label: '极危', icon: '🚨' }
  ],
  modes: {
    easy: {
      label: '轻松', icon: '🌱', rows: 9, cols: 9, mines: 10,
      crazyMultiplier: 0.7, warningSeconds: 8,
      startItems: { calm: 1, radar: 1, shield: 1 },
      mineShift: { min: 1, max: 1 },
      ghost: { min: 2, max: 3, durationMs: 5000 },
      overload: { durationMs: 5000 }
    },
    normal: {
      label: '正常', icon: '🎯', rows: 12, cols: 12, mines: 22,
      crazyMultiplier: 1, warningSeconds: 5,
      startItems: { calm: 1, radar: 0, shield: 1 },
      mineShift: { min: 1, max: 2 },
      ghost: { min: 3, max: 5, durationMs: 8000 },
      overload: { durationMs: 8000 }
    },
    crazy: {
      label: '疯狂', icon: '☠️', rows: 16, cols: 16, mines: 40,
      crazyMultiplier: 1.35, warningSeconds: 3,
      startItems: { calm: 0, radar: 0, shield: 0 },
      mineShift: { min: 2, max: 4 },
      ghost: { min: 5, max: 8, durationMs: 10000 },
      overload: { durationMs: 12000 }
    }
  }
};
