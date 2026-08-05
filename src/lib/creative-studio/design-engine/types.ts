/* eslint-disable @typescript-eslint/no-explicit-any */
export type DesignOutputType =
  | 'feed_post'       // 1080x1350
  | 'story'           // 1080x1920
  | 'carousel'        // 1080x1350 x N
  | 'banner'          // 1200x628
  | 'website_hero'    // 1920x600
  | 'google_display'  // 300x250
  | 'reel_cover';     // 1080x1920

export type DesignLayoutType =
  | 'editorial' | 'luxury' | 'minimal' | 'sales' | 'corporate'
  | 'real_estate_premium' | 'magazine' | 'modern_tech'
  | 'split_layout' | 'hero_image' | 'offer_layout';

export type DesignElementType =
  | 'image' | 'headline' | 'subtitle' | 'body_text'
  | 'cta_button' | 'logo' | 'badge' | 'divider'
  | 'feature_list' | 'contact_block' | 'offer_block'
  | 'statistic_block' | 'testimonial_block' | 'property_highlights'
  | 'agent_block' | 'map_block' | 'project_details'
  | 'shape' | 'overlay';

export type DesignSetStatus = 'draft' | 'generating' | 'ready' | 'approved' | 'rejected' | 'archived';

export interface DesignElementStyle {
  backgroundColor?: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: 'right' | 'center' | 'left';
  borderRadius?: number;
  padding?: number;
  border?: string;
  shadow?: string;
  opacity?: number;
  gradient?: string;
}

export interface DesignElement {
  id: string;
  type: DesignElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  visible: boolean;
  rotation: number;
  props: Record<string, any>;
  style: DesignElementStyle;
}

export interface DesignCanvas {
  width: number;
  height: number;
  backgroundColor: string;
  backgroundImage?: string;
  backgroundGradient?: string;
  backgroundOverlay?: string;
}

export interface DesignJSON {
  version: string;
  canvas: DesignCanvas;
  elements: DesignElement[];
  metadata: {
    layoutType: DesignLayoutType;
    designType: DesignOutputType;
    brandDNAApplied: boolean;
    generatedBy: string;
    conceptId?: string;
    entityType?: string;
    entityId?: string;
  };
}

export interface DesignScore {
  brandMatch: number;
  readability: number;
  mobileReadability: number;
  visualHierarchy: number;
  conversionPotential: number;
  overall: number;
}
