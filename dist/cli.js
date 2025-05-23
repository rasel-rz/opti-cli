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
const select_1 = __importStar(require("@inquirer/select"));
const sysfile_1 = require("./lib/sysfile");
const esbuild_1 = require("esbuild");
const open_1 = __importDefault(require("open"));
const log_1 = require("./lib/log");
dotenv.config();
;
;
const program = new commander_1.Command();
program.name('optly').version('0.1.0');
program
    .command('use')
    .argument('<link>', 'Project/Experiment Link')
    .description('Set the current working experiment/project')
    .action((link) => {
    const context = (0, context_1.setContext)(link);
    fs_1.default.writeFileSync(sysfile_1.SYS_FILE.variationPath, '');
    log_1.log.success(`Context set to: ${JSON.stringify(context)}`);
});
program
    .command("init")
    .argument('<client>', 'Client folder name with Personal Access Token (.pat)')
    .description("Pulls the projects of a client into local directory and updates projects.json")
    .action((client) => {
    const clientPath = path_1.default.join(sysfile_1.SYS_FILE.root, client);
    const token = (0, util_1.readText)(path_1.default.join(clientPath, sysfile_1.SYS_FILE.PAT));
    if (!token)
        return (0, util_1.missingToken)();
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
        (0, util_1.writeJson)(path_1.default.join(clientPath, sysfile_1.SYS_FILE.projects), projectConfig);
        projectConfig.forEach((p) => {
            const projectPath = path_1.default.join(clientPath, p.dirName);
            if (fs_1.default.existsSync(projectPath))
                return;
            fs_1.default.mkdirSync(projectPath);
            (0, util_1.writeJson)(path_1.default.join(projectPath, sysfile_1.SYS_FILE.experiments), []);
            log_1.log.warning(`Missing project dir created @${projectPath.toString()}`);
        });
        log_1.log.success(`Successfully initialized client **@${client}**`);
    });
});
program
    .command('pull')
    .description('Pull the current experiment to local machine')
    .action(() => {
    var _a;
    const { client, project, experiment, variation, extension } = (0, context_1.getContext)();
    if (!client || !project)
        return log_1.log.error("Missing context. Try npx optly use <experiment/variation link>");
    const clientPath = path_1.default.join(sysfile_1.SYS_FILE.root, client);
    const projects = (0, util_1.readJson)(path_1.default.join(clientPath, sysfile_1.SYS_FILE.projects)) || [];
    const projectDir = (_a = projects.find((p) => p.id === project)) === null || _a === void 0 ? void 0 : _a.dirName;
    if (!projectDir)
        return log_1.log.error("Can't find project local directory. Try npx optly init <client-directory>");
    const projectPath = path_1.default.join(clientPath, projectDir);
    const localExperiments = [];
    try {
        localExperiments.push(...(0, util_1.readJson)(path_1.default.join(projectPath, sysfile_1.SYS_FILE.experiments)));
    }
    catch (e) { }
    const token = (0, util_1.readText)(path_1.default.join(clientPath, sysfile_1.SYS_FILE.PAT));
    if (!token)
        return (0, util_1.missingToken)();
    const api = (0, api_1.getApiClient)(token);
    if (!experiment && extension)
        return (0, util_1.pullExtension)(api, projectPath, extension, localExperiments);
    if (!experiment)
        return log_1.log.error("Missing context. Try npx optly use <experiment/variation link>");
    api.get(`/experiments/${experiment}`).then(res => {
        if (!res)
            return;
        if (res.data.type != 'a/b' && res.data.type != 'multiarmed_bandit')
            return log_1.log.error(`Test type: ${res.data.type} is not supported!`);
        const xpDirName = (0, util_1.sanitizeDirName)(res.data.name);
        let experimentEntry = localExperiments.find((xp) => xp.id === experiment) ||
            { name: res.data.name, dirName: xpDirName, id: experiment, variations: [], toPush: true };
        ;
        // if (experimentEntryIndex >= 0) { localExperiments.splice(experimentEntryIndex, 1); }
        const experimentPath = path_1.default.join(projectPath, experimentEntry.dirName);
        if (experimentEntry.dirName !== xpDirName)
            log_1.log.warning(`Experiment name changed. Local directory is **@${experimentEntry.dirName}**`);
        if (!fs_1.default.existsSync(experimentPath))
            fs_1.default.mkdirSync(experimentPath);
        (0, util_1.writeJson)(path_1.default.join(experimentPath, sysfile_1.SYS_FILE.experiment), res.data);
        let matchedVariationName = [];
        if (variation && !res.data.variations.find((_v) => variation === _v.variation_id))
            return log_1.log.error(`Can't find a variation with ID ${variation}`);
        res.data.variations.forEach((_variation) => {
            const vDirName = (0, util_1.sanitizeDirName)(_variation.name);
            const variationEntry = experimentEntry.variations.find((x) => x.id === _variation.variation_id) ||
                { name: _variation.name, dirName: vDirName, id: _variation.variation_id, toPush: true };
            if (vDirName !== variationEntry.dirName)
                log_1.log.warning(`Variation name changed. **${_variation.name}** is locally **@${variationEntry.dirName}**`);
            const variationPath = path_1.default.join(experimentPath, variationEntry.dirName);
            if (!fs_1.default.existsSync(variationPath))
                fs_1.default.mkdirSync(variationPath);
            if (_variation.variation_id === variation)
                fs_1.default.writeFileSync(sysfile_1.SYS_FILE.variationPath, variationPath);
            if (variationEntry.toPush) {
                delete variationEntry.toPush;
                experimentEntry.variations.push(variationEntry);
            }
            if (variation && _variation.variation_id !== variation)
                return;
            matchedVariationName.push(_variation.name);
            let customJS = "", customCSS = "";
            try {
                customJS = _variation.actions[0].changes.find((x) => x.type === 'custom_code').value;
            }
            catch (e) { }
            try {
                customCSS = _variation.actions[0].changes.find((x) => x.type === 'custom_css').value;
            }
            catch (e) { }
            fs_1.default.writeFileSync(path_1.default.join(variationPath, sysfile_1.SYS_FILE.JS), customJS);
            fs_1.default.writeFileSync(path_1.default.join(variationPath, sysfile_1.SYS_FILE.CSS), customCSS);
            if (process.env.DISABLE_TS__SCSS_BUNDLE !== 'true') {
                if (!fs_1.default.existsSync(path_1.default.join(variationPath, sysfile_1.SYS_FILE.TS)))
                    fs_1.default.writeFileSync(path_1.default.join(variationPath, sysfile_1.SYS_FILE.TS), customJS);
                if (!fs_1.default.existsSync(path_1.default.join(variationPath, sysfile_1.SYS_FILE.SCSS)))
                    fs_1.default.writeFileSync(path_1.default.join(variationPath, sysfile_1.SYS_FILE.SCSS), customCSS);
            }
        });
        if (experimentEntry.toPush) {
            delete experimentEntry.toPush;
            localExperiments.push(experimentEntry);
        }
        (0, util_1.writeJson)(path_1.default.join(projectPath, sysfile_1.SYS_FILE.experiments), localExperiments);
        const metricPath = path_1.default.join(experimentPath, sysfile_1.SYS_FILE.metrics);
        if (!fs_1.default.existsSync(metricPath))
            (0, util_1.writeJson)(metricPath, []);
        log_1.log.success(`${res.data.name} -> ${matchedVariationName.join(", ")} pulled!`);
    });
});
program
    .command('push')
    .argument('[action]', "If you want to publish your changes directly.")
    .description('Push the current variation code to Platform')
    .action((action) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { client, project, experiment, variation, extension } = (0, context_1.getContext)();
    if (!client || !project)
        return log_1.log.error("Missing context. Try npx optly use <variation link>");
    const clientPath = path_1.default.join(sysfile_1.SYS_FILE.root, client);
    const projects = (0, util_1.readJson)(path_1.default.join(clientPath, sysfile_1.SYS_FILE.projects)) || [];
    const projectDir = (_a = projects.find((p) => p.id === project)) === null || _a === void 0 ? void 0 : _a.dirName;
    if (!projectDir)
        return log_1.log.error("Can't find project local directory. Try npx optly init <client-directory>");
    const projectPath = path_1.default.join(clientPath, projectDir);
    const token = (0, util_1.readText)(path_1.default.join(clientPath, sysfile_1.SYS_FILE.PAT));
    if (!token)
        return (0, util_1.missingToken)();
    const api = (0, api_1.getApiClient)(token);
    if (!experiment && extension)
        return (0, util_1.pushExtension)(api, projectPath, extension);
    const experiments = (0, util_1.readJson)(path_1.default.join(projectPath, sysfile_1.SYS_FILE.experiments)) || [];
    if (!experiment || !variation)
        return log_1.log.error("Missing context. Try npx optly use <variation link>");
    const experimentJson = experiments.find((xp) => xp.id === experiment);
    if (!experimentJson)
        return log_1.log.error("Can't find experiment. Try running npx optly pull");
    const experimentDir = experimentJson.dirName;
    const experimentPath = path_1.default.join(projectPath, experimentDir);
    const variationJson = experimentJson.variations.find((v) => v.id === variation);
    if (!variationJson)
        return log_1.log.error("Can't find variation. Try running npx optly pull");
    const variationDir = variationJson.dirName;
    const variationPath = path_1.default.join(experimentPath, variationDir);
    const customJS = (0, util_1.readText)(path_1.default.join(variationPath, sysfile_1.SYS_FILE.JS));
    const customCSS = (0, util_1.readText)(path_1.default.join(variationPath, sysfile_1.SYS_FILE.CSS));
    const experimentBody = (0, util_1.readJson)(path_1.default.join(experimentPath, sysfile_1.SYS_FILE.experiment));
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
    if (action === 'publish') {
        const isSafeToPublish = yield (0, util_1.checkSafePublishing)(api, experimentBody.audience_conditions);
        if (isSafeToPublish)
            apiUrl += `?action=publish`;
        else
            return log_1.log.error(`Please attach **Optimizely QA Cookie** as Audience and try again.`);
    }
    api.patch(apiUrl, experimentBody).then(res => {
        if (!res)
            return;
        (0, util_1.writeJson)(path_1.default.join(experimentPath, sysfile_1.SYS_FILE.experiment), res.data);
        log_1.log.success(`${experimentJson.name} -> ${variationBody.name} ${action === 'publish' ? '**published**' : 'updated'} successfully!`);
        if (process.env.DISABLE_PREVIEW_ON_PUSH !== 'true') {
            try {
                const updatedVariation = res.data.variations.find((v) => v.variation_id === variation);
                log_1.log.info("Opening preview link in browser...");
                (new Promise(resolve => setTimeout(resolve, 3000))).then(() => {
                    (0, open_1.default)(updatedVariation.actions[0].share_link);
                });
            }
            catch (e) {
                log_1.log.error("Error opening preview link. Please try manually.");
            }
        }
    });
}));
program
    .command("dev")
    .argument('[action]', "To bundle the code (TS/SCSS) without running dev server")
    .description("Run the recently pulled variation in a local server")
    .action((action) => __awaiter(void 0, void 0, void 0, function* () {
    const devRoot = (0, util_1.readText)(sysfile_1.SYS_FILE.variationPath);
    if (!devRoot)
        return log_1.log.error("Try pulling a variation first by running npx optly pull");
    const { variation, extension } = (0, context_1.getContext)();
    const isExtension = !variation && !!extension;
    const buildDir = path_1.default.join(devRoot, sysfile_1.SYS_FILE.buildDir);
    if (isExtension && !fs_1.default.existsSync(buildDir))
        fs_1.default.mkdirSync(buildDir);
    let jsPath = path_1.default.join(devRoot, sysfile_1.SYS_FILE.JS);
    let jsOutPath = path_1.default.join(devRoot, sysfile_1.SYS_FILE.JS);
    let cssPath = path_1.default.join(devRoot, sysfile_1.SYS_FILE.CSS);
    let cssOutPath = path_1.default.join(devRoot, sysfile_1.SYS_FILE.CSS);
    if (!fs_1.default.existsSync(jsPath) || !fs_1.default.existsSync(cssPath)) {
        return log_1.log.error("custom.js or custom.css not found in the variation directory");
    }
    if (action === 'bundle') {
        if (process.env.DISABLE_TS__SCSS_BUNDLE === 'true')
            return log_1.log.error("Bundling is disabled. Check **DISABLE_TS__SCSS_BUNDLE** at **.env** file.");
        jsPath = path_1.default.join(devRoot, sysfile_1.SYS_FILE.TS);
        cssPath = path_1.default.join(devRoot, sysfile_1.SYS_FILE.SCSS);
        yield (0, esbuild_1.build)((0, util_1.esbuildConfig)(jsPath, jsOutPath, null));
        yield (0, esbuild_1.build)((0, util_1.esbuildConfig)(cssPath, cssOutPath, null));
        return log_1.log.success(`TS/SCSS bundled **@${devRoot}**`);
    }
    const app = (0, express_1.default)();
    const server = http_1.default.createServer(app);
    const wss = new ws_1.default.Server({ server });
    if (isExtension)
        app.use(express_1.default.static(buildDir));
    else
        app.use(express_1.default.static(devRoot));
    const PORT = 3000;
    if (process.env.DISABLE_TS__SCSS_BUNDLE !== 'true') {
        jsPath = path_1.default.join(devRoot, sysfile_1.SYS_FILE.TS);
        cssPath = path_1.default.join(devRoot, sysfile_1.SYS_FILE.SCSS);
        log_1.log.info("Please modify the **TS/SCSS** files, they will automatically get **bundled/compiled**.");
        try {
            const jsCtx = yield (0, esbuild_1.context)((0, util_1.esbuildConfig)(jsPath, jsOutPath, wss, isExtension, devRoot));
            yield jsCtx.watch();
        }
        catch (error) {
            console.error(`Error bundling TypeScript: ${error.message}`);
        }
        try {
            const cssCtx = yield (0, esbuild_1.context)((0, util_1.esbuildConfig)(cssPath, cssOutPath, wss, isExtension, devRoot));
            yield cssCtx.watch();
        }
        catch (error) {
            console.error(`Error compiling SCSS: ${error.message}`);
        }
    }
    else {
        const watcher = chokidar_1.default.watch([jsPath, cssPath]);
        watcher.on('change', (filePath) => { (0, util_1.triggerReload)(filePath, wss); });
    }
    server.listen(PORT, () => {
        log_1.log.success(`Development server running at **http://localhost:${PORT}**`);
        log_1.log.info(`Dev root pointed **@${devRoot}**`);
        log_1.log.warning(`Hot-reload enabled. Watching for changes in **${sysfile_1.SYS_FILE.JS}** and **${sysfile_1.SYS_FILE.CSS}**`);
    });
}));
program
    .command("metric")
    .description("Try and sync metrics from a list of selector and metric name")
    .action(() => {
    const { client } = (0, context_1.getContext)();
    if (!client)
        return log_1.log.error("Missing context. Try npx optly use <variation link>");
    const clientPath = path_1.default.join(sysfile_1.SYS_FILE.root, client);
    const token = (0, util_1.readText)(path_1.default.join(clientPath, sysfile_1.SYS_FILE.PAT));
    if (!token)
        return (0, util_1.missingToken)();
    const api = (0, api_1.getApiClient)(token);
    function getEvent(eventId) { return api.get(`/events/${eventId}`); }
    function makeEvent(pageId, event) {
        return api.post(`/pages/${pageId}/events`, event);
    }
    const devRoot = (0, util_1.readText)(sysfile_1.SYS_FILE.variationPath);
    if (!devRoot)
        return log_1.log.error("Try pulling a variation first");
    const experimentPath = path_1.default.join(devRoot, '..');
    const metrics = (0, util_1.readJson)(path_1.default.join(experimentPath, sysfile_1.SYS_FILE.metrics)) || [];
    if (!metrics.length)
        return log_1.log.error("No metrics found to be added!");
    const xpJson = (0, util_1.readJson)(path_1.default.join(experimentPath, sysfile_1.SYS_FILE.experiment));
    const alreadyAddedMetrics = xpJson.metrics.map((x) => x.event_id).map(getEvent);
    Promise.all([...alreadyAddedMetrics]).then((res) => {
        const resMetrics = res.map((x) => x.data);
        const metricsToAdd = metrics.filter(x => !resMetrics
            .find((m) => m.config.selector === x.selector && m.name === x.name));
        if (!metricsToAdd.length)
            return log_1.log.warning("All the metrics are added already");
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
            (0, util_1.writeJson)(path_1.default.join(experimentPath, sysfile_1.SYS_FILE.experiment), xpJson);
            log_1.log.success(`${metricsToPushOnXp.length} metric(s) added. Run npx optly push to push the changes.`);
        });
    });
});
program
    .command('variations')
    .description("Change context to a different variation of the same experiemnt")
    .action(() => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { client, project, experiment } = (0, context_1.getContext)();
    if (!client || !project || !experiment)
        return log_1.log.error("Missing context. Try npx optly use <experiment/variation link>");
    const clientPath = path_1.default.join(sysfile_1.SYS_FILE.root, client);
    const projects = (0, util_1.readJson)(path_1.default.join(clientPath, sysfile_1.SYS_FILE.projects)) || [];
    const projectDir = (_a = projects.find((p) => p.id === project)) === null || _a === void 0 ? void 0 : _a.dirName;
    if (!projectDir)
        return log_1.log.error("Can't find project local directory. Try npx optly init <client-directory>");
    const projectPath = path_1.default.join(clientPath, projectDir);
    const experiments = (0, util_1.readJson)(path_1.default.join(projectPath, sysfile_1.SYS_FILE.experiments)) || [];
    const currentExperiment = experiments.find((xp) => xp.id === experiment);
    if (!currentExperiment)
        return log_1.log.error("Can't find experiment records in local repo. Try npx optly pull");
    const availableVariations = (currentExperiment.variations || []).map((v) => {
        return { name: v.name, value: v };
    });
    if (!availableVariations.length)
        return log_1.log.error("Please create variations from optimizely platform.");
    const OPTION__EXIT = {
        name: 'Exit',
        value: '__exit__',
        description: 'Exit select menu'
    };
    const answer = yield (0, select_1.default)({
        message: 'Select a variation',
        choices: [
            ...availableVariations,
            new select_1.Separator(),
            OPTION__EXIT,
        ],
    });
    if (answer === '__exit__')
        return;
    const context = { client: client, project: project, experiment: experiment, variation: answer.id };
    (0, util_1.writeJson)(sysfile_1.SYS_FILE.context, context);
    const variationPath = path_1.default.join(projectPath, currentExperiment.dirName, answer.dirName);
    fs_1.default.writeFileSync(sysfile_1.SYS_FILE.variationPath, variationPath);
}));
program.parse();
