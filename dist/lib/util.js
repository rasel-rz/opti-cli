"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.pullExtension = pullExtension;
exports.pushExtension = pushExtension;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const esbuild_sass_plugin_1 = require("esbuild-sass-plugin");
const ws_1 = __importDefault(require("ws"));
const log_1 = require("./log");
const sysfile_1 = require("./sysfile");
const Mustache = __importStar(require("mustache"));
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
function bundleExtension(devRoot) {
    const buildDir = path_1.default.join(devRoot, sysfile_1.SYS_FILE.buildDir);
    const $extension = { extension: { $instance: `__cli__`, $id: `__id__` } };
    const fields = readJson(path_1.default.join(devRoot, sysfile_1.SYS_FILE.fields)) || [];
    fields.forEach((field) => { $extension.extension[field.api_name] = field.default_value; });
    const html = readText(path_1.default.join(devRoot, sysfile_1.SYS_FILE.html));
    $extension.extension.$html = Mustache.render(html, $extension);
    const css = readText(path_1.default.join(devRoot, sysfile_1.SYS_FILE.CSS));
    const js = readText(path_1.default.join(devRoot, sysfile_1.SYS_FILE.JS));
    const jsWithExtension = `const extension = ${JSON.stringify($extension.extension, null, 2)};\n${js}`;
    fs_1.default.writeFileSync(path_1.default.join(buildDir, sysfile_1.SYS_FILE.JS), jsWithExtension);
    fs_1.default.writeFileSync(path_1.default.join(buildDir, sysfile_1.SYS_FILE.CSS), css);
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
function esbuildConfig(input, out, wss, isExtension = false, devRoot = "") {
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
                        isExtension && bundleExtension(devRoot);
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
            return resolve(!!audiences.find(x => x.match(/optimizely\s(qa|test)\scookie/gi)));
        });
    });
}
function pullExtension(api, projectPath, extensionId, localExperiments) {
    api.get(`/extensions/${extensionId}`).then(res => {
        if (!res)
            return;
        const xtDirName = sanitizeDirName(res.data.name);
        const extensionEntry = localExperiments.find(x => x.id === extensionId && x.isExt) ||
            { name: res.data.name, dirName: xtDirName, isExt: true, id: res.data.id, toPush: true, };
        if (xtDirName !== extensionEntry.dirName)
            log_1.log.warning(`Extension named changed. Local directory is **@${extensionEntry.dirName}**`);
        const xtPath = path_1.default.join(projectPath, xtDirName);
        if (!fs_1.default.existsSync(xtPath))
            fs_1.default.mkdirSync(xtPath);
        writeJson(path_1.default.join(xtPath, sysfile_1.SYS_FILE.extension), res.data);
        fs_1.default.writeFileSync(sysfile_1.SYS_FILE.variationPath, xtPath);
        writeJson(path_1.default.join(xtPath, sysfile_1.SYS_FILE.fields), res.data.fields);
        fs_1.default.writeFileSync(path_1.default.join(xtPath, sysfile_1.SYS_FILE.html), res.data.implementation.html);
        fs_1.default.writeFileSync(path_1.default.join(xtPath, sysfile_1.SYS_FILE.CSS), res.data.implementation.css);
        fs_1.default.writeFileSync(path_1.default.join(xtPath, sysfile_1.SYS_FILE.JS), res.data.implementation.apply_js);
        fs_1.default.writeFileSync(path_1.default.join(xtPath, sysfile_1.SYS_FILE.undoJS), res.data.implementation.undo_js);
        fs_1.default.writeFileSync(path_1.default.join(xtPath, sysfile_1.SYS_FILE.resetJS), res.data.implementation.reset_js);
        if (!fs_1.default.existsSync(path_1.default.join(xtPath, sysfile_1.SYS_FILE.TS)))
            fs_1.default.writeFileSync(path_1.default.join(xtPath, sysfile_1.SYS_FILE.TS), res.data.implementation.apply_js);
        if (!fs_1.default.existsSync(path_1.default.join(xtPath, sysfile_1.SYS_FILE.SCSS)))
            fs_1.default.writeFileSync(path_1.default.join(xtPath, sysfile_1.SYS_FILE.SCSS), res.data.implementation.css);
        if (extensionEntry.toPush) {
            delete extensionEntry.toPush;
            localExperiments.push(extensionEntry);
        }
        writeJson(path_1.default.join(projectPath, sysfile_1.SYS_FILE.experiments), localExperiments);
        log_1.log.success(`Extension: **${res.data.name}** pulled.`);
    });
}
function pushExtension(api, projectPath, extensionId) {
    const experiments = readJson(path_1.default.join(projectPath, sysfile_1.SYS_FILE.experiments)) || [];
    const extensionEntry = experiments.find(x => x.isExt && x.id === extensionId);
    if (!extensionEntry)
        return log_1.log.error(`Can't find extension in local directory.`);
    const xtPath = path_1.default.join(projectPath, extensionEntry.dirName);
    const extension = readJson(path_1.default.join(xtPath, sysfile_1.SYS_FILE.extension));
    const html = readText(path_1.default.join(xtPath, sysfile_1.SYS_FILE.html));
    const css = readText(path_1.default.join(xtPath, sysfile_1.SYS_FILE.CSS));
    const js = readText(path_1.default.join(xtPath, sysfile_1.SYS_FILE.JS));
    const undo_js = readText(path_1.default.join(xtPath, sysfile_1.SYS_FILE.undoJS));
    const reset_js = readText(path_1.default.join(xtPath, sysfile_1.SYS_FILE.resetJS));
    const fields = readJson(path_1.default.join(xtPath, sysfile_1.SYS_FILE.fields));
    if (!extension)
        return log_1.log.error(`Extension not found.`);
    extension.fields = fields;
    extension.implementation.html = html;
    extension.implementation.css = css;
    extension.implementation.apply_js = js;
    extension.implementation.undo_js = undo_js;
    extension.implementation.reset_js = reset_js;
    api.patch(`/extensions/${extensionId}`, extension).then(res => {
        if (!res)
            return;
        writeJson(path_1.default.join(xtPath, sysfile_1.SYS_FILE.extension), res.data);
        log_1.log.success(`Extension: **${res.data.name}** pushed.`);
    });
}
