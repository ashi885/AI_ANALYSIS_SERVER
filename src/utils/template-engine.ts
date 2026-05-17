import Handlebars from 'handlebars';
import { getDatabase } from '../sqlite';

// Register custom helpers
Handlebars.registerHelper('timecode', (seconds: number) => {
    if (seconds === undefined || seconds === null) return '00:00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * 25); // Assuming 25fps default
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
});

Handlebars.registerHelper('addOne', (value: number) => {
    return (value || 0) + 1;
});

Handlebars.registerHelper('formatSrtTime', (seconds: number) => {
    if (seconds === undefined || seconds === null) return '00:00:00,000';
    const date = new Date(0);
    date.setSeconds(seconds);
    const ms = Math.floor((seconds % 1) * 1000);
    return date.toISOString().substr(11, 8) + ',' + ms.toString().padStart(3, '0');
});

Handlebars.registerHelper('formatVttTime', (seconds: number) => {
    if (seconds === undefined || seconds === null) return '00:00:00.000';
    const date = new Date(0);
    date.setSeconds(seconds);
    const ms = Math.floor((seconds % 1) * 1000);
    return date.toISOString().substr(11, 8) + '.' + ms.toString().padStart(3, '0');
});

Handlebars.registerHelper('json', (context: any) => {
    return JSON.stringify(context, null, 2);
});

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
