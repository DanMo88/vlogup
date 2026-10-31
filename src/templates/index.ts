/**
 * Templates: a template is a ready-made "edit recipe" (pacing, transitions, grade, captions,
 * music, SFX and a style prompt) that the AI applies to the user's own clips.
 * Source of truth: /templates/*.json (schema: /templates/template.schema.json, see SCHEMA.md).
 *
 * M1 only lists them. Applying a template arrives with the AI editor (M4) and will write
 * ops with actor 'template'.
 */
export interface TemplateSummary {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  aspect?: string;
}

const files = import.meta.glob<Record<string, any>>('../../templates/*.json', { eager: true, import: 'default' });

export async function loadTemplates(): Promise<TemplateSummary[]> {
  return Object.entries(files)
    .filter(([path, t]) => !path.endsWith('.schema.json') && t && t.id && t.name)
    .map(([, t]) => ({
      id: String(t.id), name: String(t.name), description: t.description, category: t.category,
      tags: Array.isArray(t.tags) ? t.tags : undefined, aspect: t.format?.aspect,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
