const canvas = document.getElementById('wb-canvas');
const ctx = canvas.getContext('2d');
let tool = 'pen';
let color = '#1D9E75';
let size = 4;
let drawing = false;
let startX, startY;
let history = [];
let snapshot;

function resize() {
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = canvas.parentElement.offsetWidth;
  canvas.height = canvas.parentElement.offsetHeight - canvas.previousElementSibling.offsetHeight;
  ctx.putImageData(data, 0, 0);
}

window.addEventListener('resize', resize);
resize();

function setTool(t) {
  tool = t;
  document.querySelectorAll('.wb-tool').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('tool-' + t);
  if (el) el.classList.add('active');
  canvas.style.cursor = t === 'eraser' ? 'cell' : 'crosshair';
}

function setColor(c) { color = c; }

function setSize(s) {
  size = s;
  document.querySelectorAll('#tool-thin,#tool-mid,#tool-thick').forEach(b => b.classList.remove('active-size'));
  const map = { 2: 'tool-thin', 4: 'tool-mid', 8: 'tool-thick' };
  if (map[s]) document.getElementById(map[s]).classList.add('active-size');
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return { x: src.clientX - rect.left, y: src.clientY - rect.top };
}

canvas.addEventListener('mousedown', start);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', end);
canvas.addEventListener('mouseleave', end);
canvas.addEventListener('touchstart', e => { e.preventDefault(); start(e); }, { passive: false });
canvas.addEventListener('touchmove', e => { e.preventDefault(); draw(e); }, { passive: false });
canvas.addEventListener('touchend', end);

function start(e) {
  drawing = true;
  const { x, y } = getPos(e);
  startX = x; startY = y;
  snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.moveTo(x, y);
}

function draw(e) {
  if (!drawing) return;
  const { x, y } = getPos(e);
  if (tool === 'pen') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineTo(x, y);
    ctx.stroke();
    window.parent.postMessage({ type: 'WHITEBOARD_DRAW', data: { tool, color, size, x, y, startX, startY, action: 'move' } }, '*');
  } else if (tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = size * 4;
    ctx.lineCap = 'round';
    ctx.lineTo(x, y);
    ctx.stroke();
  } else {
    ctx.putImageData(snapshot, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    if (tool === 'rect') {
      ctx.strokeRect(startX, startY, x - startX, y - startY);
    } else if (tool === 'circle') {
      ctx.beginPath();
      const rx = (x - startX) / 2, ry = (y - startY) / 2;
      ctx.ellipse(startX + rx, startY + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function end(e) {
  if (!drawing) return;
  drawing = false;
  history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (history.length > 30) history.shift();
  if (tool !== 'pen') {
    const { x, y } = e.changedTouches ? getPos({ touches: e.changedTouches }) : getPos(e);
    window.parent.postMessage({ type: 'WHITEBOARD_DRAW', data: { tool, color, size, x, y, startX, startY, action: 'end' } }, '*');
  }
}

function undoLast() {
  if (history.length > 1) {
    history.pop();
    ctx.putImageData(history[history.length - 1], 0, 0);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    history = [];
  }
}

function clearBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  history = [];
  window.parent.postMessage({ type: 'WHITEBOARD_CLEAR' }, '*');
}

// Receive remote draws
window.addEventListener('message', e => {
  const { type, data } = e.data || {};
  if (type === 'DRAW') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (data.action === 'move' && data.tool === 'pen') {
      ctx.lineTo(data.x, data.y);
      ctx.stroke();
    } else if (data.action === 'end') {
      if (data.tool === 'rect') ctx.strokeRect(data.startX, data.startY, data.x - data.startX, data.y - data.startY);
      else if (data.tool === 'circle') {
        const rx = (data.x - data.startX) / 2, ry = (data.y - data.startY) / 2;
        ctx.beginPath();
        ctx.ellipse(data.startX + rx, data.startY + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  if (type === 'CLEAR') { ctx.clearRect(0, 0, canvas.width, canvas.height); history = []; }
});
