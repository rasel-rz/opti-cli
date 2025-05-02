import fs from 'fs';
import path from 'path';

interface IContext {
    client: string;
    project: number | null;
    experiment: number | null;
    variation: number | null;
}
const CONTEXT_FILE = '.optlyrc.json';

export function setContext(url: string): IContext {
    url = url.split("?")[0]; // Remove query params
    let context: IContext = { client: "", project: null, experiment: null, variation: null };
    if (url.match(/.*\/projects\/(\d+)/gi)) context.project = parseInt(url.replace(/.*\/projects\/(\d+).*/gi, "$1"));
    if (url.match(/.*\/experiments\/(\d+)/gi)) context.experiment = parseInt(url.replace(/.*\/experiments\/(\d+).*/gi, "$1"));
    if (url.match(/.*\/variations\/(\d+)/gi)) context.variation = parseInt(url.replace(/.*\/variations\/(\d+).*/gi, "$1"));
    if (context.project) {
        const clientsPath = path.join("clients");
        const clients = fs.readdirSync(clientsPath);
        clients.forEach(client => {
            if (context.client) return;
            const clientPath = path.join(clientsPath, client);
            const stats = fs.statSync(clientPath);
            if (stats.isDirectory()) {
                const projectJsonPath = path.join(clientPath, 'projects.json');
                if (!fs.existsSync(projectJsonPath)) return;
                const projects = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
                if (projects.find((p: any) => p.id === context.project)) {
                    context.client = client;
                }
            }
        });
    }
    fs.writeFileSync(CONTEXT_FILE, JSON.stringify(context, null, 2));
    return context;
}

export function getContext(): IContext {
    try {
        if (!fs.existsSync(CONTEXT_FILE)) throw new Error(`Couldn't find ${CONTEXT_FILE} in root directory`);
        const context: IContext = JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf-8'));
        return context;
    } catch (err: any) {
        throw new Error(`Failed to load context: ${err.message}`);
    }
}