#!/usr/bin/env node

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { setContext, getContext } from './lib/context';
import { getApiClient } from './lib/api';
import fs from 'fs';
import path from 'path';
import { sanitizeDirName } from './lib/util';
import express from 'express';
import chokidar from 'chokidar';
import http from 'http';
import WebSocket from 'ws';

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
}
interface Metric { selector: string, name: string };
interface OptMetric { aggregator: 'unique', event_id: number, scope: 'visitor', winning_direction: 'increasing' };
interface OptEvent { name: string, id?: number, event_type: 'click', config: { selector: string }, page_id?: number };

const program = new Command();

program.name('opti-cli').version('0.1.0');

program
    .command('use')
    .argument('<link>', 'Project/Experiment Link')
    .description('Set the current working experiment/project')
    .action((link: string) => {
        const context = setContext(link);
        console.log(`Context set to: ${JSON.stringify(context)}`);
    });

program
    .command("init")
    .argument('<client>', 'Client folder name with Personal Access Token (.pat)')
    .description("Pulls the projects of a client into local directory and updates projects.json")
    .action((client: string) => {
        const clientPath = path.join(SYS_FILE.root, client);
        const tokenPath = path.join(clientPath, SYS_FILE.PAT);
        if (!fs.existsSync(tokenPath)) return console.log("Client directory/PAT not found!");
        const token = fs.readFileSync(tokenPath, 'utf-8');
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
            fs.writeFileSync(path.join(clientPath, SYS_FILE.projects), JSON.stringify(projectConfig, null, 2));
            projectConfig.forEach((p: any) => {
                const projectPath = path.join(clientPath, p.dirName);
                if (fs.existsSync(projectPath)) return;
                fs.mkdirSync(projectPath);
                fs.writeFileSync(path.join(projectPath, SYS_FILE.experiments), JSON.stringify([], null, 2))
                console.log(`Missing project dir created @${projectPath.toString()}`);
            });
        });
    });

program
    .command('pull')
    .description('Pull the current experiment to local machine')
    .action(() => {
        const { client, project, experiment } = getContext();
        if (!client || !project || !experiment) return console.log("Missing context. Try npx optly use <experiment/variation link>");
        const clientPath = path.join(SYS_FILE.root, client);
        const projects = JSON.parse(fs.readFileSync(path.join(clientPath, SYS_FILE.projects), 'utf-8'));
        const projectDir = projects.find((p: any) => p.id === project)?.dirName;
        if (!projectDir) return console.log("Can't find project local directory. Try npx optly init <client-directory>");
        const projectPath = path.join(clientPath, projectDir);

        const tokenPath = path.join(clientPath, SYS_FILE.PAT);
        if (!fs.existsSync(tokenPath)) return console.log("Client directory/PAT not found!");
        const token = fs.readFileSync(tokenPath, 'utf-8');
        const api = getApiClient(token);
        api.get(`/experiments/${experiment}`).then(res => {
            if (!res) return;
            if (res.data.type != 'a/b') return console.log("Only A/B Tests are supported here for now!");
            const experimentDir = sanitizeDirName(res.data.name);
            const experimentPath = path.join(projectPath, experimentDir);
            if (!fs.existsSync(experimentPath)) fs.mkdirSync(experimentPath);
            const localExperiments: any[] = [];
            try {
                localExperiments.push(...JSON.parse(fs.readFileSync(path.join(projectPath, SYS_FILE.experiments), 'utf-8')));
            } catch (e) { }
            const experimentEntryIndex = localExperiments.findIndex((xp: any) => xp.id === experiment);
            if (experimentEntryIndex >= 0) { localExperiments.splice(experimentEntryIndex, 1); }
            const experimentEntry: any = { name: res.data.name, dirName: experimentDir, id: experiment, variations: [] };

            fs.writeFileSync(path.join(experimentPath, SYS_FILE.experiment), JSON.stringify(res.data, null, 2));
            res.data.variations.forEach((variation: any) => {
                const variationDir = sanitizeDirName(variation.name);
                const variationPath = path.join(experimentPath, variationDir);
                if (!fs.existsSync(variationPath)) fs.mkdirSync(variationPath);
                fs.writeFileSync(SYS_FILE.variationPath, variationPath);
                let customJS = "", customCSS = "";
                try {
                    customJS = variation.actions[0].changes.find((x: any) => x.type === 'custom_code').value;
                } catch (e) { }
                try {
                    customCSS = variation.actions[0].changes.find((x: any) => x.type === 'custom_css').value;
                } catch (e) { }
                fs.writeFileSync(path.join(variationPath, SYS_FILE.JS), customJS);
                fs.writeFileSync(path.join(variationPath, SYS_FILE.CSS), customCSS);
                experimentEntry.variations.push({ name: variation.name, dirName: variationDir, id: variation.variation_id });
            });
            localExperiments.push(experimentEntry);
            fs.writeFileSync(path.join(projectPath, SYS_FILE.experiments), JSON.stringify(localExperiments, null, 2));
            const metricPath = path.join(experimentPath, SYS_FILE.metrics);
            if (!fs.existsSync(metricPath)) fs.writeFileSync(metricPath, JSON.stringify([], null, 2));
            console.log(`${res.data.name} pulled!`);
        });
    });

