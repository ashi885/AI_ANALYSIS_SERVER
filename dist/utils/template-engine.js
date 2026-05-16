"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderTemplate = renderTemplate;
const handlebars_1 = __importDefault(require("handlebars"));
const sqlite_1 = require("../sqlite");
/**
 * Universal Template Engine for Cuepoint Exports
 * Supports Handlebars templates stored in the database.
 */
async function renderTemplate(moduleName, data, clientId) {
    const db = (0, sqlite_1.getDatabase)();
    // 1. Look for a custom template for this client and module
    const template = db.prepare(`
        SELECT template_content, file_extension 
        FROM export_templates 
        WHERE (client_id = ? OR client_id IS NULL) 
        AND module_name = ? 
        AND is_active = 1
        ORDER BY client_id DESC -- Prioritize client-specific templates
        LIMIT 1
    `).get(clientId, moduleName);
    if (!template) {
        // Fallback to default JSON if no template found
        return {
            content: JSON.stringify(data, null, 2),
            extension: 'json'
        };
    }
    try {
        const compiled = handlebars_1.default.compile(template.template_content);
        const result = compiled(data);
        return {
            content: result,
            extension: template.file_extension || 'xml'
        };
    }
    catch (err) {
        console.error(`[TemplateEngine] Error rendering ${moduleName}:`, err);
        return {
            content: JSON.stringify(data, null, 2),
            extension: 'json'
        };
    }
}
