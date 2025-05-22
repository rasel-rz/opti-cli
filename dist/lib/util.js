"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeDirName = sanitizeDirName;
exports.readText = readText;
exports.parseJson = parseJson;
exports.readJson = readJson;
exports.writeJson = writeJson;
exports.triggerReload = triggerReload;
exports.esbuildConfig = esbuildConfig;
exports.missingToken = missingToken;
exports.checkSafePublishing = checkSafePublishing;
const fs_1 = __importDefault(require("fs"));
const esbuild_sass_plugin_1 = require("esbuild-sass-plugin");
const ws_1 = __importDefault(require("ws"));
const log_1 = require("./log");
function sanitizeDirName(name) {
    return name.toLowerCase().replace(/[^A-Za-z0-9]/g, ' ').trim().replace(/[\s]+/g, '-');
}
function readText(filePath) {
    if (fs_1.default.existsSync(filePath)) {
        return fs_1.default.readFileSync(filePath, 'utf-8');
    }
    log_1.log.error(`${filePath} not found!`);
    return '';
}
function parseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch (e) {
        return null;
    }
}
function readJson(filePath) {
    const text = readText(filePath);
    if (!text)
        return null;
    return parseJson(text);
}
function writeJson(filePath, obj) {
    try {
        fs_1.default.writeFileSync(filePath, JSON.stringify(obj, null, 2));
        return true;
    }
    catch (e) {
        log_1.log.error(`Error writing file: ${filePath}`);
        return false;
    }
}
function cleanUpCommentsFromBuild(filePath) {
    try {
        const fileContent = fs_1.default.readFileSync(filePath, 'utf-8');
        let updatedContent = fileContent;
        if (filePath.endsWith('.js')) {
            // Remove single-line comments (// ...)
            updatedContent = updatedContent.replace(/\/\/.*\.[tj]s(on)?\n/gm, '');
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
    wss.clients.forEach((client) => {
        if (client.readyState === ws_1.default.OPEN) {
            client.send(`reload${fileExtension}`);
        }
    });
    wss.clients.size && log_1.log.info(`Found change(s) on ${fileExtension.replace('.', '').toUpperCase()}. Reloading...`);
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
                        wss && triggerReload(out, wss);
                    });
                },
            }],
    };
}
function missingToken() {
    return log_1.log.error(`Missing Personal Access Token. Create a **.pat** file in the client directory and put your token inside.`);
}
function checkSafePublishing(api, audience) {
    if (process.env.DISABLE_SAFE_PUBLISHING === 'true')
        return Promise.resolve(true);
    const audienceArray = parseJson(audience) || [];
    if (!audienceArray.length)
        return Promise.resolve(false);
    if (audienceArray[0] !== 'and')
        return Promise.resolve(false);
    const audiencesToCheck = audienceArray.slice(1);
    if (!audiencesToCheck.length)
        return Promise.resolve(false);
    return new Promise(resolve => {
        Promise.all(audiencesToCheck.map(x => x.audience_id).map(audienceId => api.get(`/audiences/${audienceId}`)))
            .then(res => {
            const audiences = res.map(x => { var _a; return ((_a = x === null || x === void 0 ? void 0 : x.data) === null || _a === void 0 ? void 0 : _a.name) || ''; });
            return resolve(!!audiences.find(x => x.match(/optimizely\sqa\scookie/gi)));
        });
    });
}
