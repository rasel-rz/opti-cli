import fs from 'fs';
import path from 'path';
import { BuildOptions, PluginBuild } from 'esbuild';
import { sassPlugin } from 'esbuild-sass-plugin';
import WebSocket from 'ws';
import { log } from './log';
import { AxiosInstance } from 'axios';
import { SYS_FILE } from './sysfile';
import * as Mustache from 'mustache';
export function sanitizeDirName(name: string): string {
    return name.toLowerCase().replace(/[^A-Za-z0-9]/g, ' ').trim().replace(/[\s]+/g, '-');
}
export function readText(filePath: string): string {
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
    }
    log.error(`${filePath} not found!`);
    return '';
}
export function parseJson(text: string) {
    try { return JSON.parse(text); }
    catch (e) { return null; }
}
export function readJson(filePath: string) {
    const text = readText(filePath);
    if (!text) return null;
    return parseJson(text);
}
export function writeJson(filePath: string, obj: Object): boolean {
    try {
        fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
        return true;
    } catch (e) {
        log.error(`Error writing file: ${filePath}`);
        return false;
    }
}
function cleanUpCommentsFromBuild(filePath: string) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        let updatedContent = fileContent;
        if (filePath.endsWith('.js')) {
            // Remove single-line comments (// ...)
            updatedContent = updatedContent.replace(/\/\/.*\.[tj]s(on)?\n/gm, '');
        } else if (filePath.endsWith('.css')) {
            // Remove multi-line comments (/* ... */)
            updatedContent = updatedContent.replace(/\/\*.*\.s?css\s?\*\/\n/gm, '');
        }
        fs.writeFileSync(filePath, updatedContent, 'utf-8');
    } catch (error: any) {
        console.error(`Error removing comments from ${filePath}: ${error.message}`);
    }
}
function bundleExtension(devRoot: string) {
    const buildDir = path.join(devRoot, SYS_FILE.buildDir);
    const $extension = { extension: { $instance: `__cli__`, $id: `__id__` } as { [key: string]: any } };
    const fields = readJson(path.join(devRoot, SYS_FILE.fields)) || [];
    fields.forEach((field: any) => { $extension.extension[field.api_name] = field.default_value; });
    const html = readText(path.join(devRoot, SYS_FILE.html));
    $extension.extension.$html = Mustache.render(html, $extension);
    const css = readText(path.join(devRoot, SYS_FILE.CSS));
    const js = readText(path.join(devRoot, SYS_FILE.JS));
    const jsWithExtension = `const extension = ${JSON.stringify($extension.extension, null, 2)};\n${js}`;
    fs.writeFileSync(path.join(buildDir, SYS_FILE.JS), jsWithExtension);
    fs.writeFileSync(path.join(buildDir, SYS_FILE.CSS), css);
}
export function triggerReload(filePath: string, wss: WebSocket.Server) {
    const [fileExtension] = filePath.match(/\.[^.\/\\]+$/i) || ['.js']
    wss.clients.forEach((client: WebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(`reload${fileExtension}`);
        }
    });
    wss.clients.size && log.info(`Found change(s) on ${fileExtension.replace('.', '').toUpperCase()}. Reloading...`);
}
export function esbuildConfig(input: string, out: string, wss: WebSocket.Server | null, isExtension: boolean = false, devRoot: string = ""): BuildOptions {
    return {
        entryPoints: [input],
        outfile: out,
        bundle: true,
        format: 'esm',
        plugins: [sassPlugin(), {
            name: 'rebuild-notify',
            setup(build: PluginBuild) {
                build.onEnd(result => {
                    cleanUpCommentsFromBuild(out);
                    isExtension && bundleExtension(devRoot);
                    wss && triggerReload(out, wss);
                });
            },
        }],
    }
}

export function missingToken() {
    return log.error(`Missing Personal Access Token. Create a **.pat** file in the client directory and put your token inside.`);
}

