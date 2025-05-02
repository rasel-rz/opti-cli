"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApiClient = getApiClient;
const axios_1 = __importDefault(require("axios"));
function getApiClient(token) {
    const api = axios_1.default.create({
        baseURL: 'https://api.optimizely.com/v2',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        timeout: 10000,
    });
    api.interceptors.response.use((res) => res, (err) => {
        var _a, _b;
        const { response } = err;
        if (!response)
            return console.log("API timed out. Please try again!");
        console.log(`Error ${response.status}: ${((_a = response.data) === null || _a === void 0 ? void 0 : _a.message) || ((_b = response.data) === null || _b === void 0 ? void 0 : _b.error) || err.message}`);
    });
    return api;
}
