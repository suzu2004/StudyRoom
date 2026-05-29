import express from 'express';

const router = express.Router();
// In-memory store for room timers (Pomodoro mode)
const roomTimers = {};

router.get('/:roomCode', (req, res) => {
  const timer = roomTimers[req.params.roomCode] || { mode: 'pomodoro', status: 'stopped', timeRemaining: 25 * 60 };
  res.json(timer);
});

router.post('/:roomCode', (req, res) => {
  const { mode, status, timeRemaining } = req.body;
  roomTimers[req.params.roomCode] = {
    mode: mode || 'pomodoro',
    status: status || 'stopped',
    timeRemaining: timeRemaining || 0,
    updatedAt: Date.now()
  };
  res.json({ success: true, timer: roomTimers[req.params.roomCode] });
});

export default router;
