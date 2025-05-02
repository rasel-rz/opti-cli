export function sanitizeDirName(name: string): string {
    return name.toLowerCase().replace(/[^A-Za-z0-9]/g, ' ').trim().replace(/[\s]+/g, '-');
}