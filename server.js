const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const app = express();

// ── Configuration ────────────────────────────────────────────────────────────
// Set BASE_URL to the public IP/hostname of this server so the phone can
// reach it (e.g. BASE_URL=http://192.168.1.100:3000 node server.js).
const PORT     = process.env.PORT     || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// URL of the subscriber provisioning server the phone should be redirected to.
// Override with environment variable: PROV_SERVER=http://192.168.1.50/ node server.js
const PROV_SERVER = process.env.PROV_SERVER || 'http://YOUR-PROV-SERVER/';

// ── Directories ───────────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR  = path.join(__dirname, 'public');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(PUBLIC_DIR))  fs.mkdirSync(PUBLIC_DIR);

// ── File upload (multer) ──────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    // Always save as wallpaper.<ext> so the XML URL stays stable
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `wallpaper${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// ── GET /provision.xml ────────────────────────────────────────────────────────
// The Yealink phone fetches this on boot (via DHCP option 66 pointing here).
app.get('/provision.xml', (_req, res) => {
  // Detect which wallpaper file exists (jpg/png/bmp)
  const exts = ['.jpg', '.png', '.bmp', '.gif'];
  let wallpaperUrl = `${BASE_URL}/uploads/wallpaper.jpg`; // default
  for (const ext of exts) {
    if (fs.existsSync(path.join(UPLOADS_DIR, `wallpaper${ext}`))) {
      wallpaperUrl = `${BASE_URL}/uploads/wallpaper${ext}`;
      break;
    }
  }

  const xml = buildProvisionXml(wallpaperUrl, PROV_SERVER);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.send(xml);
});

// ── POST /upload ──────────────────────────────────────────────────────────────
// Accepts a multipart form field named "wallpaper".
app.post('/upload', upload.single('wallpaper'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file received' });
  }
  const ext = path.extname(req.file.filename).toLowerCase();
  const url = `${BASE_URL}/uploads/wallpaper${ext}`;
  res.json({ success: true, url });
});

// ── XML builder ───────────────────────────────────────────────────────────────
function buildProvisionXml(wallpaperUrl, provServerUrl) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<yealinkconfig>

  <!-- Network: IPv4 only, IPv6 disabled -->
  <NETWORK>
    <IPv6_ENABLE perm="" value="0"/>
  </NETWORK>

  <!-- Voice: Ringer volume (0-15) -->
  <VOICE>
    <RING_VOL perm="" value="2"/>
  </VOICE>

  <!-- Phone Display: Desktop wallpaper -->
  <PHONE_SETTING>
    <BACKGROUNDS perm="" path="${wallpaperUrl}"/>
  </PHONE_SETTING>

  <!-- Auto-provisioning: Redirect to subscriber info server -->
  <AUTOPROVISION>
    <SERVER perm="" url="${provServerUrl}" user="" password=""/>
  </AUTOPROVISION>

</yealinkconfig>`;
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Yealink provisioning server started`);
  console.log(`  Upload interface : ${BASE_URL}/`);
  console.log(`  Provision XML    : ${BASE_URL}/provision.xml`);
  console.log(`  Prov redirect    : ${PROV_SERVER}`);
  console.log(`\nPoint DHCP option 66 to: ${BASE_URL}/provision.xml`);
});
