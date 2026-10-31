/**
 * Templates (planned): a template is a ready-made "edit recipe" — pacing, transitions, grade,
 * captions, music and SFX — that the AI applies to the user's own clips.
 *
 * M1 only reserves the tab. Template JSON files are dropped into `public/templates/`
 * (with an `index.json` listing them); this loader shows whatever is there. Applying a
 * template arrives with the AI editor (M4) and writes ops with actor 'template'.
 */
export interface TemplateSummary {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  [k: string]: unknown;
}

export async function loadTemplates(): Promise<TemplateSummary[]> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}templates/index.json`, { cache: 'no-cache' });
    if (!r.ok) return [];
    const j = await r.json();
    const list = Array.isArray(j) ? j : Array.isArray(j?.templates) ? j.templates : [];
    return list.filter((t: any) => t && (t.id || t.name)).map((t: any) => ({ ...t, id: String(t.id ?? t.name), name: String(t.name ?? t.id) }));
  } catch {
    return [];
  }
}
