# Optimizely CLI
CLI for Optimizely Web Experimentation.

## Install
Create a node project. Run `npm i opti-cli`

## Setup
This package expects some specific folder structure given below.

```
clients/
├── client1/
│     └── .pat
└── client2/
      └── .pat
```
**PAT** stands for personal access token. You can get it from [this documentation](https://support.optimizely.com/hc/en-us/articles/4410289816205-Manage-your-API-tokens). `.pat` file should contain your generated token only in raw text format.

Now you have to initialize the client for future use (one time only) by running `npx optly init <client-folder-directory-name>`. For example running `npx optly init client1` will initialize **client1** and it's projects for future use.

Note: Make sure you put `.pat` in `.gitignore`, you don't want your secrets to be published, do you?

## Setting variation context
To make changes and push them directly using CLI, you'll need to set variation context.
You can do that by simply running `npx optly use <variation-link>`. For example, running `npx optly use https://app.optimizely.com/v2/projects/30072250448/experiments/5560453733023744/variations/6356439216685056` will set the right context for this experiment and all it's variation to be pulled and only selected variation to be pushed.

## Pulling a experiment
You can pull an experiment and all it's variation codes by running `npx optly pull`. It will download necessary content to your local machine. You can find the in the following structure.
```
clients/
└── <client-name>/
        ├── <project-name>
        │   ├── <experiment-name>
        │   │   ├── <variation-name>
        │   │   │   ├── custom.js
        │   │   │   └── custom.css
        │   │   └── experiment.json
        │   └── experiments.json
        ├── .pat
        └── projects.json
```

## Pushing a change
Once you are done making changes to `custom.js` and `custom.css`, you can push the changes by running `npx optly push`. This will only update the changes in the platform, won't publish them. To publish the changes directly from CLI, you can run `npx optly push publish`.

## Thank you!
Any kind of feedback is welcome.