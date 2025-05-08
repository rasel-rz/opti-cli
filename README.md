# Optimizely CLI
CLI for Optimizely Web Experimentation.

## Install
Create a node project. Run 
```
npm i opti-cli
```

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

Now you have to initialize the client for future use (one time only) by running 
```
npx optly init <client-folder-directory-name>
```
For example running `npx optly init client1` will initialize **client1** and it's projects for future use.

Note: Make sure you put `.pat` in `.gitignore`, you don't want your secrets to be published, do you?

## Setting variation context
To make changes and push them directly using CLI, you'll need to set variation context.
You can do that by simply running 
```
npx optly use <variation-link>
```
For example, running `npx optly use https://app.optimizely.com/v2/projects/30072250448/experiments/5560453733023744/variations/6356439216685056` will set the right context for this experiment and all it's variation to be pulled and only selected variation to be pushed.

## Pulling a experiment
You can pull an experiment and all it's variation codes by running 
```
npx optly pull
```
It will download necessary content to your local machine. You can find the in the following structure.
```
clients/
└── <client-name>/
        ├── <project-name>
        │   ├── <experiment-name>
        │   │   ├── <variation-name>
        │   │   │   ├── custom.js
        │   │   │   ├── custom.css
        │   │   │   ├── index.ts
        │   │   │   └── index.scss
        │   │   ├── experiment.json
        │   │   └── metrics.json
        │   └── experiments.json
        ├── .pat
        └── projects.json
```

## Local Development
Once you pull an experiment, you can run certain variation locally to test properly. For smooth development with hot-reload support, we are gonna use [TamperMonkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) chrome extension. First install the chrome extension, enable it on click only from extension settings.
Then add an script as following:
```
// ==UserScript==
// @name         Opti-CLI
// @namespace    https://rasel-rz.github.io/
// @version      2025-05-09
// @description  Running Optimizely Web Experiments locally for testing.
// @author       Raihan
// @match        *://*/*
// @grant        none
// @noframes
// ==/UserScript==

(function () {
    'use strict';
    const PORT = 3000;
    // Inject custom CSS
    function injectCss() {
        document.querySelectorAll(`#opti-cli-css`).forEach(el => el.remove());
        const customCSS = document.createElement('link');
        customCSS.id = "opti-cli-css";
        customCSS.rel = 'stylesheet';
        customCSS.href = `http://localhost:${PORT}/custom.css`;
        document.head.appendChild(customCSS);
    }

    // Inject custom JS
    function injectJs() {
        const customJs = document.createElement('script');
        customJs.src = `http://localhost:${PORT}/custom.js`;
        customJs.type = 'text/javascript';
        document.body.appendChild(customJs);
    }

    // Inject hot-reload JS (optional)
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.onmessage = ({ data }) => {
        if (data === 'reload.css') return injectCss();
        window.location.reload();
    };
    injectCss(); injectJs();
})();
```
This script will match all URL. So activating it on-click only will prevent the browser unnecessary reloads.
Now, run `npx optly dev`, navigate to the TAB you want to test the changes, enable Tampermonkey on that TAB, reload, enjoy!

The CLI by default supports typescript and scss. If you want the dev enviroment to disable them, check out *Environment Variables* section.

## Metrics
The REST API doesn't support test specific/variation only metrics. It only allows us to create and attach page based metrics. Once you pull an experiment, you should have an empty _metrics.json_ on your experiment folder. To create a metric, we need need a CSS Selector and a name. Update the `metrics.json` as follows:
```
[
    {
        "selector": "<Valid CSS Selector>",
        "name": "<Metric Name>"
    },
    {
        "selector": "<Another CSS Selector>",
        "name": "<Another Name>"
    }
]
```
After updating the JSON, run
```
npx optly metric
```
This will create click events on the targeted page. To add the events as metrics for the experiment, push the changes.

## Pushing a change
Once you are done making changes to `custom.js` and `custom.css`, you can push the changes by running `npx optly push`. This will only update the changes in the platform, won't publish them. To publish the changes directly from CLI, you can run `npx optly push publish`.

Pushing a change will automatically open the preview link in your default browser.

## Environment Variables
### DISABLE_PREVIEW_ON_PUSH
Value can be `true` or `anything else`. If value is set to `true`, CLI will stop opening preview on push.

### DISABLE_TS__SCSS_BUNDLE
Value can be `true` or `anything else`. If value is set to `true`, CLI will **_stop_ creating/bundling/compiling** `index.ts` and `index.scss` file in variation directory.

## Thank you!
Any kind of feedback is welcome.