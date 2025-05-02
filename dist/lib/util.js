"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeDirName = sanitizeDirName;
function sanitizeDirName(name) {
    return name.toLowerCase().replace(/[^A-Za-z0-9]/g, ' ').trim().replace(/[\s]+/g, '-');
}
