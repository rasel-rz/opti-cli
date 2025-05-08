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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
// import open from 'open';
const esbuild_1 = require("esbuild");
const esbuild_sass_plugin_1 = require("esbuild-sass-plugin");
dotenv.config();
const SYS_FILE = {
    projects: "projects.json",
    root: "clients",
    PAT: ".pat",
    experiments: "experiments.json",
    experiment: "experiment.json",
    JS: "custom.js",
    CSS: "custom.css",
    TS: 'index.ts',
    SCSS: 'index.scss',
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
    fs_1.default.writeFileSync(SYS_FILE.variationPath, '');
    console.log(`Context set to: ${JSON.stringify(context)}`);
});
program
    .command("init")
    .argument('<client>', 'Client folder name with Personal Access Token (.pat)')
    .description("Pulls the projects of a client into local directory and updates projects.json")
    .action((client) => {
    const clientPath = path_1.default.join(SYS_FILE.root, client);
    const token = (0, util_1.readText)(path_1.default.join(clientPath, SYS_FILE.PAT));
    if (!token)
        return;
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
        (0, util_1.writeJson)(path_1.default.join(clientPath, SYS_FILE.projects), projectConfig);
        projectConfig.forEach((p) => {
            const projectPath = path_1.default.join(clientPath, p.dirName);
            if (fs_1.default.existsSync(projectPath))
                return;
            fs_1.default.mkdirSync(projectPath);
            (0, util_1.writeJson)(path_1.default.join(projectPath, SYS_FILE.experiments), []);
            console.log(`Missing project dir created @${projectPath.toString()}`);
        });
    });
});
program
    .command('pull')
    .description('Pull the current experiment to local machine')
    .action(() => {
    var _a;
    const { client, project, experiment, variation } = (0, context_1.getContext)();
    if (!client || !project || !experiment)
        return console.log("Missing context. Try npx optly use <experiment/variation link>");
    const clientPath = path_1.default.join(SYS_FILE.root, client);
    const projects = (0, util_1.readJson)(path_1.default.join(clientPath, SYS_FILE.projects)) || [];
    const projectDir = (_a = projects.find((p) => p.id === project)) === null || _a === void 0 ? void 0 : _a.dirName;
    if (!projectDir)
        return console.log("Can't find project local directory. Try npx optly init <client-directory>");
    const projectPath = path_1.default.join(clientPath, projectDir);
    const token = (0, util_1.readText)(path_1.default.join(clientPath, SYS_FILE.PAT));
    if (!token)
        return;
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
            localExperiments.push(...(0, util_1.readJson)(path_1.default.join(projectPath, SYS_FILE.experiments)));
        }
        catch (e) { }
        const experimentEntryIndex = localExperiments.findIndex((xp) => xp.id === experiment);
        if (experimentEntryIndex >= 0) {
            localExperiments.splice(experimentEntryIndex, 1);
        }
        const experimentEntry = { name: res.data.name, dirName: experimentDir, id: experiment, variations: [] };
        (0, util_1.writeJson)(path_1.default.join(experimentPath, SYS_FILE.experiment), res.data);
        res.data.variations.forEach((_variation) => {
            const variationDir = (0, util_1.sanitizeDirName)(_variation.name);
            const variationPath = path_1.default.join(experimentPath, variationDir);
            if (!fs_1.default.existsSync(variationPath))
                fs_1.default.mkdirSync(variationPath);
            if (_variation.variation_id === variation)
                fs_1.default.writeFileSync(SYS_FILE.variationPath, variationPath);
            let customJS = "", customCSS = "";
            try {
                customJS = _variation.actions[0].changes.find((x) => x.type === 'custom_code').value;
            }
            catch (e) { }
            try {
                customCSS = _variation.actions[0].changes.find((x) => x.type === 'custom_css').value;
            }
            catch (e) { }
            fs_1.default.writeFileSync(path_1.default.join(variationPath, SYS_FILE.JS), customJS);
            fs_1.default.writeFileSync(path_1.default.join(variationPath, SYS_FILE.CSS), customCSS);
            if (process.env.DISABLE_TS__SCSS_BUNDLE !== 'true') {
                if (!fs_1.default.existsSync(path_1.default.join(variationPath, SYS_FILE.TS)))
                    fs_1.default.writeFileSync(path_1.default.join(variationPath, SYS_FILE.TS), customJS);
                if (!fs_1.default.existsSync(path_1.default.join(variationPath, SYS_FILE.SCSS)))
                    fs_1.default.writeFileSync(path_1.default.join(variationPath, SYS_FILE.SCSS), customCSS);
            }
            experimentEntry.variations.push({ name: _variation.name, dirName: variationDir, id: _variation.variation_id });
        });
        localExperiments.push(experimentEntry);
        (0, util_1.writeJson)(path_1.default.join(projectPath, SYS_FILE.experiments), localExperiments);
        const metricPath = path_1.default.join(experimentPath, SYS_FILE.metrics);
        if (!fs_1.default.existsSync(metricPath))
            (0, util_1.writeJson)(metricPath, []);
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
    const projects = (0, util_1.readJson)(path_1.default.join(clientPath, SYS_FILE.projects)) || [];
    const projectDir = (_a = projects.find((p) => p.id === project)) === null || _a === void 0 ? void 0 : _a.dirName;
    if (!projectDir)
        return console.log("Can't find project local directory. Try npx optly init <client-directory>");
    const projectPath = path_1.default.join(clientPath, projectDir);
    const token = (0, util_1.readText)(path_1.default.join(clientPath, SYS_FILE.PAT));
    if (!token)
        return;
    const api = (0, api_1.getApiClient)(token);
    const experiments = (0, util_1.readJson)(path_1.default.join(projectPath, SYS_FILE.experiments)) || [];
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
    const customJS = (0, util_1.readText)(path_1.default.join(variationPath, SYS_FILE.JS));
    const customCSS = (0, util_1.readText)(path_1.default.join(variationPath, SYS_FILE.CSS));
    const experimentBody = (0, util_1.readJson)(path_1.default.join(experimentPath, SYS_FILE.experiment));
    const variationBody = experimentBody.variations.find((v) => v.variation_id === variation);
    const targetPageId = experimentBody.page_ids && experimentBody.page_ids[0] || experimentBody.url_targeting.page_id;
    if (customJS) {
        try {
            variationBody.actions[0].changes.find((change) => {
                return change.type === 'custom_code';
            }).value = customJS;
            ;
        }
        catch (e) {
            const change = { "async": false, "dependencies": [], "type": "custom_code", "value": customJS };
            if (variationBody.actions && variationBody.actions.length) {
                if (!variationBody.actions[0].changes)
                    variationBody.actions[0].changes = [];
                variationBody.actions[0].changes.push(change);
            }
            else {
                if (!variationBody.actions)
                    variationBody.actions = [];
                variationBody.actions.push({
                    changes: [change],
                    page_id: targetPageId
                });
            }
        }
    }
    if (customCSS) {
        try {
            variationBody.actions[0].changes.find((change) => {
                return change.type === 'custom_css';
            }).value = customCSS;
        }
        catch (e) {
            const change = {
                "async": false, "dependencies": [], "selector": "head",
                "type": "custom_css", "value": customCSS
            };
            if (variationBody.actions && variationBody.actions.length) {
                if (!variationBody.actions[0].changes)
                    variationBody.actions[0].changes = [];
                variationBody.actions[0].changes.push(change);
            }
            else {
                if (!variationBody.actions)
                    variationBody.actions = [];
                variationBody.actions.push({
                    changes: [change],
                    page_id: targetPageId
                });
            }
        }
    }
    let apiUrl = `/experiments/${experiment}`;
    if (action === 'publish')
        apiUrl += `?action=publish`;
    api.patch(apiUrl, experimentBody).then(res => {
        if (!res)
            return;
        (0, util_1.writeJson)(path_1.default.join(experimentPath, SYS_FILE.experiment), res.data);
        console.log(`${experimentJson.name} updated successfully!`);
        if (process.env.DISABLE_PREVIEW_ON_PUSH !== 'true') {
            try {
                const updatedVariation = res.data.variations.find((v) => v.variation_id === variation);
                // open(updatedVariation.actions[0].share_link);
                console.log("CTRL/CMD + Click -> ", updatedVariation.actions[0].share_link);
            }
            catch (e) {
                console.log("Error opening preview link. Please try manually.");
            }
        }
    });
});
program
    .command("dev")
    .description("Run the recently pulled variation in a local server")
    .action((type) => __awaiter(void 0, void 0, void 0, function* () {
    const devRoot = (0, util_1.readText)(SYS_FILE.variationPath);
    if (!devRoot)
        return console.log("Try pulling a variation first");
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
    if (process.env.DISABLE_TS__SCSS_BUNDLE !== 'true') {
        const tsPath = path_1.default.join(devRoot, SYS_FILE.TS);
        const scssPath = path_1.default.join(devRoot, SYS_FILE.SCSS);
        const bundleWatcher = chokidar_1.default.watch([tsPath, scssPath]);
        function bundleJS() {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    yield (0, esbuild_1.build)({
                        entryPoints: [tsPath],
                        outfile: jsPath,
                        bundle: true,
                        platform: 'browser',
                        target: ['es2015'],
                        format: 'esm'
                    });
                    console.log(`Bundled ${SYS_FILE.TS} to ${SYS_FILE.JS}`);
                }
                catch (error) {
                    console.error(`Error bundling TypeScript: ${error.message}`);
                }
            });
        }
        function bundleCss() {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    yield (0, esbuild_1.build)({
                        entryPoints: [scssPath],
                        outfile: cssPath,
                        bundle: true,
                        plugins: [(0, esbuild_sass_plugin_1.sassPlugin)()],
                    });
                    console.log(`Compiled ${SYS_FILE.SCSS} to ${SYS_FILE.CSS}`);
                }
                catch (error) {
                    console.error(`Error compiling SCSS: ${error.message}`);
                }
            });
        }
        yield bundleCss();
        yield bundleJS();
        bundleWatcher.on('change', (filePath) => __awaiter(void 0, void 0, void 0, function* () {
            console.log(`${filePath} changed. Processing...`);
            if (filePath.endsWith(SYS_FILE.TS))
                yield bundleJS();
            if (filePath.endsWith(SYS_FILE.SCSS))
                yield bundleCss();
        }));
        console.log("Please modify the TS/SCSS files, they will automatically get bundled/compiled.");
    }
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
}));
program
    .command("metric")
    .description("Try and sync metrics from a list of selector and metric name")
    .action(() => {
    const { client } = (0, context_1.getContext)();
    if (!client)
        return console.log("Missing context. Try npx optly use <variation link>");
    const clientPath = path_1.default.join(SYS_FILE.root, client);
    const token = (0, util_1.readText)(path_1.default.join(clientPath, SYS_FILE.PAT));
    if (!token)
        return;
    const api = (0, api_1.getApiClient)(token);
    function getEvent(eventId) { return api.get(`/events/${eventId}`); }
    function makeEvent(pageId, event) {
        return api.post(`/pages/${pageId}/events`, event);
    }
    const devRoot = (0, util_1.readText)(SYS_FILE.variationPath);
    if (!devRoot)
        return console.log("Try pulling a variation first");
    const experimentPath = path_1.default.join(devRoot, '..');
    const metrics = (0, util_1.readJson)(path_1.default.join(experimentPath, SYS_FILE.metrics)) || [];
    if (!metrics.length)
        return console.log("No metrics found to be added!");
    const xpJson = (0, util_1.readJson)(path_1.default.join(experimentPath, SYS_FILE.experiment));
    const alreadyAddedMetrics = xpJson.metrics.map((x) => x.event_id).map(getEvent);
    Promise.all([...alreadyAddedMetrics]).then((res) => {
        const resMetrics = res.map((x) => x.data);
        const metricsToAdd = metrics.filter(x => !resMetrics
            .find((m) => m.config.selector === x.selector && m.name === x.name));
        if (!metricsToAdd.length)
            return console.log("All the metrics are added already");
        const targetPageId = xpJson.page_ids && xpJson.page_ids[0] || xpJson.url_targeting.page_id;
        Promise.allSettled([...metricsToAdd.map(e => makeEvent(targetPageId, {
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
            (0, util_1.writeJson)(path_1.default.join(experimentPath, SYS_FILE.experiment), xpJson);
            console.log(`${metricsToPushOnXp.length} metric(s) added. Run npx optly push to push the changes.`);
        });
    });
});
program.parse();
