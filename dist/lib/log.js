"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = void 0;
const chalk_1 = __importDefault(require("chalk"));
const formatMessage = (msg) => {
    // Replace **text** with bold text using chalk
    return msg.replace(/\*\*(.*?)\*\*/g, (match, p1) => chalk_1.default.bold(p1));
};
exports.log = {
    success: (msg) => console.log(chalk_1.default.green.bold('✅ [SUCCESS]') + ' ' + formatMessage(msg)),
    warning: (msg) => console.log(chalk_1.default.yellow.bold('🚧 [WARNING]') + ' ' + formatMessage(msg)),
    info: (msg) => console.log(chalk_1.default.blue.bold('💡 [INFO]') + ' ' + formatMessage(msg)),
    error: (msg) => {
        console.log(chalk_1.default.red.bold('❌ [ERROR]') + ' ' + formatMessage(msg));
        process.exit(1);
    },
};
// Example logs
// log.success("Operation completed successfully!");
// log.warning("This action might have side effects.");
// log.info("The server is running on port 3000.");
// log.error("Failed to connect to the database.");
