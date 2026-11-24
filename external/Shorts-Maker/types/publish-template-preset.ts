import type { StudioTemplateId, StudioTemplatePayload } from "./studio-template";

export type TemplateLayoutRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type TemplateImageLayoutPreset = {
  headerTitleSlot: TemplateLayoutRect;
  headerAccentSlot: TemplateLayoutRect;
  titleSlot: TemplateLayoutRect;
  bodySlot: TemplateLayoutRect;
  imageSlot: TemplateLayoutRect;
  infoSlot: TemplateLayoutRect;
  titleColor: string;
  bodyColor: string;
  infoColor: string;
  titleAlign: "left" | "center" | "right";
  bodyAlign: "left" | "center" | "right";
  headerSize: number;
  titleSize: number;
  bodySize: number;
  infoSize: number;
};

export type TemplateLayoutApplyPreset = {
  title: boolean;
  body: boolean;
  image: boolean;
  info: boolean;
};

export type PublishCategoryTemplatePreset = {
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
  templateImageEnabled: boolean;
  templateImageUrl: string;
  templateImageLayout: TemplateImageLayoutPreset;
  templateLayoutApply: TemplateLayoutApplyPreset;
  templateLayoutJson?: string;
};
