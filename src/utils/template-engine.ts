import Handlebars from 'handlebars';
import { getDatabase } from '../sqlite';

/**
 * Universal Template Engine for Cuepoint Exports
 * Supports Handlebars templates stored in the database.
 */
export async function renderTemplate(moduleName: string, data: any, clientId: number): Promise<{ content: string; extension: string }> {
    const db = getDatabase();

    // 1. Look for a custom template for this client and module
    const template = db.prepare(`
        SELECT template_content, file_extension 
        FROM export_templates 
        WHERE (client_id = ? OR client_id IS NULL) 
        AND module_name = ? 
        AND is_active = 1
        ORDER BY client_id DESC -- Prioritize client-specific templates
        LIMIT 1
    `).get(clientId, moduleName) as { template_content: string, file_extension: string } | undefined;

    if (!template) {
        // Fallback to default JSON if no template found
        return {
            content: JSON.stringify(data, null, 2),
            extension: 'json'
        };
    }

    try {
        const compiled = Handlebars.compile(template.template_content);
        const result = compiled(data);
        return {
            content: result,
            extension: template.file_extension || 'xml'
        };
    } catch (err: any) {
        console.error(`[TemplateEngine] Error rendering ${moduleName}:`, err);
        return {
            content: JSON.stringify(data, null, 2),
            extension: 'json'
        };
    }
}