program
    .command('push')
    .argument('[action]', "If you want to publish your changes directly.")
    .description('Push the current variation code to Platform')
    .action((action) => {
        const { client, project, experiment, variation } = getContext();
        if (!client || !project || !experiment || !variation) return console.log("Missing context. Try npx optly use <variation link>");
        const clientPath = path.join(SYS_FILE.root, client);
        const projects = JSON.parse(fs.readFileSync(path.join(clientPath, SYS_FILE.projects), 'utf-8'));
        const projectDir = projects.find((p: any) => p.id === project)?.dirName;
        if (!projectDir) return console.log("Can't find project local directory. Try npx optly init <client-directory>");
        const projectPath = path.join(clientPath, projectDir);

        const tokenPath = path.join(clientPath, SYS_FILE.PAT);
        if (!fs.existsSync(tokenPath)) return console.log("Client directory/PAT not found!");
        const token = fs.readFileSync(tokenPath, 'utf-8');
        const api = getApiClient(token);

        const experiments = JSON.parse(fs.readFileSync(path.join(projectPath, SYS_FILE.experiments), 'utf-8'));
        const experimentJson = experiments.find((xp: any) => xp.id === experiment);
        if (!experimentJson) return console.log("Can't find experiment. Try running npx optly pull");
        const experimentDir = experimentJson.dirName;
        const experimentPath = path.join(projectPath, experimentDir);
        const variationJson = experimentJson.variations.find((v: any) => v.id === variation);
        if (!variationJson) return console.log("Can't find variation. Try running npx optly pull");
        const variationDir = variationJson.dirName;
        const variationPath = path.join(experimentPath, variationDir);
        const customJS = fs.readFileSync(path.join(variationPath, SYS_FILE.JS), 'utf-8');
        const customCSS = fs.readFileSync(path.join(variationPath, SYS_FILE.CSS), 'utf-8');

        const experimentBody = JSON.parse(fs.readFileSync(path.join(experimentPath, SYS_FILE.experiment), 'utf-8'));
        const variationBody = experimentBody.variations.find((v: any) => v.variation_id === variation);
        const targetPageId = experimentBody.page_ids && experimentBody.page_ids[0] || experimentBody.url_targeting.page_id;
        if (customJS) {
            try {
                variationBody.actions[0].changes.find((change: any) => {
                    return change.type === 'custom_code';
                }).value = customJS;;
            } catch (e) {
                const change = { "async": false, "dependencies": [], "type": "custom_code", "value": customJS };
                if (variationBody.actions && variationBody.actions.length) {
                    if (!variationBody.actions[0].changes) variationBody.actions[0].changes = [];
                    variationBody.actions[0].changes.push(change);
                } else {
                    if (!variationBody.actions) variationBody.actions = [];
                    variationBody.actions.push({
                        changes: [change],
                        page_id: targetPageId
                    });
                }
            }
        }
        if (customCSS) {
            try {
                variationBody.actions[0].changes.find((change: any) => {
                    return change.type === 'custom_css';
                }).value = customCSS;
            } catch (e) {
                const change = {
                    "async": false, "dependencies": [], "selector": "head",
                    "type": "custom_css", "value": customCSS
                };
                if (variationBody.actions && variationBody.actions.length) {
                    if (!variationBody.actions[0].changes) variationBody.actions[0].changes = [];
                    variationBody.actions[0].changes.push(change);
                } else {
                    if (!variationBody.actions) variationBody.actions = [];
                    variationBody.actions.push({
                        changes: [change],
                        page_id: targetPageId
                    });
                }
            }
        }
        let apiUrl = `/experiments/${experiment}`;
        if (action === 'publish') apiUrl += `?action=publish`;
        api.patch(apiUrl, experimentBody).then(res => {
            if (!res) return;
            fs.writeFileSync(path.join(experimentPath, SYS_FILE.experiment), JSON.stringify(res.data, null, 2));
            console.log(`${experimentJson.name} updated successfully!`);
        });
    });

