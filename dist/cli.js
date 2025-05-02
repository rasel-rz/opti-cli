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
dotenv.config();
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
    .argument('<client>', 'Client folder name with Personal Access Token (.PAT)')
    .description("Pulls the projects of a client into local directory and updates projects.json")
    .action((client) => {
    const clientPath = path_1.default.join('clients', client);
    const tokenPath = path_1.default.join(clientPath, '.pat');
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
        fs_1.default.writeFileSync(path_1.default.join(clientPath, 'projects.json'), JSON.stringify(projectConfig, null, 2));
        projectConfig.forEach((p) => {
            const projectPath = path_1.default.join(clientPath, p.dirName);
            if (fs_1.default.existsSync(projectPath))
                return;
            fs_1.default.mkdirSync(projectPath);
            fs_1.default.writeFileSync(path_1.default.join(projectPath, 'experiments.json'), JSON.stringify([], null, 2));
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
    const clientPath = path_1.default.join("clients", client);
    const projects = JSON.parse(fs_1.default.readFileSync(path_1.default.join(clientPath, "projects.json"), 'utf-8'));
    const projectDir = (_a = projects.find((p) => p.id === project)) === null || _a === void 0 ? void 0 : _a.dirName;
    if (!projectDir)
        return console.log("Can't find project local directory. Try npx optly init <client-directory>");
    const projectPath = path_1.default.join(clientPath, projectDir);
    const tokenPath = path_1.default.join(clientPath, '.pat');
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
            localExperiments.push(...JSON.parse(fs_1.default.readFileSync(path_1.default.join(projectPath, "experiments.json"), 'utf-8')));
        }
        catch (e) { }
        const experimentEntryIndex = localExperiments.findIndex((xp) => xp.id === experiment);
        if (experimentEntryIndex >= 0) {
            localExperiments.splice(experimentEntryIndex, 1);
        }
        const experimentEntry = { name: res.data.name, dirName: experimentDir, id: experiment, variations: [] };
        fs_1.default.writeFileSync(path_1.default.join(experimentPath, "experiment.json"), JSON.stringify(res.data, null, 2));
        res.data.variations.forEach((variation) => {
            const variationDir = (0, util_1.sanitizeDirName)(variation.name);
            const variationPath = path_1.default.join(experimentPath, variationDir);
            if (!fs_1.default.existsSync(variationPath))
                fs_1.default.mkdirSync(variationPath);
            const customJS = (variation.actions[0].changes.find((x) => x.type === 'custom_code') || { value: '' }).value;
            const customCSS = (variation.actions[0].changes.find((x) => x.type === 'custom_css') || { value: '' }).value;
            fs_1.default.writeFileSync(path_1.default.join(variationPath, "custom.js"), customJS);
            fs_1.default.writeFileSync(path_1.default.join(variationPath, "custom.css"), customCSS);
            experimentEntry.variations.push({ name: variation.name, dirName: variationDir, id: variation.variation_id });
        });
        localExperiments.push(experimentEntry);
        fs_1.default.writeFileSync(path_1.default.join(projectPath, "experiments.json"), JSON.stringify(localExperiments, null, 2));
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
    const clientPath = path_1.default.join("clients", client);
    const projects = JSON.parse(fs_1.default.readFileSync(path_1.default.join(clientPath, "projects.json"), 'utf-8'));
    const projectDir = (_a = projects.find((p) => p.id === project)) === null || _a === void 0 ? void 0 : _a.dirName;
    if (!projectDir)
        return console.log("Can't find project local directory. Try npx optly init <client-directory>");
    const projectPath = path_1.default.join(clientPath, projectDir);
    const tokenPath = path_1.default.join(clientPath, '.pat');
    if (!fs_1.default.existsSync(tokenPath))
        return console.log("Client directory/PAT not found!");
    const token = fs_1.default.readFileSync(tokenPath, 'utf-8');
    const api = (0, api_1.getApiClient)(token);
    const experiments = JSON.parse(fs_1.default.readFileSync(path_1.default.join(projectPath, "experiments.json"), 'utf-8'));
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
    const customJS = fs_1.default.readFileSync(path_1.default.join(variationPath, "custom.js"), 'utf-8');
    const customCSS = fs_1.default.readFileSync(path_1.default.join(variationPath, "custom.css"), 'utf-8');
    const experimentBody = JSON.parse(fs_1.default.readFileSync(path_1.default.join(experimentPath, "experiment.json"), 'utf-8'));
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
        fs_1.default.writeFileSync(path_1.default.join(experimentPath, "experiment.json"), JSON.stringify(res.data, null, 2));
        console.log(`${experimentJson.name} updated successfully!`);
    });
});
program.parse();
