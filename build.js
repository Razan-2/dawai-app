// Capacitor Web Directory Builder (Updated to include Auth files)
const fs = require('fs');
const path = require('path');

const wwwDir = path.join(__dirname, 'www');

// Create www directory if it doesn't exist
if (!fs.existsSync(wwwDir)){
    fs.mkdirSync(wwwDir);
}

// List of files/folders to copy
const filesToCopy = [
    'index.html',
    'login.html',
    'register.html',
    'app.js',
    'auth.js',
    'style.css',
    'manifest.json',
    'icon-192x192.png',
    'icon-512x512.png'
];

filesToCopy.forEach(file => {
    const src = path.join(__dirname, file);
    const dest = path.join(wwwDir, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`Copied ${file} to www/`);
    } else {
        console.warn(`Warning: ${file} not found.`);
    }
});

console.log('Build complete. Files ready for Capacitor.');