program
    .command("dev")
    .description("Run the recently pulled variation in a local server")
    .action(() => {
        if (!fs.existsSync(SYS_FILE.variationPath)) return console.log("Try pulling a variation first");
        const devRoot = fs.readFileSync(SYS_FILE.variationPath, 'utf-8');

        const jsPath = path.join(devRoot, SYS_FILE.JS);
        const cssPath = path.join(devRoot, SYS_FILE.CSS);

        if (!fs.existsSync(jsPath) || !fs.existsSync(cssPath)) {
            return console.log("custom.js or custom.css not found in the variation directory");
        }
        const app = express();
        const server = http.createServer(app);
        const wss = new WebSocket.Server({ server });

        app.use(express.static(devRoot));
        const PORT = 3000;

        app.get('/hot-reload.js', (req, res) => {
            res.setHeader('Content-Type', 'application/javascript');
            res.send(`
                const ws = new WebSocket('ws://localhost:${PORT}');
                ws.onmessage = () => location.reload();
            `);
        });

        const watcher = chokidar.watch([jsPath, cssPath]);
        watcher.on('change', (filePath) => {
            console.log(`${filePath} changed. Reloading...`);
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
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
        const { client, project } = getContext();
        if (!client) return console.log("Missing context. Try npx optly use <variation link>");
        const clientPath = path.join(SYS_FILE.root, client);
        const tokenPath = path.join(clientPath, SYS_FILE.PAT);
        if (!fs.existsSync(tokenPath)) return console.log("Client directory/PAT not found!");
        const token = fs.readFileSync(tokenPath, 'utf-8');
        const api = getApiClient(token);
        function getEvent(eventId: string) { return api.get(`/events/${eventId}`) }
        function makeEvent(pageId: string, event: OptEvent) {
            return api.post(`/pages/${pageId}/events`, event)
        }

        if (!fs.existsSync(SYS_FILE.variationPath)) return console.log("Try pulling a variation first");
        const devRoot = fs.readFileSync(SYS_FILE.variationPath, 'utf-8');
        const experimentPath = path.join(devRoot, '..');
        const metricsPath = path.join(experimentPath, SYS_FILE.metrics);
        if (!fs.existsSync(metricsPath)) return console.log(`Try defining a metrics.json in experiment dir.`);
        const metrics: Metric[] = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
        if (!metrics.length) return console.log("No metrics found to be added!");
        const xpJson = JSON.parse(fs.readFileSync(path.join(experimentPath, SYS_FILE.experiment), 'utf-8'));
        const alreadyAddedMetrics = xpJson.metrics.map((x: any) => x.event_id).map(getEvent);
        Promise.all([...alreadyAddedMetrics]).then((res: any) => {
            const resMetrics: OptEvent[] = res.map((x: any) => x.data);
            const metricsToAdd = metrics.filter(x => !resMetrics
                .find((m) => m.config.selector === x.selector && m.name === x.name));
            if (!metricsToAdd.length) return console.log("All the metrics are added already");
            const targetPageId = xpJson.page_ids && xpJson.page_ids[0] || xpJson.url_targeting.page_id;
            Promise.allSettled([...metricsToAdd.map(e => makeEvent(targetPageId, {
                name: e.name, config: { selector: e.selector }, event_type: 'click'
            }))]).then(res => {
                const resEvents: OptEvent[] = res.map((x: any) => {
                    if (x.status === 'fulfilled') return x.value.data;
                    return { id: (x.reason.toString().match(/(\d+)/) || [null, null])[1] }
                });
                const metricsToPushOnXp = resEvents.map((e) => {
                    if (!e || !e.id) return null;
                    return { event_id: Number(e.id), winning_direction: 'increasing', aggregator: 'unique', scope: 'visitor' }
                }).filter(x => x);
                xpJson.metrics.push(...metricsToPushOnXp);
                fs.writeFileSync(path.join(experimentPath, SYS_FILE.experiment), JSON.stringify(xpJson, null, 2));
                console.log(`${metricsToPushOnXp.length} metric(s) added. Run npx optly push to push the changes.`);
            });
        });
    });

program.parse();
