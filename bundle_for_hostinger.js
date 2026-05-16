const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const destDir = 'C:\\GOOGLE_AntiGravity\\Hostinger\\cuepoint-server';

const filesToCopy = [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    '.env' 
];

const foldersToCopy = [
    'src',
    'client'
];

function copyFileSync(source, target) {
    let targetFile = target;
    if (fs.existsSync(target)) {
        if (fs.lstatSync(target).isDirectory()) {
            targetFile = path.join(target, path.basename(source));
        }
    }
    fs.writeFileSync(targetFile, fs.readFileSync(source));
}

function copyFolderRecursiveSync(source, target) {
    let files = [];
    let targetFolder = path.join(target, path.basename(source));
    if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder);
    }
    
    if (fs.lstatSync(source).isDirectory()) {
        files = fs.readdirSync(source);
        files.forEach(function (file) {
            if (file === 'node_modules' || file === 'dist' || file === '.next') return; // Skip build and modules
            
            var curSource = path.join(source, file);
            if (fs.lstatSync(curSource).isDirectory()) {
                copyFolderRecursiveSync(curSource, targetFolder);
            } else {
                copyFileSync(curSource, targetFolder);
            }
        });
    }
}

// Ensure destination exists
if (!fs.existsSync(destDir)){
    fs.mkdirSync(destDir, { recursive: true });
}

// Copy single files
filesToCopy.forEach(file => {
    const srcPath = path.join(srcDir, file);
    if (fs.existsSync(srcPath)) {
        if (file === '.env') {
            copyFileSync(srcPath, path.join(destDir, '.env.example'));
        } else {
            copyFileSync(srcPath, destDir);
        }
    }
});

// Copy folders recursively
foldersToCopy.forEach(folder => {
    const srcPath = path.join(srcDir, folder);
    if (fs.existsSync(srcPath)) {
        copyFolderRecursiveSync(srcPath, destDir);
    }
});

// Create empty data and logs directories
['data', 'logs'].forEach(dir => {
    const p = path.join(destDir, dir);
    if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
    }
});

console.log('Copy complete!');
