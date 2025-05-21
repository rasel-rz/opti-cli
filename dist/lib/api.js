"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApiClient = getApiClient;
const axios_1 = __importDefault(require("axios"));
const log_1 = require("./log");
function getApiClient(token) {
    const api = axios_1.default.create({
        baseURL: 'https://api.optimizely.com/v2',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        timeout: 15000,
    });
    api.interceptors.response.use((res) => res, (err) => {
        var _a, _b, _c;
        const { response, config } = err;
        if (!response)
            return log_1.log.error("API timed out. Please try again!");
        log_1.log.error(`Error ${response.status}: ${((_a = response.data) === null || _a === void 0 ? void 0 : _a.message) || ((_b = response.data) === null || _b === void 0 ? void 0 : _b.error) || err.message}`);
        if (((_c = response === null || response === void 0 ? void 0 : response.data) === null || _c === void 0 ? void 0 : _c.message) && config.method === 'post' && config.url.match(/pages\/\d+\/events/gi)) {
            const foundIdMatch = response.data.message.match(/already\sin\suse.+\(id:\s(\d+)\).+/i);
            if (foundIdMatch) {
                throw new Error(`Found a duplicate with id ${foundIdMatch[1]}`);
            }
        }
    });
    return api;
}
