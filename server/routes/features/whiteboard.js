import express from 'express';

const router = express.Router();
// In-memory store for whiteboard drawings/elements
const whiteboards = {};

router.get('/:roomCode', (req, res) => {
  const elements = whiteboards[req.params.roomCode] || [];
  res.json(elements);
});

router.post('/:roomCode', (req, res) => {
  const { elements } = req.body;
  whiteboards[req.params.roomCode] = elements || [];
  res.json({ success: true });
});

export default router;
