"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeDirName = sanitizeDirName;
exports.readText = readText;
exports.readJson = readJson;
exports.writeJson = writeJson;
const fs_1 = __importDefault(require("fs"));
function sanitizeDirName(name) {
    return name.toLowerCase().replace(/[^A-Za-z0-9]/g, ' ').trim().replace(/[\s]+/g, '-');
}
function readText(filePath) {
    if (fs_1.default.existsSync(filePath)) {
        return fs_1.default.readFileSync(filePath, 'utf-8');
    }
    console.log(`${filePath} not found!`);
    return '';
}
function readJson(filePath) {
    const text = readText(filePath);
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch (e) {
        return null;
    }
}
function writeJson(filePath, obj) {
    try {
        fs_1.default.writeFileSync(filePath, JSON.stringify(obj, null, 2));
        return true;
    }
    catch (e) {
        console.log(`Error writing file: ${filePath}`);
        return false;
    }
}
