import fs from 'fs';
import { BuildOptions, PluginBuild } from 'esbuild';
import { sassPlugin } from 'esbuild-sass-plugin';
import WebSocket from 'ws';
export function sanitizeDirName(name: string): string {
    return name.toLowerCase().replace(/[^A-Za-z0-9]/g, ' ').trim().replace(/[\s]+/g, '-');
}
export function readText(filePath: string): string {
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
    }
    console.log(`${filePath} not found!`);
    return '';
}
export function readJson(filePath: string) {
    const text = readText(filePath);
    if (!text) return null;
    try { return JSON.parse(text); }
    catch (e) { return null; }
}
export function writeJson(filePath: string, obj: Object): boolean {
    try {
        fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
        return true;
    } catch (e) {
        console.log(`Error writing file: ${filePath}`);
        return false;
    }
}
function cleanUpCommentsFromBuild(filePath: string) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        let updatedContent = fileContent;
        if (filePath.endsWith('.js')) {
            // Remove single-line comments (// ...)
            updatedContent = updatedContent.replace(/\/\/.*\.[tj]s\n/gm, '');
        } else if (filePath.endsWith('.css')) {
            // Remove multi-line comments (/* ... */)
            updatedContent = updatedContent.replace(/\/\*.*\.s?css\s?\*\/\n/gm, '');
        }
        fs.writeFileSync(filePath, updatedContent, 'utf-8');
    } catch (error: any) {
        console.error(`Error removing comments from ${filePath}: ${error.message}`);
    }
}
export function triggerReload(filePath: string, wss: WebSocket.Server) {
    const [fileExtension] = filePath.match(/\.[^.\/\\]+$/i) || ['.js']
    console.log(`Found change(s) on ${fileExtension.replace('.', '').toUpperCase()}. Reloading...`);
    wss.clients.forEach((client: WebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(`reload${fileExtension}`);
        }
    });
}
export function esbuildConfig(input: string, out: string, wss: WebSocket.Server): BuildOptions {
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
                    triggerReload(out, wss);
                });
            },
        }],
    }
}