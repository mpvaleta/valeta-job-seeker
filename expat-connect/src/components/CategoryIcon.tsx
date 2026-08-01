import {
  Stethoscope, Smile, Brain, Scale, Compass, Calculator, ShieldCheck,
  Scissors, Home, BookOpen, HeartPulse, Wrench, Briefcase, type LucideIcon
} from 'lucide-react';

// Maps a category slug to an icon. Falls back to a generic icon for any
// category added later that isn't in this map yet — never breaks the grid.
const ICONS: Record<string, LucideIcon> = {
  doctors: Stethoscope,
  dentists: Smile,
  therapists: Brain,
  lawyers: Scale,
  immigration: Compass,
  accountants: Calculator,
  insurance: ShieldCheck,
  beauty: Scissors,
  realestate: Home,
  education: BookOpen,
  gynecologists: HeartPulse,
  services: Wrench
};

export default function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = ICONS[slug] ?? Briefcase;
  return <Icon className={className} strokeWidth={1.75} />;
}
