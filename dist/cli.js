#!/usr/bin/env node
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
const commander_1 = require("commander");
const dotenv = __importStar(require("dotenv"));
const context_1 = require("./lib/context");
const api_1 = require("./lib/api");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const util_1 = require("./lib/util");
const express_1 = __importDefault(require("express"));
const chokidar_1 = __importDefault(require("chokidar"));
const http_1 = __importDefault(require("http"));
const ws_1 = __importDefault(require("ws"));
dotenv.config();
const SYS_FILE = {
    projects: "projects.json",
    root: "clients",
    PAT: ".pat",
    experiments: "experiments.json",
    experiment: "experiment.json",
    JS: "custom.js",
    CSS: "custom.css",
    variationPath: ".variation-dir",
    metrics: "metrics.json",
};
;
;
;
const program = new commander_1.Command();
program.name('opti-cli').version('0.1.0');
program
    .command('use')
    .argument('<link>', 'Project/Experiment Link')
    .description('Set the current working experiment/project')
    .action((link) => {
    const context = (0, context_1.setContext)(link);
    console.log(`Context set to: ${JSON.stringify(context)}`);
});
program
    .command("init")
    .argument('<client>', 'Client folder name with Personal Access Token (.pat)')
    .description("Pulls the projects of a client into local directory and updates projects.json")
    .action((client) => {
    const clientPath = path_1.default.join(SYS_FILE.root, client);
    const tokenPath = path_1.default.join(clientPath, SYS_FILE.PAT);
    if (!fs_1.default.existsSync(tokenPath))
        return console.log("Client directory/PAT not found!");
    const token = fs_1.default.readFileSync(tokenPath, 'utf-8');
    const api = (0, api_1.getApiClient)(token);
    api.get('/projects').then(res => {
        if (!res)
            return;
        const projectConfig = res.data
            .filter((p) => p.platform === 'web' && p.status === 'active')
            .map((project) => {
            return {
                name: project.name,
                id: project.id,
                dirName: (0, util_1.sanitizeDirName)(project.name)
            };
        });
        fs_1.default.writeFileSync(path_1.default.join(clientPath, SYS_FILE.projects), JSON.stringify(projectConfig, null, 2));
        projectConfig.forEach((p) => {
            const projectPath = path_1.default.join(clientPath, p.dirName);
            if (fs_1.default.existsSync(projectPath))
                return;
            fs_1.default.mkdirSync(projectPath);
            fs_1.default.writeFileSync(path_1.default.join(projectPath, SYS_FILE.experiments), JSON.stringify([], null, 2));
            console.log(`Missing project dir created @${projectPath.toString()}`);
        });
    });
});
program
    .command('pull')
    .description('Pull the current experiment to local machine')
    .action(() => {
    var _a;
    const { client, project, experiment } = (0, context_1.getContext)();
    if (!client || !project || !experiment)
        return console.log("Missing context. Try npx optly use <experiment/variation link>");
    const clientPath = path_1.default.join(SYS_FILE.root, client);
    const projects = JSON.parse(fs_1.default.readFileSync(path_1.default.join(clientPath, SYS_FILE.projects), 'utf-8'));
    const projectDir = (_a = projects.find((p) => p.id === project)) === null || _a === void 0 ? void 0 : _a.dirName;
    if (!projectDir)
        return console.log("Can't find project local directory. Try npx optly init <client-directory>");
    const projectPath = path_1.default.join(clientPath, projectDir);
    const tokenPath = path_1.default.join(clientPath, SYS_FILE.PAT);
    if (!fs_1.default.existsSync(tokenPath))
        return console.log("Client directory/PAT not found!");
    const token = fs_1.default.readFileSync(tokenPath, 'utf-8');
    const api = (0, api_1.getApiClient)(token);
    api.get(`/experiments/${experiment}`).then(res => {
        if (!res)
            return;
        if (res.data.type != 'a/b')
            return console.log("Only A/B Tests are supported here for now!");
        const experimentDir = (0, util_1.sanitizeDirName)(res.data.name);
        const experimentPath = path_1.default.join(projectPath, experimentDir);
        if (!fs_1.default.existsSync(experimentPath))
            fs_1.default.mkdirSync(experimentPath);
        const localExperiments = [];
        try {
            localExperiments.push(...JSON.parse(fs_1.default.readFileSync(path_1.default.join(projectPath, SYS_FILE.experiments), 'utf-8')));
        }
        catch (e) { }
        const experimentEntryIndex = localExperiments.findIndex((xp) => xp.id === experiment);
        if (experimentEntryIndex >= 0) {
            localExperiments.splice(experimentEntryIndex, 1);
        }
        const experimentEntry = { name: res.data.name, dirName: experimentDir, id: experiment, variations: [] };
        fs_1.default.writeFileSync(path_1.default.join(experimentPath, SYS_FILE.experiment), JSON.stringify(res.data, null, 2));
        res.data.variations.forEach((variation) => {
            const variationDir = (0, util_1.sanitizeDirName)(variation.name);
            const variationPath = path_1.default.join(experimentPath, variationDir);
            if (!fs_1.default.existsSync(variationPath))
                fs_1.default.mkdirSync(variationPath);
            fs_1.default.writeFileSync(SYS_FILE.variationPath, variationPath);
            let customJS = "", customCSS = "";
            try {
                customJS = variation.actions[0].changes.find((x) => x.type === 'custom_code').value;
                customCSS = variation.actions[0].changes.find((x) => x.type === 'custom_css').value;
            }
            catch (e) { }
            fs_1.default.writeFileSync(path_1.default.join(variationPath, SYS_FILE.JS), customJS);
            fs_1.default.writeFileSync(path_1.default.join(variationPath, SYS_FILE.CSS), customCSS);
            experimentEntry.variations.push({ name: variation.name, dirName: variationDir, id: variation.variation_id });
        });
        localExperiments.push(experimentEntry);
        fs_1.default.writeFileSync(path_1.default.join(projectPath, SYS_FILE.experiments), JSON.stringify(localExperiments, null, 2));
        const metricPath = path_1.default.join(experimentPath, SYS_FILE.metrics);
        if (!fs_1.default.existsSync(metricPath))
            fs_1.default.writeFileSync(metricPath, JSON.stringify([], null, 2));
        console.log(`${res.data.name} pulled!`);
    });
});
program
    .command('push')
    .argument('[action]', "If you want to publish your changes directly.")
    .description('Push the current variation code to Platform')
    .action((action) => {
    var _a;
    const { client, project, experiment, variation } = (0, context_1.getContext)();
    if (!client || !project || !experiment || !variation)
        return console.log("Missing context. Try npx optly use <variation link>");
    const clientPath = path_1.default.join(SYS_FILE.root, client);
    const projects = JSON.parse(fs_1.default.readFileSync(path_1.default.join(clientPath, SYS_FILE.projects), 'utf-8'));
    const projectDir = (_a = projects.find((p) => p.id === project)) === null || _a === void 0 ? void 0 : _a.dirName;
    if (!projectDir)
        return console.log("Can't find project local directory. Try npx optly init <client-directory>");
    const projectPath = path_1.default.join(clientPath, projectDir);
    const tokenPath = path_1.default.join(clientPath, SYS_FILE.PAT);
    if (!fs_1.default.existsSync(tokenPath))
        return console.log("Client directory/PAT not found!");
    const token = fs_1.default.readFileSync(tokenPath, 'utf-8');
    const api = (0, api_1.getApiClient)(token);
    const experiments = JSON.parse(fs_1.default.readFileSync(path_1.default.join(projectPath, SYS_FILE.experiments), 'utf-8'));
    const experimentJson = experiments.find((xp) => xp.id === experiment);
    if (!experimentJson)
        return console.log("Can't find experiment. Try running npx optly pull");
    const experimentDir = experimentJson.dirName;
    const experimentPath = path_1.default.join(projectPath, experimentDir);
    const variationJson = experimentJson.variations.find((v) => v.id === variation);
    if (!variationJson)
        return console.log("Can't find variation. Try running npx optly pull");
    const variationDir = variationJson.dirName;
    const variationPath = path_1.default.join(experimentPath, variationDir);
    const customJS = fs_1.default.readFileSync(path_1.default.join(variationPath, SYS_FILE.JS), 'utf-8');
    const customCSS = fs_1.default.readFileSync(path_1.default.join(variationPath, SYS_FILE.CSS), 'utf-8');
    const experimentBody = JSON.parse(fs_1.default.readFileSync(path_1.default.join(experimentPath, SYS_FILE.experiment), 'utf-8'));
    const variationBody = experimentBody.variations.find((v) => v.variation_id === variation);
    variationBody.actions[0].changes.forEach((change) => {
        if (change.type === 'custom_code')
            change.value = customJS;
        if (change.type === 'custom_css')
            change.value = customCSS;
    });
    let apiUrl = `/experiments/${experiment}`;
    if (action === 'publish')
        apiUrl += `?action=publish`;
    api.patch(apiUrl, experimentBody).then(res => {
        if (!res)
            return;
        fs_1.default.writeFileSync(path_1.default.join(experimentPath, SYS_FILE.experiment), JSON.stringify(res.data, null, 2));
        console.log(`${experimentJson.name} updated successfully!`);
    });
});
program
    .command("dev")
    .description("Run the recently pulled variation in a local server")
    .action(() => {
    if (!fs_1.default.existsSync(SYS_FILE.variationPath))
        return console.log("Try pulling a variation first");
    const devRoot = fs_1.default.readFileSync(SYS_FILE.variationPath, 'utf-8');
    const jsPath = path_1.default.join(devRoot, SYS_FILE.JS);
    const cssPath = path_1.default.join(devRoot, SYS_FILE.CSS);
    if (!fs_1.default.existsSync(jsPath) || !fs_1.default.existsSync(cssPath)) {
        return console.log("custom.js or custom.css not found in the variation directory");
    }
    const app = (0, express_1.default)();
    const server = http_1.default.createServer(app);
    const wss = new ws_1.default.Server({ server });
    app.use(express_1.default.static(devRoot));
    const PORT = 3000;
    app.get('/hot-reload.js', (req, res) => {
        res.setHeader('Content-Type', 'application/javascript');
        res.send(`
                const ws = new WebSocket('ws://localhost:${PORT}');
                ws.onmessage = () => location.reload();
            `);
    });
    const watcher = chokidar_1.default.watch([jsPath, cssPath]);
    watcher.on('change', (filePath) => {
        console.log(`${filePath} changed. Reloading...`);
        wss.clients.forEach(client => {
            if (client.readyState === ws_1.default.OPEN) {
                client.send('reload');
            }
        });
    });
    server.listen(PORT, () => {
        console.log(`Development server running at http://localhost:${PORT}`);
        console.log(`Hot-reload enabled. Watching for changes in ${SYS_FILE.JS} and ${SYS_FILE.CSS}`);
    });
});
program
    .command("metric")
    .description("Try and sync metrics from a list of selector and metric name")
    .action(() => {
    const { client, project } = (0, context_1.getContext)();
    if (!client)
        return console.log("Missing context. Try npx optly use <variation link>");
    const clientPath = path_1.default.join(SYS_FILE.root, client);
    const tokenPath = path_1.default.join(clientPath, SYS_FILE.PAT);
    if (!fs_1.default.existsSync(tokenPath))
        return console.log("Client directory/PAT not found!");
    const token = fs_1.default.readFileSync(tokenPath, 'utf-8');
    const api = (0, api_1.getApiClient)(token);
    function getEvent(eventId) { return api.get(`/events/${eventId}`); }
    function makeEvent(pageId, event) {
        return api.post(`/pages/${pageId}/events`, event);
    }
    if (!fs_1.default.existsSync(SYS_FILE.variationPath))
        return console.log("Try pulling a variation first");
    const devRoot = fs_1.default.readFileSync(SYS_FILE.variationPath, 'utf-8');
    const experimentPath = path_1.default.join(devRoot, '..');
    const metricsPath = path_1.default.join(experimentPath, SYS_FILE.metrics);
    if (!fs_1.default.existsSync(metricsPath))
        return console.log(`Try defining a metrics.json in experiment dir.`);
    const metrics = JSON.parse(fs_1.default.readFileSync(metricsPath, 'utf-8'));
    if (!metrics.length)
        return console.log("No metrics found to be added!");
    const xpJson = JSON.parse(fs_1.default.readFileSync(path_1.default.join(experimentPath, SYS_FILE.experiment), 'utf-8'));
    const alreadyAddedMetrics = xpJson.metrics.map((x) => x.event_id).map(getEvent);
    Promise.all([...alreadyAddedMetrics]).then((res) => {
        const resMetrics = res.map((x) => x.data);
        const metricsToAdd = metrics.filter(x => !resMetrics
            .find((m) => m.config.selector === x.selector && m.name === x.name));
        if (!metricsToAdd.length)
            return console.log("All the metrics are added already");
        Promise.allSettled([...metricsToAdd.map(e => makeEvent(xpJson.page_ids[0], {
                name: e.name, config: { selector: e.selector }, event_type: 'click'
            }))]).then(res => {
            const resEvents = res.map((x) => {
                if (x.status === 'fulfilled')
                    return x.value.data;
                return { id: (x.reason.toString().match(/(\d+)/) || [null, null])[1] };
            });
            const metricsToPushOnXp = resEvents.map((e) => {
                if (!e || !e.id)
                    return null;
                return { event_id: Number(e.id), winning_direction: 'increasing', aggregator: 'unique', scope: 'visitor' };
            }).filter(x => x);
            xpJson.metrics.push(...metricsToPushOnXp);
            fs_1.default.writeFileSync(path_1.default.join(experimentPath, SYS_FILE.experiment), JSON.stringify(xpJson, null, 2));
            console.log(`${metricsToPushOnXp.length} metric(s) added. Run npx optly push to push the changes.`);
        });
    });
});
program.parse();