export function checkSafePublishing(api: AxiosInstance, audience: string): Promise<boolean> {
    if (process.env.DISABLE_SAFE_PUBLISHING === 'true') return Promise.resolve(true);
    const audienceArray: any[] = parseJson(audience) || [];
    if (!audienceArray.length) return Promise.resolve(false);
    if (audienceArray[0] !== 'and') return Promise.resolve(false);
    const audiencesToCheck = audienceArray.slice(1);
    if (!audiencesToCheck.length) return Promise.resolve(false);

    return new Promise(resolve => {
        Promise.all(audiencesToCheck.map(x => x.audience_id).map(audienceId => api.get(`/audiences/${audienceId}`)))
            .then(res => {
                const audiences = res.map(x => x?.data?.name || '');
                return resolve(!!audiences.find(x => x.match(/optimizely\sqa\scookie/gi)));
            });
    });
}

export function pullExtension(api: AxiosInstance, projectPath: string, extensionId: number, localExperiments: any[]) {
    api.get(`/extensions/${extensionId}`).then(res => {
        if (!res) return;
        const xtDirName = sanitizeDirName(res.data.name);
        const extensionEntry = localExperiments.find(x => x.id === extensionId && x.isExt) ||
            { name: res.data.name, dirName: xtDirName, isExt: true, id: res.data.id, toPush: true, };
        if (xtDirName !== extensionEntry.dirName) log.warning(`Extension named changed. Local directory is **@${extensionEntry.dirName}**`);
        const xtPath = path.join(projectPath, xtDirName);
        if (!fs.existsSync(xtPath)) fs.mkdirSync(xtPath);
        writeJson(path.join(xtPath, SYS_FILE.extension), res.data);
        fs.writeFileSync(SYS_FILE.variationPath, xtPath);

        writeJson(path.join(xtPath, SYS_FILE.fields), res.data.fields);
        fs.writeFileSync(path.join(xtPath, SYS_FILE.html), res.data.implementation.html);
        fs.writeFileSync(path.join(xtPath, SYS_FILE.CSS), res.data.implementation.css);
        fs.writeFileSync(path.join(xtPath, SYS_FILE.JS), res.data.implementation.apply_js);
        fs.writeFileSync(path.join(xtPath, SYS_FILE.undoJS), res.data.implementation.undo_js);
        fs.writeFileSync(path.join(xtPath, SYS_FILE.resetJS), res.data.implementation.reset_js);

        if (!fs.existsSync(path.join(xtPath, SYS_FILE.TS)))
            fs.writeFileSync(path.join(xtPath, SYS_FILE.TS), res.data.implementation.apply_js);
        if (!fs.existsSync(path.join(xtPath, SYS_FILE.SCSS)))
            fs.writeFileSync(path.join(xtPath, SYS_FILE.SCSS), res.data.implementation.css);

        if (extensionEntry.toPush) {
            delete extensionEntry.toPush;
            localExperiments.push(extensionEntry);
        }
        writeJson(path.join(projectPath, SYS_FILE.experiments), localExperiments);
        log.success(`Extension: **${res.data.name}** pulled.`);
    });
}

export function pushExtension(api: AxiosInstance, projectPath: string, extensionId: number) {
    const experiments: any[] = readJson(path.join(projectPath, SYS_FILE.experiments)) || [];
    const extensionEntry = experiments.find(x => x.isExt && x.id === extensionId);
    if (!extensionEntry) return log.error(`Can't find extension in local directory.`);
    const xtPath = path.join(projectPath, extensionEntry.dirName);
    const extension = readJson(path.join(xtPath, SYS_FILE.extension));

    const html = readText(path.join(xtPath, SYS_FILE.html));
    const css = readText(path.join(xtPath, SYS_FILE.CSS));
    const js = readText(path.join(xtPath, SYS_FILE.JS));
    const undo_js = readText(path.join(xtPath, SYS_FILE.undoJS));
    const reset_js = readText(path.join(xtPath, SYS_FILE.resetJS));
    const fields = readJson(path.join(xtPath, SYS_FILE.fields));

    if (!extension) return log.error(`Extension not found.`);
    extension.fields = fields;
    extension.implementation.html = html;
    extension.implementation.css = css;
    extension.implementation.apply_js = js;
    extension.implementation.undo_js = undo_js;
    extension.implementation.reset_js = reset_js;

    api.patch(`/extensions/${extensionId}`, extension).then(res => {
        if (!res) return;
        writeJson(path.join(xtPath, SYS_FILE.extension), res.data);
        log.success(`Extension: **${res.data.name}** pushed.`);
    });
}