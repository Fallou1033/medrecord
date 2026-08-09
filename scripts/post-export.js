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
      ::-webkit-calendar-picker-indicator { cursor: pointer; filter: invert(1); }
      @page {
        size: A4 portrait;
        margin: 12mm;
      }
    </style>
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
  html = html.replace(/\.js"/g, `.js?v=${timestamp}"`);
  html = html.replace(/\.css"/g, `.css?v=${timestamp}"`);

  fs.writeFileSync(filePath, html, 'utf8');
}

fixHtmlFile(indexPath);
fixHtmlFile(notFoundPath);

// Ensure .nojekyll exists
fs.writeFileSync(path.join(distDir, '.nojekyll'), '# nojekyll');
console.log('Post-export fix completed: Base64 embedded icon fonts & relative paths updated.');
