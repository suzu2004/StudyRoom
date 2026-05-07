import express from 'express';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const supabase = require('../../supabase.js');

const router = express.Router();

// Get list of shared files in a room
router.get('/:roomCode', async (req, res) => {
  try {
    const { data, error } = await supabase.storage.from('room-files').list(req.params.roomCode);
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate presigned URL for upload
router.post('/:roomCode/presigned', async (req, res) => {
  try {
    const { filename } = req.body;
    const path = `${req.params.roomCode}/${Date.now()}_${filename}`;
    const { data, error } = await supabase.storage.from('room-files').createSignedUploadUrl(path);
    if (error) throw error;
    res.json({ path, signedUrl: data.signedUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
