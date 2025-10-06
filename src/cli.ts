#!/usr/bin/env node

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { setContext, getContext, IContext } from './lib/context';
import { getApiClient } from './lib/api';
import fs from 'fs';
import path from 'path';
import { sanitizeDirName, readJson, readText, writeJson, esbuildConfig, triggerReload, missingToken, checkSafePublishing, pullExtension, pushExtension, getPageName } from './lib/util';
import express from 'express';
import chokidar from 'chokidar';
import http from 'http';
import WebSocket from 'ws';
import select, { Separator } from '@inquirer/select';
import { SYS_FILE } from './lib/sysfile';
import { context, build } from 'esbuild';
import open from 'open';
import { log } from './lib/log';

dotenv.config();

interface Metric { selector: string, name: string };
// interface OptMetric { aggregator: 'unique', event_id: number, scope: 'visitor', winning_direction: 'increasing' };
interface OptEvent { name: string, id?: number, event_type: 'click', config: { selector: string }, page_id?: number };

const program = new Command();

program.name('optly').version('0.1.0');

async function use(link: string, devMode: string = '') {
    const context = setContext(link);
    fs.writeFileSync(SYS_FILE.variationPath, '');
    log.success(`Context set to: ${JSON.stringify(context)}`);
    await pull();
    if (!context.variation) await variations();
    if (!devMode) return;
    await dev(devMode);
}

async function pull() {
    const { client, project, experiment, variation, extension } = getContext();
    if (!client || !project) return log.error("Missing context. Try npx optly use <experiment/variation link>");
    const clientPath = path.join(SYS_FILE.root, client);
    const projects = readJson(path.join(clientPath, SYS_FILE.projects)) || [];
    const projectDir = projects.find((p: any) => p.id === project)?.dirName;
    if (!projectDir) return log.error("Can't find project local directory. Try npx optly init <client-directory>");
    const projectPath = path.join(clientPath, projectDir);

    const localExperiments: any[] = [];
    try {
        localExperiments.push(...readJson(path.join(projectPath, SYS_FILE.experiments)));
    } catch (e) { }

    const token = readText(path.join(clientPath, SYS_FILE.PAT));
    if (!token) return missingToken();
    const api = getApiClient(token);
    if (!experiment && extension) return pullExtension(api, projectPath, extension, localExperiments);
    if (!experiment) return log.error("Missing context. Try npx optly use <experiment/variation link>");
    await api.get(`/experiments/${experiment}`).then(async res => {
        if (!res) return;
        if (res.data.type != 'a/b' && res.data.type != 'multiarmed_bandit') return log.error(`Test type: ${res.data.type} is not supported!`);
        const xpDirName = sanitizeDirName(res.data.name);
        let experimentEntry = localExperiments.find((xp: any) => xp.id === experiment) ||
            { name: res.data.name, dirName: xpDirName, id: experiment, variations: [], toPush: true };
        // if (experimentEntryIndex >= 0) { localExperiments.splice(experimentEntryIndex, 1); }
        const experimentPath = path.join(projectPath, experimentEntry.dirName);
        if (experimentEntry.dirName !== xpDirName) log.warning(`Experiment name changed. Local directory is **@${experimentEntry.dirName}**`);
        if (!fs.existsSync(experimentPath)) fs.mkdirSync(experimentPath);
        writeJson(path.join(experimentPath, SYS_FILE.experiment), res.data);

        const hasPagesImplemented = res.data.page_ids && res.data.page_ids.length >= 1;
        // if (isMultipageXp) return log.error(`Multi-page experiments are not supported yet!`);

        const pages = hasPagesImplemented ? res.data.page_ids : [res.data.url_targeting.page_id];

        let matchedVariationName: string[] = [];
        if (variation && !res.data.variations.find((_v: any) => variation === _v.variation_id)) return log.error(`Can't find a variation with ID ${variation}`);
        // res.data.variations.forEach((_variation: any) => {
        for (let vPageId of pages) {
            let [pageName, pageUrl] = await getPageName(api, vPageId || '');
            if (pages.length === 1) pageName = '';
            const pageKey = sanitizeDirName(pageName);
            for (let _variation of res.data.variations) {
                // const vPageId = _variation.actions[0]?.page_id;
                const vDirName = [pageKey, sanitizeDirName(_variation.name)].filter(Boolean).join('--');
                const variationEntry = experimentEntry.variations.find((x: any) => x.id === _variation.variation_id && (pages.length === 1 || x.pageId === vPageId)) ||
                {
                    name: [pageKey, _variation.name].filter(Boolean).join('--'), dirName: vDirName,
                    id: _variation.variation_id, toPush: true, pageId: vPageId, pageKey, pageUrl
                }
                if (!variationEntry.pageId) variationEntry.pageId = vPageId;
                if (!variationEntry.pageKey) variationEntry.pageKey = pageKey;
                if (!variationEntry.pageUrl) variationEntry.pageUrl = pageUrl;

                if (vDirName !== variationEntry.dirName) log.warning(`Variation name changed. **${_variation.name}** is locally **@${variationEntry.dirName}**`)
                const variationPath = path.join(experimentPath, variationEntry.dirName);
                if (!fs.existsSync(variationPath)) fs.mkdirSync(variationPath);
                if (_variation.variation_id === variation) fs.writeFileSync(SYS_FILE.variationPath, variationPath);
                if (variationEntry.toPush) {
                    delete variationEntry.toPush;
                    experimentEntry.variations.push(variationEntry);
                }
                if (variation && _variation.variation_id !== variation) return;
                matchedVariationName.push(_variation.name);
                let customJS = "", customCSS = "";
                try {
                    customJS = _variation.actions.find((a: any) => a.page_id === vPageId).changes.find((x: any) => x.type === 'custom_code').value;
                } catch (e) { }
                try {
                    customCSS = _variation.actions.find((a: any) => a.page_id === vPageId).changes.find((x: any) => x.type === 'custom_css').value;
                } catch (e) { }
                fs.writeFileSync(path.join(variationPath, SYS_FILE.JS), customJS);
                fs.writeFileSync(path.join(variationPath, SYS_FILE.CSS), customCSS);
                if (process.env.DISABLE_TS__SCSS_BUNDLE !== 'true') {
                    if (!fs.existsSync(path.join(variationPath, SYS_FILE.TS)))
                        fs.writeFileSync(path.join(variationPath, SYS_FILE.TS), customJS);
                    if (!fs.existsSync(path.join(variationPath, SYS_FILE.SCSS)))
                        fs.writeFileSync(path.join(variationPath, SYS_FILE.SCSS), customCSS);
                }
            }
        }
        // });
        if (experimentEntry.toPush) {
            delete experimentEntry.toPush;
            localExperiments.push(experimentEntry);
        }
        writeJson(path.join(projectPath, SYS_FILE.experiments), localExperiments);
        const metricPath = path.join(experimentPath, SYS_FILE.metrics);
        if (!fs.existsSync(metricPath)) writeJson(metricPath, []);
        log.success(`${res.data.name} -> ${matchedVariationName.join(", ")} pulled!`);
    });
}

