import chalk from "chalk";
const formatMessage = (msg: string) => {
    // Replace **text** with bold text using chalk
    return msg.replace(/\*\*(.*?)\*\*/g, (match, p1) => chalk.bold(p1));
};
export const log = {
    success: (msg: string) => console.log(chalk.green.bold('✅ [SUCCESS]') + ' ' + formatMessage(msg)),
    warning: (msg: string) => console.log(chalk.yellow.bold('🚧 [WARNING]') + ' ' + formatMessage(msg)),
    info: (msg: string) => console.log(chalk.blue.bold('💡 [INFO]') + ' ' + formatMessage(msg)),
    error: (msg: string) => console.log(chalk.red.bold('❌ [ERROR]') + ' ' + formatMessage(msg)),
};

// Example logs
// log.success("Operation completed successfully!");
// log.warning("This action might have side effects.");
// log.info("The server is running on port 3000.");
// log.error("Failed to connect to the database.");
