/**
 * ZONO design system — single import surface.
 * Usage: `import { Button, PropertyCard, ScoreCard } from "@/components";`
 */

// UI primitives
export { Button } from "./ui/Button";
export type { ButtonProps } from "./ui/Button";
export { Card, CardHeader, CardTitle, CardBody } from "./ui/Card";
export type { CardProps } from "./ui/Card";
export { Badge } from "./ui/Badge";
export type { BadgeProps, BadgeTone } from "./ui/Badge";
export { SectionHeader } from "./ui/SectionHeader";
export type { SectionHeaderProps } from "./ui/SectionHeader";

// Domain components
export { ScoreCard } from "./domain/ScoreCard";
export type { ScoreCardProps } from "./domain/ScoreCard";
export { PropertyCard } from "./domain/PropertyCard";
export type { PropertyCardProps } from "./domain/PropertyCard";
export { OpportunityCard } from "./domain/OpportunityCard";
export type { OpportunityCardProps } from "./domain/OpportunityCard";
export { MatchCard } from "./domain/MatchCard";
export type { MatchCardProps } from "./domain/MatchCard";
export { ZonoAssistantBubble } from "./domain/ZonoAssistantBubble";
export type { ZonoAssistantBubbleProps } from "./domain/ZonoAssistantBubble";
export { JourneyTimeline } from "./domain/JourneyTimeline";
export type { JourneyTimelineProps } from "./domain/JourneyTimeline";