async function dev(action: any) {
    const devRoot = readText(SYS_FILE.variationPath);
    if (!devRoot) return log.error("Try pulling a variation first by running npx optly pull");

    const { variation, extension } = getContext();
    const isExtension = !variation && !!extension;
    const buildDir = path.join(devRoot, SYS_FILE.buildDir);
    if (isExtension && !fs.existsSync(buildDir)) fs.mkdirSync(buildDir);

    let jsPath = path.join(devRoot, SYS_FILE.JS);
    let jsOutPath = path.join(devRoot, SYS_FILE.JS);
    let cssPath = path.join(devRoot, SYS_FILE.CSS);
    let cssOutPath = path.join(devRoot, SYS_FILE.CSS);

    if (!fs.existsSync(jsPath) || !fs.existsSync(cssPath)) {
        return log.error("custom.js or custom.css not found in the variation directory");
    }

    if (action === 'bundle') {
        if (process.env.DISABLE_TS__SCSS_BUNDLE === 'true') return log.error("Bundling is disabled. Check **DISABLE_TS__SCSS_BUNDLE** at **.env** file.");
        jsPath = path.join(devRoot, SYS_FILE.TS);
        cssPath = path.join(devRoot, SYS_FILE.SCSS);
        await build(esbuildConfig(jsPath, jsOutPath, null));
        await build(esbuildConfig(cssPath, cssOutPath, null));
        return log.success(`TS/SCSS bundled **@${devRoot}**`);
    }

    const app = express();
    const server = http.createServer(app);
    const wss = new WebSocket.Server({ server });

    if (isExtension) app.use(express.static(buildDir));
    else app.use(express.static(devRoot));
    const PORT = 3000;

    if (process.env.DISABLE_TS__SCSS_BUNDLE !== 'true') {
        jsPath = path.join(devRoot, SYS_FILE.TS);
        cssPath = path.join(devRoot, SYS_FILE.SCSS);
        log.info("Please modify the **TS/SCSS** files, they will automatically get **bundled/compiled**.");

        try {
            const jsCtx = await context(esbuildConfig(jsPath, jsOutPath, wss, isExtension, devRoot));
            await jsCtx.watch();
        } catch (error: any) {
            console.error(`Error bundling TypeScript: ${error.message}`);
        }

        try {
            const cssCtx = await context(esbuildConfig(cssPath, cssOutPath, wss, isExtension, devRoot));
            await cssCtx.watch();
        } catch (error: any) {
            console.error(`Error compiling SCSS: ${error.message}`);
        }
    } else {
        const watcher = chokidar.watch([jsPath, cssPath]);
        watcher.on('change', (filePath) => { triggerReload(filePath, wss); });
    }

    server.listen(PORT, () => {
        log.success(`Development server running at **http://localhost:${PORT}**`);
        log.info(`Dev root pointed **@${devRoot}**`);
        log.warning(`Hot-reload enabled. Watching for changes in **${SYS_FILE.JS}** and **${SYS_FILE.CSS}**`);
    });
}

