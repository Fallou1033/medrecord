const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const indexPath = path.join(distDir, 'index.html');
const notFoundPath = path.join(distDir, '404.html');

// 1. Rename _expo directory to expo_assets to bypass GitHub Pages underscore filter
const oldExpoDir = path.join(distDir, '_expo');
const newExpoDir = path.join(distDir, 'expo_assets');

if (fs.existsSync(oldExpoDir)) {
  if (fs.existsSync(newExpoDir)) {
    fs.rmSync(newExpoDir, { recursive: true, force: true });
  }
  fs.renameSync(oldExpoDir, newExpoDir);
}

if (fs.existsSync(indexPath)) {
  fs.copyFileSync(indexPath, notFoundPath);
}

// 2. Extract all vector icon fonts into a clean dist/fonts/ folder
const fontsTargetDir = path.join(distDir, 'fonts');
if (!fs.existsSync(fontsTargetDir)) {
  fs.mkdirSync(fontsTargetDir, { recursive: true });
}

function copyFontsRecursively(srcDir) {
  if (!fs.existsSync(srcDir)) return;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  entries.forEach(entry => {
    const fullPath = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      copyFontsRecursively(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.ttf')) {
      fs.copyFileSync(fullPath, path.join(fontsTargetDir, entry.name));
    }
  });
}

copyFontsRecursively(path.join(distDir, 'assets'));

// 3. Generate Base64 Embedded @font-face CSS for instant, fail-safe icon rendering
function generateFontFaceCss() {
  if (!fs.existsSync(fontsTargetDir)) return '';
  const files = fs.readdirSync(fontsTargetDir);
  let css = '\n<style id="expo-vector-icons-styles">\n';

  files.forEach(file => {
    if (!file.endsWith('.ttf')) return;
    const fontFamily = file.split('.')[0];
    const filePath = path.join(fontsTargetDir, file);
    const fontBuffer = fs.readFileSync(filePath);
    const base64Data = fontBuffer.toString('base64');
    const dataUri = `data:font/truetype;charset=utf-8;base64,${base64Data}`;
    const relPath = './fonts/' + file;

    css += `@font-face {
  font-family: '${fontFamily}';
  src: url('${dataUri}') format('truetype'), url('${relPath}') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: block;
}\n`;

    if (fontFamily === 'Ionicons') {
      css += `@font-face { font-family: 'ionicons'; src: url('${dataUri}') format('truetype'); font-display: block; }\n`;
      css += `@font-face { font-family: 'Ionicons-Regular'; src: url('${dataUri}') format('truetype'); font-display: block; }\n`;
    }
    if (fontFamily === 'MaterialCommunityIcons') {
      css += `@font-face { font-family: 'Material Community Icons'; src: url('${dataUri}') format('truetype'); font-display: block; }\n`;
      css += `@font-face { font-family: 'material-community-icons'; src: url('${dataUri}') format('truetype'); font-display: block; }\n`;
    }
    if (fontFamily === 'MaterialIcons') {
      css += `@font-face { font-family: 'Material Icons'; src: url('${dataUri}') format('truetype'); font-display: block; }\n`;
      css += `@font-face { font-family: 'material-icons'; src: url('${dataUri}') format('truetype'); font-display: block; }\n`;
    }
    if (fontFamily === 'FontAwesome') {
      css += `@font-face { font-family: 'fontawesome'; src: url('${dataUri}') format('truetype'); font-display: block; }\n`;
    }
  });

  css += '</style>\n';
  return css;
}

const fontCss = generateFontFaceCss();

function fixHtmlFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let html = fs.readFileSync(filePath, 'utf8');

  // Strip old injected font styles if any
  html = html.replace(/<style id="expo-vector-icons-styles">[\s\S]*?<\/style>/gi, '');

  if (!html.includes('http-equiv="Cache-Control"')) {
    const cacheMeta = `
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <style id="timepicker-fix">
      select option {
        background-color: #0F2C3D !important;
        color: #FFFFFF !important;
        padding: 10px !important;
        font-size: 16px !important;
      }
      select {
        color-scheme: dark;
      }
      /* Prevent truncating dialog actions */
      ::-webkit-datetime-edit-fields-wrapper { color: #FFFFFF !important; }
      @page {
        size: A4 portrait;
        margin: 8mm 10mm;
      }
      @media print {
        nav, header, footer, .navbar, button, .btn, .no-print, input, textarea, div[role="navigation"], [class*="Header"], [class*="Navbar"] {
          display: none !important;
        }
      }
    </style>
    <script>
      window.addEventListener('error', function(e) {
        console.error('MedRecord Runtime Error:', e.error || e.message);
        var root = document.getElementById('root');
        if (root && (!root.innerHTML || root.innerHTML.trim() === '')) {
          root.innerHTML = '<div style="background:#0F2C3D;color:#28C2FF;height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:24px;font-family:sans-serif;text-align:center;"><h1 style="font-size:24px;margin-bottom:12px;">MedRecord</h1><p style="color:#FFFFFF;font-size:15px;margin-bottom:16px;">Chargement des composants en cours...</p><button onclick="localStorage.clear();window.location.reload();" style="background:#28C2FF;color:#0F2C3D;border:none;padding:12px 24px;border-radius:8px;font-weight:bold;cursor:pointer;">Réinitialiser & Recharger</button></div>';
        }
      });
      window.addEventListener('unhandledrejection', function(e) {
        console.error('MedRecord Unhandled Promise:', e.reason);
        var root = document.getElementById('root');
        if (root && (!root.innerHTML || root.innerHTML.trim() === '')) {
          root.innerHTML = '<div style="background:#0F2C3D;color:#28C2FF;height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:24px;font-family:sans-serif;text-align:center;"><h1 style="font-size:24px;margin-bottom:12px;">MedRecord</h1><p style="color:#FFFFFF;font-size:15px;margin-bottom:16px;">Reconnexion et initialisation de la page...</p><button onclick="localStorage.clear();window.location.reload();" style="background:#28C2FF;color:#0F2C3D;border:none;padding:12px 24px;border-radius:8px;font-weight:bold;cursor:pointer;">Réinitialiser & Recharger</button></div>';
        }
      });
    </script>
    `;
    html = html.replace('<head>', `<head>${cacheMeta}`);
  }

  if (!html.includes('<base ')) {
    html = html.replace('<head>', '<head>\n    <base href="/medrecord/" />');
  }
  if (fontCss) {
    html = html.replace('</head>', `${fontCss}</head>`);
  }
  html = html.replace(/_expo\//g, 'expo_assets/');
  html = html.replace(/href="\/expo_assets\//g, 'href="./expo_assets/');
  html = html.replace(/src="\/expo_assets\//g, 'src="./expo_assets/');
  html = html.replace(/href="\/favicon.ico"/g, 'href="./favicon.ico"');

  // Force cache-busting on js and css files
  const timestamp = Date.now();
  html = html.replace(/\.js(\?v=\d+)?(["\s>])/g, `.js?v=${timestamp}$2`);
  html = html.replace(/\.css(\?v=\d+)?(["\s>])/g, `.css?v=${timestamp}$2`);

  fs.writeFileSync(filePath, html, 'utf8');
}

// 4. Replace _expo references inside all exported JS and CSS bundles
function replaceInBundleFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      replaceInBundleFiles(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.css') || entry.name.endsWith('.json'))) {
      let content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('_expo/')) {
        content = content.replace(/_expo\//g, 'expo_assets/');
        fs.writeFileSync(fullPath, content, 'utf8');
      }
    }
  });
}

replaceInBundleFiles(newExpoDir);

fixHtmlFile(indexPath);
fixHtmlFile(notFoundPath);

// Ensure .nojekyll exists
fs.writeFileSync(path.join(distDir, '.nojekyll'), '# nojekyll');
console.log('Post-export fix completed: Base64 embedded icon fonts, bundle paths & fail-safe scripts updated.');
