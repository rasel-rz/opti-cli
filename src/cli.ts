import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { setContext, getContext } from './lib/context';
import { getApiClient } from './lib/api';
import fs from 'fs';
import path, { dirname } from 'path';
import { sanitizeDirName } from './lib/util';

dotenv.config();

const program = new Command();

program.name('optimizely-cli').version('0.1.0');

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
    .argument('<client>', 'Client folder name with Personal Access Token (.PAT)')
    .description("Pulls the projects of a client into local directory and updates projects.json")
    .action((client: string) => {
        const clientPath = path.join('clients', client);
        const tokenPath = path.join(clientPath, '.pat');
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
            fs.writeFileSync(path.join(clientPath, 'projects.json'), JSON.stringify(projectConfig, null, 2));
            projectConfig.forEach((p: any) => {
                const projectPath = path.join(clientPath, p.dirName);
                if (fs.existsSync(projectPath)) return;
                fs.mkdirSync(projectPath);
                fs.writeFileSync(path.join(projectPath, 'experiments.json'), JSON.stringify([], null, 2))
                console.log(`Missing project dir created @${projectPath.toString()}`);
            });
        });
    });

program
    .command('pull')
    .description('Pull the current experiment to local machine')
    .action(() => {
        const { client, project, experiment } = getContext();
        if (!client || !project || !experiment) return console.log("Missing context. Try npm run use <experiment/variation link>");
        const clientPath = path.join("clients", client);
        const projects = JSON.parse(fs.readFileSync(path.join(clientPath, "projects.json"), 'utf-8'));
        const projectDir = projects.find((p: any) => p.id === project)?.dirName;
        if (!projectDir) return console.log("Can't find project local directory. Try npm run init <client-directory>");
        const projectPath = path.join(clientPath, projectDir);

        const tokenPath = path.join(clientPath, '.pat');
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
                localExperiments.push(...JSON.parse(fs.readFileSync(path.join(projectPath, "experiments.json"), 'utf-8')));
            } catch (e) { }
            const experimentEntryIndex = localExperiments.findIndex((xp: any) => xp.id === experiment);
            if (experimentEntryIndex >= 0) { localExperiments.splice(experimentEntryIndex, 1); }
            const experimentEntry: any = { name: res.data.name, dirName: experimentDir, id: experiment, variations: [] };

            fs.writeFileSync(path.join(experimentPath, "experiment.json"), JSON.stringify(res.data, null, 2));
            res.data.variations.forEach((variation: any) => {
                const variationDir = sanitizeDirName(variation.name);
                const variationPath = path.join(experimentPath, variationDir);
                if (!fs.existsSync(variationPath)) fs.mkdirSync(variationPath);
                const customJS = (variation.actions[0].changes.find((x: any) => x.type === 'custom_code') || { value: '' }).value;
                const customCSS = (variation.actions[0].changes.find((x: any) => x.type === 'custom_css') || { value: '' }).value;
                fs.writeFileSync(path.join(variationPath, "custom.js"), customJS);
                fs.writeFileSync(path.join(variationPath, "custom.css"), customCSS);
                experimentEntry.variations.push({ name: variation.name, dirName: variationDir, id: variation.variation_id });
            });
            localExperiments.push(experimentEntry);
            fs.writeFileSync(path.join(projectPath, "experiments.json"), JSON.stringify(localExperiments, null, 2));
            console.log(`${res.data.name} pulled!`);
        });
    });

program
    .command('push')
    .description('Push the current variation code to Platform')
    .action(() => {
        const { client, project, experiment, variation } = getContext();
        if (!client || !project || !experiment || !variation) return console.log("Missing context. Try npm run use <variation link>");
    })

program.parse();