async function variations() {
    const { client, project, experiment } = getContext();
    if (!client || !project || !experiment) return log.error("Missing context. Try npx optly use <experiment/variation link>");
    const clientPath = path.join(SYS_FILE.root, client);
    const projects = readJson(path.join(clientPath, SYS_FILE.projects)) || [];
    const projectDir = projects.find((p: any) => p.id === project)?.dirName;
    if (!projectDir) return log.error("Can't find project local directory. Try npx optly init <client-directory>");
    const projectPath = path.join(clientPath, projectDir);
    const experiments = readJson(path.join(projectPath, SYS_FILE.experiments)) || [];
    const currentExperiment = experiments.find((xp: any) => xp.id === experiment);
    if (!currentExperiment) return log.error("Can't find experiment records in local repo. Try npx optly pull");
    const availableVariations = (currentExperiment.variations || []).map((v: any) => {
        return { name: v.name, value: v };
    });
    if (!availableVariations.length) return log.error("Please create variations from optimizely platform.");
    const OPTION__EXIT = {
        name: 'Exit',
        value: '__exit__',
        description: 'Exit select menu'
    };
    const answer: any = await select({
        message: 'Select a variation',
        choices: [
            ...availableVariations,
            new Separator(),
            OPTION__EXIT,
        ],
    });
    if (answer === '__exit__') return;
    const context: IContext = { client: client, project: project, experiment: experiment, variation: answer.id as number, page: answer.pageId as number };
    writeJson(SYS_FILE.context, context);
    const variationPath = path.join(projectPath, currentExperiment.dirName, answer.dirName);
    fs.writeFileSync(SYS_FILE.variationPath, variationPath);

    try {
        log.info(`Preview URL: ${answer.pageUrl}`);
    } catch (e) { }
}

program
    .command('use')
    .argument('<link>', 'Project/Experiment Link')
    .argument('[bundle]', 'Dev server/bundle only')
    .description('Set the current working experiment/project')
    .action(use);

program
    .command("init")
    .argument('<client>', 'Client folder name with Personal Access Token (.pat)')
    .description("Pulls the projects of a client into local directory and updates projects.json")
    .action((client: string) => {
        const clientPath = path.join(SYS_FILE.root, client);
        const token = readText(path.join(clientPath, SYS_FILE.PAT));
        if (!token) return missingToken();
        const api = getApiClient(token);
        api.get('/projects').then(res => {
            if (!res) return;
            const projectConfig = res.data
                .filter((p: any) => p.platform === 'web' && p.status === 'active')
                .map((project: any) => {
                    return {
                        name: project.name,
                        id: project.id,
                        dirName: sanitizeDirName(project.name)
                    }
                });
            writeJson(path.join(clientPath, SYS_FILE.projects), projectConfig);
            projectConfig.forEach((p: any) => {
                const projectPath = path.join(clientPath, p.dirName);
                if (fs.existsSync(projectPath)) return;
                fs.mkdirSync(projectPath);
                writeJson(path.join(projectPath, SYS_FILE.experiments), []);
                log.warning(`Missing project dir created @${projectPath.toString()}`);
            });
            log.success(`Successfully initialized client **@${client}**`);
        });
    });

