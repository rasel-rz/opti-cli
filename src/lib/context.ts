import fs from 'fs';
import path from 'path';
import { SYS_FILE } from './sysfile';
import { readJson, writeJson } from './util';

export interface IContext {
    client: string;
    project: number | null;
    experiment: number | null;
    variation: number | null;
    extension?: number | null;
}

export function setContext(url: string): IContext {
    url = url.split("?")[0]; // Remove query params
    let context: IContext = { client: "", project: null, experiment: null, variation: null };
    if (url.match(/.*\/projects\/(\d+)/gi)) context.project = parseInt(url.replace(/.*\/projects\/(\d+).*/gi, "$1"));
    if (url.match(/.*\/experiments\/(\d+)/gi)) context.experiment = parseInt(url.replace(/.*\/experiments\/(\d+).*/gi, "$1"));
    if (url.match(/.*\/variations\/(\d+)/gi)) context.variation = parseInt(url.replace(/.*\/variations\/(\d+).*/gi, "$1"));
    if (url.match(/.*\/extensions\/(\d+)/gi)) context.extension = parseInt(url.replace(/.*\/extensions\/(\d+).*/gi, "$1"));
    if (context.project) {
        const clientsPath = path.join(SYS_FILE.root);
        const clients = fs.readdirSync(clientsPath);
        clients.forEach(client => {
            if (context.client) return;
            const clientPath = path.join(clientsPath, client);
            const stats = fs.statSync(clientPath);
            if (stats.isDirectory()) {
                const projectJsonPath = path.join(clientPath, SYS_FILE.projects);
                if (!fs.existsSync(projectJsonPath)) return;
                const projects = readJson(projectJsonPath) || [];
                if (projects.find((p: any) => p.id === context.project)) {
                    context.client = client;
                }
            }
        });
    }
    writeJson(SYS_FILE.context, context);
    return context;
}

export function getContext(): IContext {
    try {
        if (!fs.existsSync(SYS_FILE.context)) throw new Error(`Couldn't find ${SYS_FILE.context} in root directory`);
        const context: IContext = readJson(SYS_FILE.context) || {};
        return context;
    } catch (err: any) {
        throw new Error(`Failed to load context: ${err.message}`);
    }
}