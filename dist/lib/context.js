"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setContext = setContext;
exports.getContext = getContext;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const CONTEXT_FILE = '.optlyrc.json';
function setContext(url) {
    url = url.split("?")[0]; // Remove query params
    let context = { client: "", project: null, experiment: null, variation: null };
    if (url.match(/.*\/projects\/(\d+)/gi))
        context.project = parseInt(url.replace(/.*\/projects\/(\d+).*/gi, "$1"));
    if (url.match(/.*\/experiments\/(\d+)/gi))
        context.experiment = parseInt(url.replace(/.*\/experiments\/(\d+).*/gi, "$1"));
    if (url.match(/.*\/variations\/(\d+)/gi))
        context.variation = parseInt(url.replace(/.*\/variations\/(\d+).*/gi, "$1"));
    if (context.project) {
        const clientsPath = path_1.default.join("clients");
        const clients = fs_1.default.readdirSync(clientsPath);
        clients.forEach(client => {
            if (context.client)
                return;
            const clientPath = path_1.default.join(clientsPath, client);
            const stats = fs_1.default.statSync(clientPath);
            if (stats.isDirectory()) {
                const projectJsonPath = path_1.default.join(clientPath, 'projects.json');
                if (!fs_1.default.existsSync(projectJsonPath))
                    return;
                const projects = JSON.parse(fs_1.default.readFileSync(projectJsonPath, 'utf-8'));
                if (projects.find((p) => p.id === context.project)) {
                    context.client = client;
                }
            }
        });
    }
    fs_1.default.writeFileSync(CONTEXT_FILE, JSON.stringify(context, null, 2));
    return context;
}
function getContext() {
    try {
        if (!fs_1.default.existsSync(CONTEXT_FILE))
            throw new Error(`Couldn't find ${CONTEXT_FILE} in root directory`);
        const context = JSON.parse(fs_1.default.readFileSync(CONTEXT_FILE, 'utf-8'));
        return context;
    }
    catch (err) {
        throw new Error(`Failed to load context: ${err.message}`);
    }
}