program
    .command('pull')
    .description('Pull the current experiment to local machine')
    .action(pull);

program
    .command('push')
    .argument('[action]', "If you want to publish your changes directly.")
    .description('Push the current variation code to Platform')
    .action(async (action) => {
        const { client, project, experiment, variation, extension, page } = getContext();
        if (!client || !project) return log.error("Missing context. Try npx optly use <variation link>");
        const clientPath = path.join(SYS_FILE.root, client);
        const projects = readJson(path.join(clientPath, SYS_FILE.projects)) || [];
        const projectDir = projects.find((p: any) => p.id === project)?.dirName;
        if (!projectDir) return log.error("Can't find project local directory. Try npx optly init <client-directory>");
        const projectPath = path.join(clientPath, projectDir);

        const token = readText(path.join(clientPath, SYS_FILE.PAT));
        if (!token) return missingToken();
        const api = getApiClient(token);

        if (!experiment && extension) return pushExtension(api, projectPath, extension);

        const experiments = readJson(path.join(projectPath, SYS_FILE.experiments)) || [];
        if (!experiment || !variation) return log.error("Missing context. Try npx optly use <variation link>");
        const experimentJson = experiments.find((xp: any) => xp.id === experiment);
        if (!experimentJson) return log.error("Can't find experiment. Try running npx optly pull");
        const experimentDir = experimentJson.dirName;
        const experimentPath = path.join(projectPath, experimentDir);
        const variationJson = experimentJson.variations.find((v: any) => v.id === variation && v.pageId === page);
        if (!variationJson) return log.error("Can't find variation. Try running npx optly pull");
        const variationDir = variationJson.dirName;
        const variationPath = path.join(experimentPath, variationDir);
        const customJS = readText(path.join(variationPath, SYS_FILE.JS));
        const customCSS = readText(path.join(variationPath, SYS_FILE.CSS));

        const experimentBody = readJson(path.join(experimentPath, SYS_FILE.experiment));
        const variationBody = experimentBody.variations.find((v: any) => v.variation_id === variation);
        // const targetPageId = experimentBody.page_ids && experimentBody.page_ids[0] || experimentBody.url_targeting.page_id;
        if (customJS) {
            try {
                variationBody.actions.find((a: any) => a.page_id === page).changes.find((change: any) => {
                    return change.type === 'custom_code';
                }).value = customJS;;
            } catch (e) {
                const change = { "async": false, "dependencies": [], "type": "custom_code", "value": customJS };
                if (variationBody.actions && variationBody.actions.length) {
                    if (!variationBody.actions.find((a: any) => a.page_id === page)) {
                        variationBody.actions.push({
                            changes: [],
                            page_id: page
                        });
                    }
                    // if (!variationBody.actions[0].changes) variationBody.actions[0].changes = [];
                    variationBody.actions.find((a: any) => a.page_id === page).changes.push(change);
                } else {
                    if (!variationBody.actions) variationBody.actions = [];
                    variationBody.actions.push({
                        changes: [change],
                        // page_id: targetPageId
                        page_id: page
                    });
                }
            }
        }
        if (customCSS) {
            try {
                variationBody.actions.find((a: any) => a.page_id === page).changes.find((change: any) => {
                    return change.type === 'custom_css';
                }).value = customCSS;
            } catch (e) {
                const change = {
                    "async": false, "dependencies": [], "selector": "head",
                    "type": "custom_css", "value": customCSS
                };
                if (variationBody.actions && variationBody.actions.length) {
                    if (!variationBody.actions.find((a: any) => a.page_id === page)) {
                        variationBody.actions.push({
                            changes: [],
                            page_id: page
                        });
                    }
                    // if (!variationBody.actions[0].changes) variationBody.actions[0].changes = [];
                    variationBody.actions.find((a: any) => a.page_id === page).changes.push(change);
                } else {
                    if (!variationBody.actions) variationBody.actions = [];
                    variationBody.actions.push({
                        changes: [change],
                        // page_id: targetPageId
                        page_id: page
                    });
                }
            }
        }
        let apiUrl = `/experiments/${experiment}`;
        if (action === 'publish') {
            const isSafeToPublish = await checkSafePublishing(api, experimentBody.audience_conditions);
            if (isSafeToPublish) apiUrl += `?action=publish`;
            else return log.error(`Please attach **Optimizely QA Cookie** as Audience and try again.`);
        }
        api.patch(apiUrl, experimentBody).then(res => {
            if (!res) return;
            writeJson(path.join(experimentPath, SYS_FILE.experiment), res.data);
            log.success(`${experimentJson.name} -> ${variationBody.name} ${action === 'publish' ? '**published**' : 'updated'} successfully!`);
            // if (process.env.DISABLE_PREVIEW_ON_PUSH !== 'true') {
            //     try {
            //         const updatedVariation = res.data.variations.find((v: any) => v.variation_id === variation);
            //         log.info("Opening preview link in browser...");
            //         (new Promise(resolve => setTimeout(resolve, 3000))).then(() => {
            //             open(updatedVariation.actions[0].share_link);
            //         });
            //     } catch (e) { log.error("Error opening preview link. Please try manually."); }
            // }
        });
    });

