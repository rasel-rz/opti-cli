"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeDirName = sanitizeDirName;
exports.readText = readText;
exports.readJson = readJson;
exports.writeJson = writeJson;
exports.triggerReload = triggerReload;
exports.esbuildConfig = esbuildConfig;
const fs_1 = __importDefault(require("fs"));
const esbuild_sass_plugin_1 = require("esbuild-sass-plugin");
const ws_1 = __importDefault(require("ws"));
function sanitizeDirName(name) {
    return name.toLowerCase().replace(/[^A-Za-z0-9]/g, ' ').trim().replace(/[\s]+/g, '-');
}
function readText(filePath) {
    if (fs_1.default.existsSync(filePath)) {
        return fs_1.default.readFileSync(filePath, 'utf-8');
    }
    console.log(`${filePath} not found!`);
    return '';
}
function readJson(filePath) {
    const text = readText(filePath);
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch (e) {
        return null;
    }
}
function writeJson(filePath, obj) {
    try {
        fs_1.default.writeFileSync(filePath, JSON.stringify(obj, null, 2));
        return true;
    }
    catch (e) {
        console.log(`Error writing file: ${filePath}`);
        return false;
    }
}
function cleanUpCommentsFromBuild(filePath) {
    try {
        const fileContent = fs_1.default.readFileSync(filePath, 'utf-8');
        let updatedContent = fileContent;
        if (filePath.endsWith('.js')) {
            // Remove single-line comments (// ...)
            updatedContent = updatedContent.replace(/\/\/.*\.[tj]s\n/gm, '');
        }
        else if (filePath.endsWith('.css')) {
            // Remove multi-line comments (/* ... */)
            updatedContent = updatedContent.replace(/\/\*.*\.s?css\s?\*\/\n/gm, '');
        }
        fs_1.default.writeFileSync(filePath, updatedContent, 'utf-8');
    }
    catch (error) {
        console.error(`Error removing comments from ${filePath}: ${error.message}`);
    }
}
function triggerReload(filePath, wss) {
    const [fileExtension] = filePath.match(/\.[^.\/\\]+$/i) || ['.js'];
    console.log(`Found change(s) on ${fileExtension.replace('.', '').toUpperCase()}. Reloading...`);
    wss.clients.forEach((client) => {
        if (client.readyState === ws_1.default.OPEN) {
            client.send(`reload${fileExtension}`);
        }
    });
}
function esbuildConfig(input, out, wss) {
    return {
        entryPoints: [input],
        outfile: out,
        bundle: true,
        format: 'esm',
        plugins: [(0, esbuild_sass_plugin_1.sassPlugin)(), {
                name: 'rebuild-notify',
                setup(build) {
                    build.onEnd(result => {
                        cleanUpCommentsFromBuild(out);
                        triggerReload(out, wss);
                    });
                },
            }],
    };
}
