import fs from 'fs';
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