program
    .command("dev")
    .argument('[action]', "To bundle the code (TS/SCSS) without running dev server")
    .description("Run the recently pulled variation in a local server")
    .action(dev);


// "metric": "ts-node src/cli.ts metric",
// program
//     .command("metric")
//     .description("Try and sync metrics from a list of selector and metric name")
//     .action(() => {
//         const { client } = getContext();
//         if (!client) return log.error("Missing context. Try npx optly use <variation link>");
//         const clientPath = path.join(SYS_FILE.root, client);
//         const token = readText(path.join(clientPath, SYS_FILE.PAT));
//         if (!token) return missingToken();
//         const api = getApiClient(token);
//         function getEvent(eventId: string) { return api.get(`/events/${eventId}`) }
//         function makeEvent(pageId: string, event: OptEvent) {
//             return api.post(`/pages/${pageId}/events`, event)
//         }

//         const devRoot = readText(SYS_FILE.variationPath);
//         if (!devRoot) return log.error("Try pulling a variation first");
//         const experimentPath = path.join(devRoot, '..');
//         const metrics: Metric[] = readJson(path.join(experimentPath, SYS_FILE.metrics)) || [];
//         if (!metrics.length) return log.error("No metrics found to be added!");
//         const xpJson = readJson(path.join(experimentPath, SYS_FILE.experiment));
//         const alreadyAddedMetrics = xpJson.metrics.map((x: any) => x.event_id).map(getEvent);
//         Promise.all([...alreadyAddedMetrics]).then((res: any) => {
//             const resMetrics: OptEvent[] = res.map((x: any) => x.data);
//             const metricsToAdd = metrics.filter(x => !resMetrics
//                 .find((m) => m.config.selector === x.selector && m.name === x.name));
//             if (!metricsToAdd.length) return log.warning("All the metrics are added already");
//             const targetPageId = xpJson.page_ids && xpJson.page_ids[0] || xpJson.url_targeting.page_id;
//             Promise.allSettled([...metricsToAdd.map(e => makeEvent(targetPageId, {
//                 name: e.name, config: { selector: e.selector }, event_type: 'click'
//             }))]).then(res => {
//                 const resEvents: OptEvent[] = res.map((x: any) => {
//                     if (x.status === 'fulfilled') return x.value.data;
//                     return { id: (x.reason.toString().match(/(\d+)/) || [null, null])[1] }
//                 });
//                 const metricsToPushOnXp = resEvents.map((e) => {
//                     if (!e || !e.id) return null;
//                     return { event_id: Number(e.id), winning_direction: 'increasing', aggregator: 'unique', scope: 'visitor' }
//                 }).filter(x => x);
//                 xpJson.metrics.push(...metricsToPushOnXp);
//                 writeJson(path.join(experimentPath, SYS_FILE.experiment), xpJson);
//                 log.success(`${metricsToPushOnXp.length} metric(s) added. Run npx optly push to push the changes.`);
//             });
//         });
//     });

program
    .command('variations')
    .description("Change context to a different variation of the same experiemnt")
    .action(variations);

program.parse();
