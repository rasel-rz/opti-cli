"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setContext = setContext;
exports.getContext = getContext;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sysfile_1 = require("./sysfile");
const util_1 = require("./util");
function setContext(url) {
    url = url.split("?")[0]; // Remove query params
    let context = { client: "", project: null, experiment: null, variation: null, page: null };
    if (url.match(/.*\/projects\/(\d+)/gi))
        context.project = parseInt(url.replace(/.*\/projects\/(\d+).*/gi, "$1"));
    if (url.match(/.*\/experiments\/(\d+)/gi))
        context.experiment = parseInt(url.replace(/.*\/experiments\/(\d+).*/gi, "$1"));
    if (url.match(/.*\/variations\/(\d+)/gi))
        context.variation = parseInt(url.replace(/.*\/variations\/(\d+).*/gi, "$1"));
    if (url.match(/.*\/extensions\/(\d+)/gi))
        context.extension = parseInt(url.replace(/.*\/extensions\/(\d+).*/gi, "$1"));
    if (context.project) {
        const clientsPath = path_1.default.join(sysfile_1.SYS_FILE.root);
        const clients = fs_1.default.readdirSync(clientsPath);
        clients.forEach(client => {
            if (context.client)
                return;
            const clientPath = path_1.default.join(clientsPath, client);
            const stats = fs_1.default.statSync(clientPath);
            if (stats.isDirectory()) {
                const projectJsonPath = path_1.default.join(clientPath, sysfile_1.SYS_FILE.projects);
                if (!fs_1.default.existsSync(projectJsonPath))
                    return;
                const projects = (0, util_1.readJson)(projectJsonPath) || [];
                if (projects.find((p) => p.id === context.project)) {
                    context.client = client;
                }
            }
        });
    }
    (0, util_1.writeJson)(sysfile_1.SYS_FILE.context, context);
    return context;
}
function getContext() {
    try {
        if (!fs_1.default.existsSync(sysfile_1.SYS_FILE.context))
            throw new Error(`Couldn't find ${sysfile_1.SYS_FILE.context} in root directory`);
        const context = (0, util_1.readJson)(sysfile_1.SYS_FILE.context) || {};
        return context;
    }
    catch (err) {
        throw new Error(`Failed to load context: ${err.message}`);
    }
}
