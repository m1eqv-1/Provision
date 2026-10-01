const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const app = express();

// ── Configuration ────────────────────────────────────────────────────────────
const PORT     = process.env.PORT     || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const PROV_SERVER = process.env.PROV_SERVER || 'http://YOUR-PROV-SERVER/';

// ── Directories ───────────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR  = path.join(__dirname, 'public');

// Manufacturer-specific directories
const MANUFACTURERS = {
  yealink: {
    uploadDir: path.join(UPLOADS_DIR, 'yealink'),
    types: ['firmware', 'screensaver']
  },
  mitel: {
    uploadDir: path.join(UPLOADS_DIR, 'mitel'),
    types: ['firmware', 'screensaver']
  }
};

// Create directories if they don't exist
Object.values(MANUFACTURERS).forEach(mfg => {
  if (!fs.existsSync(mfg.uploadDir)) fs.mkdirSync(mfg.uploadDir, { recursive: true });
});
if (!fs.existsSync(PUBLIC_DIR))  fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// ── File upload (multer) ──────────────────────────────────────────────────────
function createUploadMiddleware(manufacturer, fileType) {
  const storage = multer.diskStorage({
    destination: MANUFACTURERS[manufacturer].uploadDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || (fileType === 'firmware' ? '.bin' : '.jpg');
      cb(null, `${fileType}${ext}`);
    }
  });

  const isImage = fileType === 'screensaver';
  const isFirmware = fileType === 'firmware';

  return multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max
    fileFilter: (_req, file, cb) => {
      if (isImage && file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else if (isFirmware && (file.mimetype === 'application/octet-stream' || file.mimetype.includes('bin') || file.mimetype.includes('zip'))) {
        cb(null, true);
      } else if (isFirmware) {
        cb(null, true); // Allow any file for firmware
      } else {
        cb(new Error('Invalid file type'));
      }
    }
  });
}

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// ── GET / (Home page - Manufacturer selection) ──────────────────────────────
app.get('/', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ── Yealink Routes ──────────────────────────────────────────────────────────
app.get('/yealink', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'yealink', 'index.html'));
});

app.get('/yealink/provision.xml', (_req, res) => {
  const yealinkDir = MANUFACTURERS.yealink.uploadDir;
  const exts = ['.jpg', '.png', '.bmp', '.gif'];
  let screensaverUrl = `${BASE_URL}/uploads/yealink/screensaver.jpg`;
  for (const ext of exts) {
    if (fs.existsSync(path.join(yealinkDir, `screensaver${ext}`))) {
      screensaverUrl = `${BASE_URL}/uploads/yealink/screensaver${ext}`;
      break;
    }
  }

  const xml = buildYealinkProvisionXml(screensaverUrl, PROV_SERVER);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.send(xml);
});

app.post('/yealink/upload-firmware', createUploadMiddleware('yealink', 'firmware').single('firmware'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  const ext = path.extname(req.file.filename).toLowerCase();
  const url = `${BASE_URL}/uploads/yealink/firmware${ext}`;
  res.json({ success: true, url, type: 'firmware' });
});

app.post('/yealink/upload-screensaver', createUploadMiddleware('yealink', 'screensaver').single('screensaver'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  const ext = path.extname(req.file.filename).toLowerCase();
  const url = `${BASE_URL}/uploads/yealink/screensaver${ext}`;
  res.json({ success: true, url, type: 'screensaver' });
});

// ── Mitel Routes ──────────────────────────────────────────────────────────
app.get('/mitel', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'mitel', 'index.html'));
});

app.get('/mitel/provision.xml', (_req, res) => {
  const mitelDir = MANUFACTURERS.mitel.uploadDir;
  const exts = ['.jpg', '.png', '.bmp', '.gif'];
  let screensaverUrl = `${BASE_URL}/uploads/mitel/screensaver.jpg`;
  for (const ext of exts) {
    if (fs.existsSync(path.join(mitelDir, `screensaver${ext}`))) {
      screensaverUrl = `${BASE_URL}/uploads/mitel/screensaver${ext}`;
      break;
    }
  }

  const xml = buildMitelProvisionXml(screensaverUrl, PROV_SERVER);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.send(xml);
});

app.post('/mitel/upload-firmware', createUploadMiddleware('mitel', 'firmware').single('firmware'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  const ext = path.extname(req.file.filename).toLowerCase();
  const url = `${BASE_URL}/uploads/mitel/firmware${ext}`;
  res.json({ success: true, url, type: 'firmware' });
});

app.post('/mitel/upload-screensaver', createUploadMiddleware('mitel', 'screensaver').single('screensaver'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  const ext = path.extname(req.file.filename).toLowerCase();
  const url = `${BASE_URL}/uploads/mitel/screensaver${ext}`;
  res.json({ success: true, url, type: 'screensaver' });
});

// ── XML builders ──────────────────────────────────────────────────────────────
function buildYealinkProvisionXml(screensaverUrl, provServerUrl) {
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

  <!-- Phone Display: Desktop wallpaper/screensaver -->
  <PHONE_SETTING>
    <BACKGROUNDS perm="" path="${screensaverUrl}"/>
  </PHONE_SETTING>

  <!-- Auto-provisioning: Redirect to subscriber info server -->
  <AUTOPROVISION>
    <SERVER perm="" url="${provServerUrl}" user="" password=""/>
  </AUTOPROVISION>

</yealinkconfig>`;
}

function buildMitelProvisionXml(screensaverUrl, provServerUrl) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<mitelconfig>

  <!-- Mitel Phone Provisioning Configuration -->

  <!-- Display Settings: Screensaver image -->
  <DISPLAY>
    <SCREENSAVER perm="" path="${screensaverUrl}"/>
  </DISPLAY>

  <!-- Audio Settings -->
  <AUDIO>
    <RING_VOLUME perm="" value="2"/>
  </AUDIO>

  <!-- Provisioning Server Configuration -->
  <PROVISIONING>
    <SERVER perm="" url="${provServerUrl}" user="" password=""/>
  </PROVISIONING>

</mitelconfig>`;
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌐 Multi-Manufacturer Provisioning Server Started\n`);
  console.log(`  Home page        : ${BASE_URL}/`);
  console.log(`\n  Yealink:`);
  console.log(`    Interface      : ${BASE_URL}/yealink`);
  console.log(`    Provision XML  : ${BASE_URL}/yealink/provision.xml`);
  console.log(`\n  Mitel:`);
  console.log(`    Interface      : ${BASE_URL}/mitel`);
  console.log(`    Provision XML  : ${BASE_URL}/mitel/provision.xml`);
  console.log(`\n  Prov redirect    : ${PROV_SERVER}`);
  console.log(`\nPoint DHCP option 66 to the appropriate provision.xml\n`);
});
