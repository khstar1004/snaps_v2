import type { PublishMetadata } from "@/lib/publish/category-metadata";
import type { TemplateBrandingSettings } from "@/lib/publish/template-branding";
import { selectSupabaseRows, tryInsertSupabaseRows } from "@/lib/supabase/server";
import type { PublishCategory } from "@/lib/publish/types";
import type { StudioTemplateId } from "@/types/studio-template";

type PublishCategoryVersionRow = {
  id: string;
  user_id: string;
  category_key: string;
  section: "metadata" | "branding";
  template_id?: string | null;
  payload_json: unknown;
  created_by?: string | null;
  created_at_ms: number;
};

export type CategoryVersionHistoryEntry = {
  id: string;
  category: PublishCategory;
  section: "metadata" | "branding";
  templateId: StudioTemplateId | null;
  createdBy: string | null;
  createdAt: number;
  payload: PublishMetadata | TemplateBrandingSettings;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isMissingHistoryTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('relation "public.publish_category_versions" does not exist') ||
    message.includes('relation "publish_category_versions" does not exist')
  );
}

function createVersionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function appendCategoryVersionHistory(input: {
  userId: string;
  category: PublishCategory;
  section: "metadata" | "branding";
  payload: PublishMetadata | TemplateBrandingSettings;
  templateId?: StudioTemplateId | null;
  createdBy?: string | null;
}): Promise<void> {
  const category = asString(input.category);
  if (!category) return;

  const row: PublishCategoryVersionRow = {
    id: createVersionId(),
    user_id: asString(input.userId),
    category_key: category,
    section: input.section,
    template_id: input.section === "metadata" ? asString(input.templateId) || null : null,
    payload_json: input.payload,
    created_by: asString(input.createdBy) || null,
    created_at_ms: Date.now(),
  };

  try {
    await tryInsertSupabaseRows<PublishCategoryVersionRow>("publish_category_versions", [row], {
      onConflict: "id",
      returning: false,
    });
  } catch (error) {
    if (isMissingHistoryTableError(error)) return;
    throw error;
  }
}

export async function listCategoryVersionHistory(input: {
  userId: string;
  category: PublishCategory;
  section: "metadata" | "branding";
  templateId?: StudioTemplateId | null;
  limit?: number;
}): Promise<CategoryVersionHistoryEntry[]> {
  try {
    const rows = await selectSupabaseRows<PublishCategoryVersionRow>("publish_category_versions", {
      filters: {
        user_id: asString(input.userId),
        category_key: asString(input.category),
        section: input.section,
        template_id: input.section === "metadata" ? asString(input.templateId) || null : null,
      },
      orderBy: {
        column: "created_at_ms",
        ascending: false,
      },
      limit: Math.max(1, Math.min(200, Math.floor(input.limit ?? 30))),
    });
    return rows.map((row) => ({
      id: row.id,
      category: row.category_key,
      section: row.section,
      templateId: asString(row.template_id) ? (row.template_id as StudioTemplateId) : null,
      createdBy: asString(row.created_by) || null,
      createdAt: row.created_at_ms,
      payload: row.payload_json as PublishMetadata | TemplateBrandingSettings,
    }));
  } catch (error) {
    if (isMissingHistoryTableError(error)) return [];
    throw error;
  }
}

export async function getCategoryVersionHistoryEntry(input: {
  userId: string;
  category: PublishCategory;
  section: "metadata" | "branding";
  versionId: string;
}): Promise<CategoryVersionHistoryEntry | null> {
  try {
    const rows = await selectSupabaseRows<PublishCategoryVersionRow>("publish_category_versions", {
      filters: {
        user_id: asString(input.userId),
        category_key: asString(input.category),
        section: input.section,
        id: asString(input.versionId),
      },
      limit: 1,
    });
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      category: row.category_key,
      section: row.section,
      templateId: asString(row.template_id) ? (row.template_id as StudioTemplateId) : null,
      createdBy: asString(row.created_by) || null,
      createdAt: row.created_at_ms,
      payload: row.payload_json as PublishMetadata | TemplateBrandingSettings,
    };
  } catch (error) {
    if (isMissingHistoryTableError(error)) return null;
    throw error;
  }
}
