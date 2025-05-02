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
}
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
                const customJS = (variation.actions[0].changes.find((x: any) => x.type === 'custom_code') || { value: '' }).value;
                const customCSS = (variation.actions[0].changes.find((x: any) => x.type === 'custom_css') || { value: '' }).value;
                fs.writeFileSync(path.join(variationPath, SYS_FILE.JS), customJS);
                fs.writeFileSync(path.join(variationPath, SYS_FILE.CSS), customCSS);
                experimentEntry.variations.push({ name: variation.name, dirName: variationDir, id: variation.variation_id });
            });
            localExperiments.push(experimentEntry);
            fs.writeFileSync(path.join(projectPath, SYS_FILE.experiments), JSON.stringify(localExperiments, null, 2));
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
        variationBody.actions[0].changes.forEach((change: any) => {
            if (change.type === 'custom_code') change.value = customJS;
            if (change.type === 'custom_css') change.value = customCSS;
        });
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

program.parse();
